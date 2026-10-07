// The encryption of the files of a FilesBlock (core/types.ts): AES-256-GCM, the key derived from the
// password with PBKDF2 (SHA-256). WebCrypto only - no library, nothing to trust but the browser.
//
// ONE source for the editor (which encrypts when the author sets a password) and the player (which decrypts
// when the learner enters it): the editor imports it like any module (see filesCrypto.d.ts); the exported
// player gets this very file embedded - buildRuntimeHtml.ts strips the `export`s. So: plain top-level
// declarations only, no imports, nothing newer than the player's own syntax.
//
// What is stored: per block a random salt, the iteration count and a "verifier" - a short known text,
// encrypted - so that a password can be checked without any file; per file, its bytes as
// [12 bytes IV][ciphertext + 16 bytes GCM tag]. The password itself is never stored anywhere. A wrong
// password makes decrypting fail (GCM authenticates), which is what filesCheckPassword relies on.

var FILES_ITERATIONS = 200000;
var FILES_VERIFIER_TEXT = "weft-files-v1";

export function filesCryptoAvailable() {
  return typeof crypto !== "undefined" && !!crypto.subtle && typeof crypto.getRandomValues === "function";
}

function filesToBase64(bytes) {
  var text = "";
  for (var i = 0; i < bytes.length; i += 4096) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 4096));
  return btoa(text);
}

function filesFromBase64(base64) {
  var text = atob(base64);
  var bytes = new Uint8Array(text.length);
  for (var i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}

async function filesDeriveKey(password, saltBase64, iterations) {
  var material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: filesFromBase64(saltBase64), iterations: iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// The bytes, encrypted: a fresh IV in front of the ciphertext.
export async function filesEncrypt(key, bytes) {
  var iv = crypto.getRandomValues(new Uint8Array(12));
  var encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, bytes));
  var result = new Uint8Array(12 + encrypted.length);
  result.set(iv, 0);
  result.set(encrypted, 12);
  return result;
}

// The bytes of filesEncrypt, decrypted; rejects if the key is wrong or the data was changed.
export async function filesDecrypt(key, bytes) {
  var data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: data.subarray(0, 12) }, key, data.subarray(12)));
}

// A new protection for a password: { protection: { salt, iterations, verifier }, key }.
export async function filesCreateProtection(password) {
  var salt = filesToBase64(crypto.getRandomValues(new Uint8Array(16)));
  var key = await filesDeriveKey(password, salt, FILES_ITERATIONS);
  var verifier = filesToBase64(await filesEncrypt(key, new TextEncoder().encode(FILES_VERIFIER_TEXT)));
  return { protection: { salt: salt, iterations: FILES_ITERATIONS, verifier: verifier }, key: key };
}

// The key for `password` if it is the one of `protection`, else null.
export async function filesCheckPassword(protection, password) {
  try {
    var key = await filesDeriveKey(password, protection.salt, protection.iterations);
    var text = new TextDecoder().decode(await filesDecrypt(key, filesFromBase64(protection.verifier)));
    return text === FILES_VERIFIER_TEXT ? key : null;
  } catch (e) {
    return null;
  }
}
