import { createHmac } from "node:crypto";

/**
 * Credentials for coturn's REST API (`use-auth-secret`): the user name is "<end>:<who>" - the end as seconds since 1970 - and the password the HMAC-SHA1 of that
 * user name with the shared secret, in base64. coturn makes the same sum itself and so needs no list of users: nothing is stored, a credential just stops
 * working at its end.
 */
export interface TurnCredentials {
  username: string;
  credential: string;
  ttl: number;
}

export function turnCredentials(secret: string, subject: string, nowSeconds: number, ttlSeconds: number): TurnCredentials {
  const username = `${nowSeconds + ttlSeconds}:${subject.slice(0, 16)}`;
  const credential = createHmac("sha1", secret).update(username).digest("base64");
  return { username, credential, ttl: ttlSeconds };
}
