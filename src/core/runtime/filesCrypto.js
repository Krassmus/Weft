// The encryption of the files of a FilesBlock (core/types.ts): AES-256-GCM, the key derived from the
// password with PBKDF2 (SHA-256).
//
// Where the browser offers WebCrypto (crypto.subtle) it is used. WebCrypto exists only in a "secure context"
// (https, localhost, a local file) - a module an LMS serves over plain http, or a classroom server on the local
// network, has none. So everything is also implemented here in plain JavaScript (SHA-256, PBKDF2, AES, GCM),
// byte for byte the same results, just slower: the fallback is used when crypto.subtle is missing.
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
var filesForceFallback = false;

// Only for tests: use the plain-JavaScript implementation even where WebCrypto exists.
export function filesSetFallbackForTests(force) {
  filesForceFallback = !!force;
}

function filesHasSubtle() {
  return !filesForceFallback && typeof crypto !== "undefined" && !!crypto.subtle;
}

// Random bytes are available everywhere (also outside secure contexts).
export function filesCryptoAvailable() {
  return typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function";
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

// ---- SHA-256, HMAC, PBKDF2 (plain JavaScript) ----------------------------------------------------------------

var SHA_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
var SHA_INIT = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
var SHA_W = new Uint32Array(64);

function shaRotr(x, n) {
  return (x >>> n) | (x << (32 - n));
}

// One block (16 big-endian words) into the state `h` (8 words).
function shaBlock(h, words) {
  var w = SHA_W;
  var i;
  for (i = 0; i < 16; i++) w[i] = words[i];
  for (i = 16; i < 64; i++) {
    var s0 = shaRotr(w[i - 15], 7) ^ shaRotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
    var s1 = shaRotr(w[i - 2], 17) ^ shaRotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
    w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
  }
  var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
  for (i = 0; i < 64; i++) {
    var t1 = (hh + (shaRotr(e, 6) ^ shaRotr(e, 11) ^ shaRotr(e, 25)) + ((e & f) ^ (~e & g)) + SHA_K[i] + w[i]) | 0;
    var t2 = ((shaRotr(a, 2) ^ shaRotr(a, 13) ^ shaRotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
    hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
  }
  h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
  h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
}

function shaWordsOf(bytes, offset) {
  var words = new Uint32Array(16);
  for (var i = 0; i < 16; i++) {
    var p = offset + i * 4;
    words[i] = ((bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]) >>> 0;
  }
  return words;
}

// SHA-256 of `bytes`, continuing from `state` that has already taken `before` bytes; the 8 words of the result.
function shaFinish(state, bytes, before) {
  var h = new Uint32Array(state);
  var n = bytes.length;
  var padded = new Uint8Array(Math.ceil((n + 9) / 64) * 64);
  padded.set(bytes);
  padded[n] = 0x80;
  var bits = (before + n) * 8;
  var view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bits / 4294967296));
  view.setUint32(padded.length - 4, bits >>> 0);
  for (var offset = 0; offset < padded.length; offset += 64) shaBlock(h, shaWordsOf(padded, offset));
  return h;
}

function shaWordsToBytes(words) {
  var bytes = new Uint8Array(words.length * 4);
  for (var i = 0; i < words.length; i++) {
    bytes[i * 4] = words[i] >>> 24;
    bytes[i * 4 + 1] = words[i] >>> 16;
    bytes[i * 4 + 2] = words[i] >>> 8;
    bytes[i * 4 + 3] = words[i];
  }
  return bytes;
}

// PBKDF2-HMAC-SHA256, 32 bytes (one block). The two HMAC pads are hashed once; every round is then two blocks.
function filesPbkdf2Fallback(password, salt, iterations) {
  var key = new TextEncoder().encode(password);
  if (key.length > 64) key = shaWordsToBytes(shaFinish(SHA_INIT, key, 0));
  var inner = new Uint8Array(64);
  var outer = new Uint8Array(64);
  for (var i = 0; i < 64; i++) {
    var k = i < key.length ? key[i] : 0;
    inner[i] = k ^ 0x36;
    outer[i] = k ^ 0x5c;
  }
  var innerState = new Uint32Array(SHA_INIT);
  var outerState = new Uint32Array(SHA_INIT);
  shaBlock(innerState, shaWordsOf(inner, 0));
  shaBlock(outerState, shaWordsOf(outer, 0));

  var first = new Uint8Array(salt.length + 4);
  first.set(salt);
  first[first.length - 1] = 1;
  var u = shaFinish(outerState, shaWordsToBytes(shaFinish(innerState, first, 64)), 64);
  var t = new Uint32Array(u);
  var block = new Uint32Array(16);
  block[8] = 0x80000000;
  block[15] = (64 + 32) * 8;
  var h = new Uint32Array(8);
  for (var round = 1; round < iterations; round++) {
    h.set(innerState);
    block.set(u);
    shaBlock(h, block);
    block.set(h);
    h.set(outerState);
    shaBlock(h, block);
    u.set(h);
    for (var j = 0; j < 8; j++) t[j] ^= u[j];
  }
  return shaWordsToBytes(t);
}

// ---- AES-256 and GCM (plain JavaScript) ----------------------------------------------------------------------

var AES_SBOX = (function () {
  var sbox = new Uint8Array(256);
  var p = 1;
  var q = 1;
  do {
    p = p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0);
    q ^= q << 1;
    q ^= q << 2;
    q ^= q << 4;
    q &= 0xff;
    if (q & 0x80) q ^= 0x09;
    var x = q ^ ((q << 1) | (q >> 7)) ^ ((q << 2) | (q >> 6)) ^ ((q << 3) | (q >> 5)) ^ ((q << 4) | (q >> 4));
    sbox[p] = (x ^ 0x63) & 0xff;
  } while (p !== 1);
  sbox[0] = 0x63;
  return sbox;
})();

// The 15 round keys (240 bytes) of a 32-byte key.
function aesExpandKey(key) {
  var rk = new Uint8Array(240);
  rk.set(key);
  var rcon = 1;
  for (var i = 8; i < 60; i++) {
    var t0 = rk[(i - 1) * 4], t1 = rk[(i - 1) * 4 + 1], t2 = rk[(i - 1) * 4 + 2], t3 = rk[(i - 1) * 4 + 3];
    if (i % 8 === 0) {
      var rotated = t0;
      t0 = AES_SBOX[t1] ^ rcon;
      t1 = AES_SBOX[t2];
      t2 = AES_SBOX[t3];
      t3 = AES_SBOX[rotated];
      rcon = ((rcon << 1) ^ (rcon & 0x80 ? 0x11b : 0)) & 0xff;
    } else if (i % 8 === 4) {
      t0 = AES_SBOX[t0];
      t1 = AES_SBOX[t1];
      t2 = AES_SBOX[t2];
      t3 = AES_SBOX[t3];
    }
    rk[i * 4] = rk[(i - 8) * 4] ^ t0;
    rk[i * 4 + 1] = rk[(i - 8) * 4 + 1] ^ t1;
    rk[i * 4 + 2] = rk[(i - 8) * 4 + 2] ^ t2;
    rk[i * 4 + 3] = rk[(i - 8) * 4 + 3] ^ t3;
  }
  return rk;
}

function aesXtime(x) {
  return ((x << 1) ^ (x & 0x80 ? 0x1b : 0)) & 0xff;
}

var AES_STATE = new Uint8Array(16);
var AES_TEMP = new Uint8Array(16);

// One block, encrypted: `out` (16 bytes) gets the result.
function aesEncryptBlock(rk, input, out) {
  var s = AES_STATE;
  var t = AES_TEMP;
  var i, r;
  for (i = 0; i < 16; i++) s[i] = input[i] ^ rk[i];
  for (r = 1; r <= 14; r++) {
    // SubBytes and ShiftRows in one go (byte r + 4c of the new state comes from r + 4((c + r) mod 4)).
    for (i = 0; i < 16; i++) t[i] = AES_SBOX[s[(i + (i & 3) * 4) & 15]];
    if (r < 14) {
      for (var c = 0; c < 16; c += 4) {
        var a0 = t[c], a1 = t[c + 1], a2 = t[c + 2], a3 = t[c + 3];
        var all = a0 ^ a1 ^ a2 ^ a3;
        s[c] = a0 ^ all ^ aesXtime(a0 ^ a1);
        s[c + 1] = a1 ^ all ^ aesXtime(a1 ^ a2);
        s[c + 2] = a2 ^ all ^ aesXtime(a2 ^ a3);
        s[c + 3] = a3 ^ all ^ aesXtime(a3 ^ a0);
      }
    } else {
      for (i = 0; i < 16; i++) s[i] = t[i];
    }
    for (i = 0; i < 16; i++) s[i] ^= rk[r * 16 + i];
  }
  for (i = 0; i < 16; i++) out[i] = s[i];
}

// y = (y xor block) * h in GF(2^128), with 4 big-endian words each.
function gcmMultiply(y, block, offset, length, h) {
  var x0 = y[0], x1 = y[1], x2 = y[2], x3 = y[3];
  var padded = new Uint8Array(16);
  padded.set(block.subarray(offset, offset + length));
  var xs = [
    ((padded[0] << 24) | (padded[1] << 16) | (padded[2] << 8) | padded[3]) ^ x0,
    ((padded[4] << 24) | (padded[5] << 16) | (padded[6] << 8) | padded[7]) ^ x1,
    ((padded[8] << 24) | (padded[9] << 16) | (padded[10] << 8) | padded[11]) ^ x2,
    ((padded[12] << 24) | (padded[13] << 16) | (padded[14] << 8) | padded[15]) ^ x3,
  ];
  var z0 = 0, z1 = 0, z2 = 0, z3 = 0;
  var v0 = h[0], v1 = h[1], v2 = h[2], v3 = h[3];
  for (var i = 0; i < 128; i++) {
    if ((xs[i >> 5] >>> (31 - (i & 31))) & 1) {
      z0 ^= v0;
      z1 ^= v1;
      z2 ^= v2;
      z3 ^= v3;
    }
    var lsb = v3 & 1;
    v3 = (v3 >>> 1) | (v2 << 31);
    v2 = (v2 >>> 1) | (v1 << 31);
    v1 = (v1 >>> 1) | (v0 << 31);
    v0 = v0 >>> 1;
    if (lsb) v0 ^= 0xe1000000;
  }
  y[0] = z0;
  y[1] = z1;
  y[2] = z2;
  y[3] = z3;
}

function gcmWordsOf(bytes) {
  return new Int32Array([
    (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3],
    (bytes[4] << 24) | (bytes[5] << 16) | (bytes[6] << 8) | bytes[7],
    (bytes[8] << 24) | (bytes[9] << 16) | (bytes[10] << 8) | bytes[11],
    (bytes[12] << 24) | (bytes[13] << 16) | (bytes[14] << 8) | bytes[15],
  ]);
}

// AES-256-GCM like WebCrypto's: `encrypting` gives ciphertext + tag, else `data` is ciphertext + tag and the result
// the plain bytes (an Error if the tag doesn't fit). No additional data, 12-byte IV, 16-byte tag.
function gcmFallback(rawKey, iv, data, encrypting) {
  var rk = aesExpandKey(rawKey);
  var zero = new Uint8Array(16);
  var hBytes = new Uint8Array(16);
  aesEncryptBlock(rk, zero, hBytes);
  var h = gcmWordsOf(hBytes);
  var counter = new Uint8Array(16);
  counter.set(iv);
  counter[15] = 1;
  var tagMask = new Uint8Array(16);
  aesEncryptBlock(rk, counter, tagMask);

  var body = encrypting ? data : data.subarray(0, data.length - 16);
  if (!encrypting && data.length < 16) throw new Error("Entschlüsselung fehlgeschlagen");
  var result = new Uint8Array(body.length);
  var stream = new Uint8Array(16);
  var y = new Int32Array(4);
  var hashed = encrypting ? result : body;
  var n = body.length;
  for (var offset = 0; offset < n; offset += 16) {
    // inc32 of the counter, then the key stream block
    for (var k = 15; k >= 12; k--) {
      counter[k] = (counter[k] + 1) & 0xff;
      if (counter[k] !== 0) break;
    }
    aesEncryptBlock(rk, counter, stream);
    var len = Math.min(16, n - offset);
    for (var j = 0; j < len; j++) result[offset + j] = body[offset + j] ^ stream[j];
    // The tag covers the ciphertext: the output when encrypting, the input when decrypting. (Done a block behind
    // when decrypting in place would be needed - here the two are separate arrays, so it can be done right away.)
    gcmMultiply(y, hashed, offset, len, h);
  }
  var lengths = new Uint8Array(16);
  var lengthView = new DataView(lengths.buffer);
  lengthView.setUint32(8, Math.floor((n * 8) / 4294967296));
  lengthView.setUint32(12, (n * 8) >>> 0);
  gcmMultiply(y, lengths, 0, 16, h);
  var tag = new Uint8Array(16);
  var tagView = new DataView(tag.buffer);
  for (var w = 0; w < 4; w++) tagView.setInt32(w * 4, y[w]);
  for (var m = 0; m < 16; m++) tag[m] ^= tagMask[m];
  if (encrypting) {
    var out = new Uint8Array(n + 16);
    out.set(result);
    out.set(tag, n);
    return out;
  }
  var difference = 0;
  for (var q = 0; q < 16; q++) difference |= tag[q] ^ data[n + q];
  if (difference !== 0) throw new Error("Entschlüsselung fehlgeschlagen");
  return result;
}

// ---- keys, encrypting, decrypting ----------------------------------------------------------------------------

// A key is { raw: the 32 bytes, subtle: the same as a CryptoKey, or null when WebCrypto isn't used }.
export async function filesDeriveKey(password, saltBase64, iterations) {
  var salt = filesFromBase64(saltBase64);
  if (filesHasSubtle()) {
    var material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    var bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt, iterations: iterations, hash: "SHA-256" }, material, 256);
    var raw = new Uint8Array(bits);
    return { raw: raw, subtle: await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]) };
  }
  // Let the page draw itself before the (slow) work begins.
  await new Promise(function (resolve) {
    setTimeout(resolve, 20);
  });
  return { raw: filesPbkdf2Fallback(password, salt, iterations), subtle: null };
}

// The bytes, encrypted: a fresh IV in front of the ciphertext.
export async function filesEncrypt(key, bytes) {
  var iv = crypto.getRandomValues(new Uint8Array(12));
  var encrypted = key.subtle
    ? new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key.subtle, bytes))
    : gcmFallback(key.raw, iv, bytes, true);
  var result = new Uint8Array(12 + encrypted.length);
  result.set(iv, 0);
  result.set(encrypted, 12);
  return result;
}

// The bytes of filesEncrypt, decrypted; rejects if the key is wrong or the data was changed.
export async function filesDecrypt(key, bytes) {
  var data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (key.subtle) return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: data.subarray(0, 12) }, key.subtle, data.subarray(12)));
  return gcmFallback(key.raw, data.subarray(0, 12), data.subarray(12), false);
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
