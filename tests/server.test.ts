import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../server/src/app.ts";
import { configFromEnv } from "../server/src/config.ts";
import { TOKEN_ISSUER, signToken, verifyToken } from "../server/src/token.ts";
import { turnCredentials } from "../server/src/turn.ts";
import type { Verifier } from "../server/src/verify.ts";

const BASE_ENV = {
  HOST: "127.0.0.1",
  WEFT_CLOUD_DEV: "1",
  WEFT_CLOUD_TOKEN_SECRET: "test-secret",
  TURN_SECRET: "turn-secret",
  TURN_URLS: "turn:t.example:3478?transport=udp, turn:t.example:3478?transport=tcp",
};
const config = (extra: Record<string, string | undefined> = {}) => configFromEnv({ ...BASE_ENV, ...extra });

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

/** The server of Weft Cloud, really listening (on a free port of this computer). */
async function start(cfg = config(), verifiers?: Record<string, Verifier | undefined>, clock?: () => number) {
  const server = createApp(cfg, verifiers, clock);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  closers.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(url + path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
  const get = (path: string, headers: Record<string, string> = {}) => fetch(url + path, { headers });
  const session = async (proof = "dev-pro:Mara", headers: Record<string, string> = {}) => post("/v1/session", { store: "dev", proof }, headers);
  return { url, post, get, session };
}

const NOW = Date.UTC(2026, 10, 13, 12, 0, 0);

describe("tokens", () => {
  const payload = { iss: TOKEN_ISSUER, sub: "abc", pro: true, proUntil: null, iat: 1000, exp: 2000 };

  it("are signed and read back, until they run out", () => {
    const token = signToken(payload, "secret");
    expect(verifyToken(token, "secret", 1500)).toEqual(payload);
    expect(verifyToken(token, "secret", 2000)).toBeNull();
  });

  it("are not believed when changed, signed with another secret, or made with another algorithm", () => {
    const token = signToken(payload, "secret");
    const [header, body, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...payload, sub: "somebody else" })).toString("base64url");
    expect(verifyToken(`${header}.${forged}.${signature}`, "secret", 1500)).toBeNull();
    expect(verifyToken(token, "another secret", 1500)).toBeNull();
    const none = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    expect(verifyToken(`${none}.${body}.`, "secret", 1500)).toBeNull();
    expect(verifyToken("not a token", "secret", 1500)).toBeNull();
    expect(verifyToken("", "secret", 1500)).toBeNull();
  });
});

describe("TURN credentials", () => {
  it("are what coturn's REST API (use-auth-secret) computes", () => {
    const credentials = turnCredentials("turn-secret", "0123456789abcdef0123456789abcdef", 1_000_000, 86_400);
    expect(credentials.username).toBe("1086400:0123456789abcdef");
    expect(credentials.credential).toBe(createHmac("sha1", "turn-secret").update("1086400:0123456789abcdef").digest("base64"));
    expect(credentials.ttl).toBe(86_400);
  });
});

describe("settings", () => {
  it("need a secret for the tokens, and a long one outside development", () => {
    expect(() => configFromEnv({})).toThrow(/WEFT_CLOUD_TOKEN_SECRET/);
    expect(() => configFromEnv({ WEFT_CLOUD_TOKEN_SECRET: "short" })).toThrow(/too short/);
    expect(configFromEnv({ WEFT_CLOUD_TOKEN_SECRET: "x".repeat(32) }).dev).toBe(false);
  });

  it("do not allow the development store anywhere but on this computer's own address", () => {
    expect(() => configFromEnv({ ...BASE_ENV, HOST: "0.0.0.0" })).toThrow(/only allowed with HOST=127.0.0.1/);
    expect(() => configFromEnv({ WEFT_CLOUD_DEV: "1", WEFT_CLOUD_TOKEN_SECRET: "x" })).toThrow(/only allowed with HOST=127.0.0.1/);
    expect(configFromEnv({ ...BASE_ENV, HOST: "::1" }).dev).toBe(true);
    // (without the development store any address is fine - that is how it runs in the container)
    expect(configFromEnv({ WEFT_CLOUD_TOKEN_SECRET: "x".repeat(32), HOST: "0.0.0.0" }).host).toBe("0.0.0.0");
  });

  it("want an address for the TURN server when there is a secret for it", () => {
    expect(() => configFromEnv({ ...BASE_ENV, TURN_URLS: "" })).toThrow(/TURN_URLS/);
    expect(() => configFromEnv({ WEFT_CLOUD_TOKEN_SECRET: "x".repeat(32), TURN_SECRET: "short", TURN_URLS: "turn:a:3478" })).toThrow(/TURN_SECRET/);
    expect(config().turn?.urls).toEqual(["turn:t.example:3478?transport=udp", "turn:t.example:3478?transport=tcp"]);
    expect(config({ TURN_SECRET: undefined, TURN_URLS: undefined }).turn).toBeNull();
  });
});

describe("the server", () => {
  it("answers /health, preflight requests and what it does not know", async () => {
    const { get, url, post } = await start();
    expect(await (await get("/health")).json()).toEqual({ ok: true });
    const preflight = await fetch(`${url}/v1/turn`, { method: "OPTIONS" });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
    expect(preflight.headers.get("access-control-allow-headers")).toContain("Authorization");
    expect((await get("/nothing")).status).toBe(404);
    const wrong = await get("/v1/session");
    expect(wrong.status).toBe(405);
    expect(wrong.headers.get("allow")).toBe("POST");
    expect((await post("/health", {})).status).toBe(405);
  });
});

describe("sessions", () => {
  it("a subscriber gets a token that says so - with a pseudonym, not the name", async () => {
    const { session } = await start(config(), undefined, () => NOW);
    const response = await session("dev-pro:Mara");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { token: string; expiresAt: number; proUntil: number };
    const payload = verifyToken(body.token, "test-secret", Math.floor(NOW / 1000));
    expect(payload).toMatchObject({ iss: TOKEN_ISSUER, pro: true });
    expect(payload?.sub).toMatch(/^[0-9a-f]{32}$/);
    expect(payload?.sub).not.toContain("Mara");
    expect(body.expiresAt).toBe(NOW + 3600 * 1000);
    expect(body.proUntil).toBe(NOW + 30 * 24 * 3600 * 1000);
    // the same person is the same subscriber the next time
    const again = (await (await session("dev-pro:Mara")).json()) as { token: string };
    expect(verifyToken(again.token, "test-secret", Math.floor(NOW / 1000))?.sub).toBe(payload?.sub);
  });

  it("someone without a subscription is turned away (402)", async () => {
    const { session } = await start();
    const response = await session("dev-free:Mara");
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({ error: "no_subscription" });
  });

  it("the stores that are not built yet say so (501), unknown ones and strange names are refused (400)", async () => {
    const { post } = await start();
    for (const store of ["apple", "microsoft", "google"]) {
      const response = await post("/v1/session", { store, proof: "x" });
      expect(response.status, store).toBe(501);
      expect(await response.json()).toEqual({ error: "store_not_supported_yet" });
    }
    for (const store of ["nonsense", "constructor", "__proto__", "toString"]) {
      const response = await post("/v1/session", { store, proof: "x" });
      expect(response.status, store).toBe(400);
      expect(await response.json()).toEqual({ error: "unknown_store" });
    }
  });

  it("the development store does not exist when the server is not started for development", async () => {
    const { post } = await start(config({ WEFT_CLOUD_DEV: "0", WEFT_CLOUD_TOKEN_SECRET: "x".repeat(32), TURN_SECRET: "y".repeat(32) }));
    const response = await post("/v1/session", { store: "dev", proof: "dev-pro:Mara" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "unknown_store" });
  });

  it("bad requests are told apart: no JSON, wrong shape, too big", async () => {
    const { post } = await start();
    expect((await post("/v1/session", "{not json")).status).toBe(400);
    expect((await post("/v1/session", { store: "dev" })).status).toBe(400);
    expect((await post("/v1/session", { store: 5, proof: "x" })).status).toBe(400);
    expect((await post("/v1/session", { store: "dev", proof: "" })).status).toBe(400);
    expect((await post("/v1/session", { store: "dev", proof: "x".repeat(9000) })).status).toBe(400);
    const huge = await post("/v1/session", { store: "dev", proof: "x".repeat(20_000) });
    expect(huge.status).toBe(413);
  });

  it("a token does not outlive the paid time, and a subscription that has ended is no session", async () => {
    const soon: Verifier = async (_proof, now) => ({ subject: "s", proUntil: now + 600_000 });
    const over: Verifier = async (_proof, now) => ({ subject: "s", proUntil: now - 1 });
    const { post } = await start(config(), { dev: soon, old: over }, () => NOW);
    const ok = (await (await post("/v1/session", { store: "dev", proof: "x" })).json()) as { expiresAt: number };
    expect(ok.expiresAt).toBe(NOW + 600_000);
    expect((await post("/v1/session", { store: "old", proof: "x" })).status).toBe(402);
  });

  it("are limited per address - and the limit is over after a minute", async () => {
    let now = NOW;
    const { session } = await start(config({ SESSIONS_PER_MINUTE: "3" }), undefined, () => now);
    for (let i = 0; i < 3; i++) expect((await session()).status).toBe(200);
    const refused = await session();
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toBe("60");
    now += 61_000;
    expect((await session()).status).toBe(200);
  });

  it("the address behind a proxy is the one the proxy put last, and only if the proxy is trusted", async () => {
    const trusted = await start(config({ SESSIONS_PER_MINUTE: "1", TRUST_PROXY: "1" }));
    // (a client can write anything in front: only the last entry counts)
    expect((await trusted.session("dev-pro:a", { "X-Forwarded-For": "1.1.1.1, 10.0.0.1" })).status).toBe(200);
    expect((await trusted.session("dev-pro:a", { "X-Forwarded-For": "2.2.2.2, 10.0.0.1" })).status).toBe(429);
    expect((await trusted.session("dev-pro:a", { "X-Forwarded-For": "2.2.2.2, 10.0.0.2" })).status).toBe(200);
    const direct = await start(config({ SESSIONS_PER_MINUTE: "1" }));
    expect((await direct.session("dev-pro:a", { "X-Forwarded-For": "1.1.1.1" })).status).toBe(200);
    expect((await direct.session("dev-pro:a", { "X-Forwarded-For": "9.9.9.9" })).status).toBe(429);
  });
});

describe("TURN access", () => {
  const tokenOf = async (s: Awaited<ReturnType<typeof start>>) => ((await (await s.session()).json()) as { token: string }).token;

  it("a subscriber gets credentials that coturn accepts", async () => {
    const s = await start(config(), undefined, () => NOW);
    const response = await s.get("/v1/turn", { Authorization: `Bearer ${await tokenOf(s)}` });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { urls: string[]; username: string; credential: string; ttl: number };
    expect(body.urls).toHaveLength(2);
    expect(body.ttl).toBe(86_400);
    expect(body.username).toMatch(new RegExp(`^${Math.floor(NOW / 1000) + 86_400}:[0-9a-f]{16}$`));
    expect(body.credential).toBe(createHmac("sha1", "turn-secret").update(body.username).digest("base64"));
  });

  it("nobody without a token, with a wrong one, or with one that has run out", async () => {
    let now = NOW;
    const s = await start(config(), undefined, () => now);
    expect((await s.get("/v1/turn")).status).toBe(401);
    expect((await s.get("/v1/turn", { Authorization: "Bearer nonsense" })).status).toBe(401);
    expect((await s.get("/v1/turn", { Authorization: "Basic abc" })).status).toBe(401);
    const foreign = signToken({ iss: TOKEN_ISSUER, sub: "s", pro: true, proUntil: null, iat: Math.floor(NOW / 1000), exp: Math.floor(NOW / 1000) + 3600 }, "another secret");
    expect((await s.get("/v1/turn", { Authorization: `Bearer ${foreign}` })).status).toBe(401);
    const token = await tokenOf(s);
    now += 3601 * 1000;
    expect((await s.get("/v1/turn", { Authorization: `Bearer ${token}` })).status).toBe(401);
  });

  it("a token of someone who is not Pro is no use (402)", async () => {
    const s = await start(config(), undefined, () => NOW);
    const free = signToken({ iss: TOKEN_ISSUER, sub: "s", pro: false, proUntil: null, iat: Math.floor(NOW / 1000), exp: Math.floor(NOW / 1000) + 3600 }, "test-secret");
    expect((await s.get("/v1/turn", { Authorization: `Bearer ${free}` })).status).toBe(402);
  });

  it("says so when no TURN server is set up (503)", async () => {
    const s = await start(config({ TURN_SECRET: undefined, TURN_URLS: undefined }), undefined, () => NOW);
    const response = await s.get("/v1/turn", { Authorization: `Bearer ${await tokenOf(s)}` });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "turn_not_configured" });
  });
});
