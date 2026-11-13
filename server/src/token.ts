import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The token the app gets for a session: a JWT (HS256) that says who the subscriber is (`sub`, a pseudonym made of the store's id - never the id itself) and that
 * the subscription runs (`pro`, until `proUntil`). The services check the token and nothing else; the stores are only asked when a session is made.
 */
export interface TokenPayload {
  iss: string;
  sub: string;
  pro: boolean;
  /** ms since 1970 when the paid time ends, null if the store did not say. */
  proUntil: number | null;
  /** Seconds since 1970. */
  iat: number;
  exp: number;
}

export const TOKEN_ISSUER = "weft-cloud";
const HEADER = { alg: "HS256", typ: "JWT" };

const b64 = (value: Buffer | string) => Buffer.from(value).toString("base64url");

function mac(data: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(data).digest();
}

export function signToken(payload: TokenPayload, secret: string): string {
  const body = `${b64(JSON.stringify(HEADER))}.${b64(JSON.stringify(payload))}`;
  return `${body}.${b64(mac(body, secret))}`;
}

/** The payload of a token that is genuine and has not run out - else null (never throws). */
export function verifyToken(token: string, secret: string, nowSeconds: number): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  try {
    // only the algorithm we make ourselves (a token that says "none" or another one is not believed)
    const head = JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as { alg?: unknown };
    if (head.alg !== HEADER.alg) return null;
    const expected = mac(`${header}.${body}`, secret);
    const given = Buffer.from(signature, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<TokenPayload>;
    if (payload.iss !== TOKEN_ISSUER || typeof payload.sub !== "string" || typeof payload.pro !== "boolean") return null;
    if (typeof payload.iat !== "number" || typeof payload.exp !== "number" || payload.exp <= nowSeconds) return null;
    if (payload.proUntil !== null && typeof payload.proUntil !== "number") return null;
    return payload as TokenPayload;
  } catch {
    return null;
  }
}
