import type { FilesProtection } from "../types";

/** A key made from a password: the raw bytes, and the same as a WebCrypto key where the browser has WebCrypto. */
export interface FilesKey {
  raw: Uint8Array;
  subtle: CryptoKey | null;
}

/** Whether random bytes can be had at all (every browser, secure context or not). */
export function filesCryptoAvailable(): boolean;
/** Tests only: use the plain-JavaScript implementation even where WebCrypto exists. */
export function filesSetFallbackForTests(force: boolean): void;
export function filesDeriveKey(password: string, saltBase64: string, iterations: number): Promise<FilesKey>;
/** The bytes, encrypted: [12 bytes IV][ciphertext + tag]. */
export function filesEncrypt(key: FilesKey, bytes: Uint8Array): Promise<Uint8Array>;
/** The bytes of filesEncrypt, decrypted; rejects for a wrong key or changed data. */
export function filesDecrypt(key: FilesKey, bytes: Uint8Array | ArrayBuffer): Promise<Uint8Array>;
/** A new protection (salt, iterations, verifier) for a password, and its key. */
export function filesCreateProtection(password: string): Promise<{ protection: FilesProtection; key: FilesKey }>;
/** The key for `password` if it is the one of `protection`, else null. */
export function filesCheckPassword(protection: FilesProtection, password: string): Promise<FilesKey | null>;
