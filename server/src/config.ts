/**
 * The settings of Weft Cloud, all from the environment (server/.env.example says what each one is). A wrong setting stops the start with a clear message
 * instead of running half-configured.
 */
export interface TurnConfig {
  /** The shared secret of coturn (`static-auth-secret`): the credentials are made from it, never sent to the apps. */
  secret: string;
  /** What the app is told to use, e.g. `turn:turn.townwork.eu:3478?transport=udp`. */
  urls: string[];
  /** How long the credentials work (coturn checks the end at every request, also when an allocation is renewed: a call must not be longer than this). */
  ttlSeconds: number;
}

export interface Config {
  host: string;
  port: number;
  /** Signs the tokens (HS256). */
  tokenSecret: string;
  /** How long a token works; the app asks again with the proof of its store. */
  tokenTtlSeconds: number;
  /** Development: the store "dev" is accepted (proof `dev-pro:<name>`). Never in production. */
  dev: boolean;
  /** The server stands behind a reverse proxy (Caddy) that puts the address of the client last in `X-Forwarded-For`. */
  trustProxy: boolean;
  /** Requests for a session per address and minute. */
  sessionsPerMinute: number;
  turn: TurnConfig | null;
}

export function configFromEnv(env: Record<string, string | undefined>): Config {
  const dev = env.WEFT_CLOUD_DEV === "1";
  const tokenSecret = env.WEFT_CLOUD_TOKEN_SECRET ?? "";
  if (!tokenSecret) throw new Error("WEFT_CLOUD_TOKEN_SECRET is not set (make one with: openssl rand -hex 32)");
  if (!dev && tokenSecret.length < 32) throw new Error("WEFT_CLOUD_TOKEN_SECRET is too short: 32 characters at least (openssl rand -hex 32)");

  // The store "dev" accepts anybody as a subscriber: it must never be reachable from outside - so it only starts on this computer's own address.
  const host = env.HOST ?? "0.0.0.0";
  if (dev && !["127.0.0.1", "::1", "localhost"].includes(host)) throw new Error("WEFT_CLOUD_DEV=1 is only allowed with HOST=127.0.0.1 (the store 'dev' accepts anybody)");

  const turnSecret = env.TURN_SECRET ?? "";
  const turnUrls = (env.TURN_URLS ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  if (turnSecret && !dev && turnSecret.length < 32) throw new Error("TURN_SECRET is too short: 32 characters at least (openssl rand -hex 32)");
  if (turnSecret && turnUrls.length === 0) throw new Error("TURN_SECRET is set, but TURN_URLS is empty");

  return {
    host,
    port: Number(env.PORT ?? 8080),
    tokenSecret,
    tokenTtlSeconds: Number(env.WEFT_CLOUD_TOKEN_TTL ?? 3600),
    dev,
    trustProxy: env.TRUST_PROXY === "1",
    sessionsPerMinute: Number(env.SESSIONS_PER_MINUTE ?? 20),
    turn: turnSecret ? { secret: turnSecret, urls: turnUrls, ttlSeconds: Number(env.TURN_TTL ?? 24 * 3600) } : null,
  };
}
