import type { FilesProtection } from "../types";

/** Whether this browser can encrypt/decrypt at all (WebCrypto needs a secure context: https, localhost, file). */
export function filesCryptoAvailable(): boolean;
/** The bytes, encrypted: [12 bytes IV][ciphertext + tag]. */
export function filesEncrypt(key: CryptoKey, bytes: Uint8Array): Promise<Uint8Array>;
/** The bytes of filesEncrypt, decrypted; rejects for a wrong key or changed data. */
export function filesDecrypt(key: CryptoKey, bytes: Uint8Array | ArrayBuffer): Promise<Uint8Array>;
/** A new protection (salt, iterations, verifier) for a password, and its key. */
export function filesCreateProtection(password: string): Promise<{ protection: FilesProtection; key: CryptoKey }>;
/** The key for `password` if it is the one of `protection`, else null. */
export function filesCheckPassword(protection: FilesProtection, password: string): Promise<CryptoKey | null>;
