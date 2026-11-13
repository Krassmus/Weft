import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { Config } from "./config.ts";
import { RateLimiter } from "./rateLimit.ts";
import { TOKEN_ISSUER, signToken, verifyToken } from "./token.ts";
import { turnCredentials } from "./turn.ts";
import { StoreError, createVerifiers } from "./verify.ts";
import type { Verifier } from "./verify.ts";

/**
 * The requests of Weft Cloud (docs/server.md):
 *   GET  /health       alive?
 *   POST /v1/session   { store, proof } -> { token, expiresAt, proUntil }  - the proof of a purchase for a token (verify.ts); 402 when there is no subscription
 *   GET  /v1/turn      Authorization: Bearer <token> -> { urls, username, credential, ttl } - credentials for the TURN server
 * Nothing about a person is kept: no log of addresses (the brake in rateLimit.ts is in memory), no list of subscribers - the token is all the services look at.
 */
const MAX_BODY_BYTES = 16 * 1024;
const MAX_PROOF_CHARS = 8192;

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    // The app is a web view with its own origin (tauri://localhost, https://tauri.localhost, ...); it sends a token, never cookies - so any origin is fine.
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    ...headers,
  });
  res.end(status === 204 ? undefined : JSON.stringify(body));
}

/** The address a request comes from: behind the reverse proxy the last entry of X-Forwarded-For (the one the proxy itself put there), else the socket's. */
function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const header = req.headers["x-forwarded-for"];
    const last = (Array.isArray(header) ? header.join(",") : (header ?? ""))
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .pop();
    if (last) return last;
  }
  return req.socket.remoteAddress ?? "unknown";
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) reject(new StoreError(413, "too_large"));
      else chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new StoreError(400, "bad_json"));
      }
    });
    req.on("error", reject);
  });
}

export function createApp(config: Config, verifiers: Record<string, Verifier | undefined> = createVerifiers(config), clock: () => number = Date.now): Server {
  const sessions = new RateLimiter(config.sessionsPerMinute, 60_000);

  async function newSession(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!sessions.allow(clientIp(req, config.trustProxy), clock())) {
      send(res, 429, { error: "too_many_requests" }, { "Retry-After": "60" });
      return;
    }
    const body = (await readJson(req)) as { store?: unknown; proof?: unknown } | null;
    const store = body && typeof body.store === "string" ? body.store : null;
    const proof = body && typeof body.proof === "string" ? body.proof : null;
    if (store === null || proof === null || proof.length === 0 || proof.length > MAX_PROOF_CHARS) throw new StoreError(400, "bad_request");
    // (own entries only: a store called "constructor" must not find anything)
    const verify = Object.hasOwn(verifiers, store) ? verifiers[store] : undefined;
    if (!verify) throw new StoreError(400, "unknown_store");

    const now = clock();
    const entitlement = await verify(proof, now);
    if (entitlement.proUntil !== null && entitlement.proUntil <= now) throw new StoreError(402, "no_subscription");
    const iat = Math.floor(now / 1000);
    // (a token does not outlive the paid time)
    const exp = Math.min(iat + config.tokenTtlSeconds, entitlement.proUntil === null ? Infinity : Math.floor(entitlement.proUntil / 1000));
    const token = signToken({ iss: TOKEN_ISSUER, sub: entitlement.subject, pro: true, proUntil: entitlement.proUntil, iat, exp }, config.tokenSecret);
    send(res, 200, { token, expiresAt: exp * 1000, proUntil: entitlement.proUntil });
  }

  function turn(req: IncomingMessage, res: ServerResponse): void {
    const now = clock();
    const match = /^Bearer (\S+)$/.exec(req.headers.authorization ?? "");
    const payload = match ? verifyToken(match[1], config.tokenSecret, Math.floor(now / 1000)) : null;
    if (!payload) throw new StoreError(401, "invalid_token");
    if (!payload.pro || (payload.proUntil !== null && payload.proUntil <= now)) throw new StoreError(402, "no_subscription");
    if (!config.turn) throw new StoreError(503, "turn_not_configured");
    const credentials = turnCredentials(config.turn.secret, payload.sub, Math.floor(now / 1000), config.turn.ttlSeconds);
    send(res, 200, { urls: config.turn.urls, ...credentials });
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    const method = req.method ?? "GET";
    if (method === "OPTIONS") return send(res, 204, null);
    const routes: Record<string, { method: string; run: () => void | Promise<void> }> = {
      "/health": { method: "GET", run: () => send(res, 200, { ok: true }) },
      "/v1/session": { method: "POST", run: () => newSession(req, res) },
      "/v1/turn": { method: "GET", run: () => turn(req, res) },
    };
    const route = Object.hasOwn(routes, path) ? routes[path] : undefined;
    if (!route) return send(res, 404, { error: "not_found" });
    if (route.method !== method) return send(res, 405, { error: "method_not_allowed" }, { Allow: route.method });
    await route.run();
  }

  return createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      if (error instanceof StoreError) {
        send(res, error.status, { error: error.code }, error.status === 413 ? { Connection: "close" } : {});
        // (a body that is too big is not read on: the connection is closed once the answer is out)
        if (error.status === 413) res.once("finish", () => req.destroy());
      } else {
        send(res, 500, { error: "internal" });
      }
    });
  });
}
