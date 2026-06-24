/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// We use RSA-OAEP for key exchange and AES-GCM for message encryption.
// This is a standard hybrid encryption scheme.

import { get, set, del } from 'idb-keyval';

export interface KeyPairJWK {
  publicKey: JsonWebKey;
  privateKey: JsonWebKey; // Keeping interface for legacy/sync support, but usage will shift to IDB
}

export interface EncryptedPayload {
  encryptedText: string;
  iv: string;
  encryptedKeys: { [userId: string]: string };
}

/**
 * Generates a new RSA-OAEP key pair for encryption and decryption.
 * Uses 4096 bits for future-proof security.
 * extractable must be true so we can use wrapKey for Device Sync,
 * but the key will be stored directly in IndexedDB, not localStorage.
 */
export async function generateSecureKeyPair(): Promise<{
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}> {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true, // extractable (required for wrapKey)
    ["encrypt", "decrypt"]
  );
  return keyPair;
}

// IndexedDB Storage Helpers
export async function savePrivateKeyToIDB(userId: string, key: CryptoKey): Promise<void> {
  await set(`private_key_${userId}`, key);
}

export async function getPrivateKeyFromIDB(userId: string): Promise<CryptoKey | undefined> {
  return await get(`private_key_${userId}`);
}

export async function removePrivateKeyFromIDB(userId: string): Promise<void> {
  await del(`private_key_${userId}`);
}

export async function exportKeyToJWK(key: CryptoKey): Promise<JsonWebKey> {
  return await window.crypto.subtle.exportKey("jwk", key);
}

export async function importPublicKeyFromJWK(jwk: JsonWebKey): Promise<CryptoKey> {
  return await window.crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );
}

export async function importPrivateKeyFromJWK(jwk: JsonWebKey): Promise<CryptoKey> {
  return await window.crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["decrypt"]
  );
}

/**
 * Generates a SHA-256 fingerprint (hash) of a JWK public key.
 * This is used for "security verification codes" (like in Signal).
 */
export async function getPublicKeyFingerprint(jwk: JsonWebKey): Promise<string> {
  // 1. Import JWK to CryptoKey
  const publicKey = await window.crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );
  // 2. Export to SPKI format
  const spki = await window.crypto.subtle.exportKey("spki", publicKey);
  // 3. Hash the SPKI binary representation
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", spki);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  return hashHex.toUpperCase().match(/.{1,4}/g)?.join("-") || hashHex;
}

/**
 * Helper to convert ArrayBuffer to Base64 string.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

/**
 * Helper to convert Base64 string to ArrayBuffer.
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Encrypts a text message using hybrid encryption.
 * 1. Generates a random symmetric key (AES-GCM).
 * 2. Encrypts the text message with the AES-GCM key.
 * 3. Encrypts the AES-GCM key with each recipient's RSA-OAEP public key.
 */
export async function encryptMessage(
  text: string,
  recipients: { userId: string; publicKeyJWK: JsonWebKey }[]
): Promise<EncryptedPayload> {
  // 1. Generate a random AES-GCM symmetric key
  const aesKey = await window.crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  );

  // 2. Encrypt message with AES-GCM
  const encoder = new TextEncoder();
  const textData = encoder.encode(text);
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 12 bytes IV is standard for AES-GCM
  
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    aesKey,
    textData
  );

  const encryptedText = arrayBufferToBase64(encryptedBuffer);
  const ivBase64 = arrayBufferToBase64(iv.buffer);

  // Export AES key to raw bytes to encrypt it with RSA
  const rawAesKey = await window.crypto.subtle.exportKey("raw", aesKey);

  // 3. Encrypt the raw AES key with each recipient's RSA public key
  const encryptedKeys: { [userId: string]: string } = {};

  for (const recipient of recipients) {
    try {
      const rsaPublicKey = await importPublicKeyFromJWK(recipient.publicKeyJWK);
      const encryptedAesKeyBuffer = await window.crypto.subtle.encrypt(
        {
          name: "RSA-OAEP",
        },
        rsaPublicKey,
        rawAesKey
      );
      encryptedKeys[recipient.userId] = arrayBufferToBase64(encryptedAesKeyBuffer);
    } catch (err) {
      console.error(`Failed to encrypt AES key for user ${recipient.userId}`, err);
    }
  }

  return {
    encryptedText,
    iv: ivBase64,
    encryptedKeys,
  };
}

/**
 * Decrypts a message using the user's private RSA key.
 * 1. Retrieves the encrypted AES key for the current user.
 * 2. Decrypts the AES key using the user's RSA private key.
 * 3. Decrypts the message body using the decrypted AES key.
 */
export async function decryptMessage(
  payload: EncryptedPayload,
  myUserId: string,
  myPrivateKey: CryptoKey
): Promise<string> {
  const encryptedAesKeyBase64 = payload.encryptedKeys[myUserId];
  if (!encryptedAesKeyBase64) {
    throw new Error("No encrypted key found for current user. Message cannot be decrypted.");
  }

  const encryptedAesKeyBuffer = base64ToArrayBuffer(encryptedAesKeyBase64);

  // 2. Decrypt AES key with RSA private key
  const rawAesKeyBuffer = await window.crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    myPrivateKey,
    encryptedAesKeyBuffer
  );

  // 2. Import raw AES key back to CryptoKey
  const aesKey = await window.crypto.subtle.importKey(
    "raw",
    rawAesKeyBuffer,
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["decrypt"]
  );

  // 3. Decrypt message using AES-GCM
  const ivBuffer = base64ToArrayBuffer(payload.iv);
  const encryptedTextBuffer = base64ToArrayBuffer(payload.encryptedText);

  const decryptedTextBuffer = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(ivBuffer),
    },
    aesKey,
    encryptedTextBuffer
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedTextBuffer);
}

/**
 * Encrypts a File or Blob using hybrid encryption for E2EE storage.
 * 1. Generates a random AES-GCM key.
 * 2. Encrypts the Blob with AES-GCM.
 * 3. Encrypts the AES key with recipients' RSA public keys.
 */
export async function encryptFile(
  file: Blob,
  recipients: { userId: string; publicKeyJWK: JsonWebKey }[]
): Promise<{ encryptedBlob: Blob; iv: string; encryptedKeys: { [userId: string]: string } }> {
  const aesKey = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  const fileBuffer = await file.arrayBuffer();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    fileBuffer
  );

  const ivBase64 = arrayBufferToBase64(iv.buffer);
  const rawAesKey = await window.crypto.subtle.exportKey("raw", aesKey);
  const encryptedKeys: { [userId: string]: string } = {};

  for (const recipient of recipients) {
    try {
      const rsaPublicKey = await importPublicKeyFromJWK(recipient.publicKeyJWK);
      const encryptedAesKeyBuffer = await window.crypto.subtle.encrypt(
        { name: "RSA-OAEP" },
        rsaPublicKey,
        rawAesKey
      );
      encryptedKeys[recipient.userId] = arrayBufferToBase64(encryptedAesKeyBuffer);
    } catch (err) {
      console.error(`Failed to encrypt file AES key for user ${recipient.userId}`, err);
    }
  }

  return {
    encryptedBlob: new Blob([encryptedBuffer], { type: "application/octet-stream" }),
    iv: ivBase64,
    encryptedKeys,
  };
}

/**
 * Decrypts a downloaded encrypted File/Blob.
 */
export async function decryptFile(
  encryptedBlob: Blob,
  ivBase64: string,
  encryptedKeys: { [userId: string]: string },
  myUserId: string,
  myPrivateKeyJWK: JsonWebKey,
  originalType: string
): Promise<Blob> {
  const encryptedAesKeyBase64 = encryptedKeys[myUserId];
  if (!encryptedAesKeyBase64) {
    throw new Error("No encrypted key found for current user.");
  }

  const rsaPrivateKey = await importPrivateKeyFromJWK(myPrivateKeyJWK);
  const encryptedAesKeyBuffer = base64ToArrayBuffer(encryptedAesKeyBase64);
  
  const decryptedAesKeyRaw = await window.crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    rsaPrivateKey,
    encryptedAesKeyBuffer
  );

  const aesKey = await window.crypto.subtle.importKey(
    "raw",
    decryptedAesKeyRaw,
    { name: "AES-GCM", length: 256 },
    true,
    ["decrypt"]
  );

  const ivBuffer = base64ToArrayBuffer(ivBase64);
  const encryptedFileBuffer = await encryptedBlob.arrayBuffer();

  const decryptedTextBuffer = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(ivBuffer) },
    aesKey,
    encryptedFileBuffer
  );

  return new Blob([decryptedTextBuffer], { type: originalType });
}

/**
 * --- DEVICE SYNC CRYPTO HELPERS ---
 */

export async function generateSyncKey(): Promise<string> {
  const aesKey = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const raw = await window.crypto.subtle.exportKey("raw", aesKey);
  return arrayBufferToBase64(raw);
}

export async function encryptWithSyncKey(text: string, base64Key: string): Promise<string> {
  const rawKey = base64ToArrayBuffer(base64Key);
  const aesKey = await window.crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encoder.encode(text)
  );

  // Return IV:Ciphertext
  return arrayBufferToBase64(iv.buffer) + ":" + arrayBufferToBase64(encrypted);
}

export async function decryptWithSyncKey(payload: string, base64Key: string): Promise<string> {
  const [ivBase64, cipherBase64] = payload.split(":");
  if (!ivBase64 || !cipherBase64) throw new Error("Invalid payload format");

  const rawKey = base64ToArrayBuffer(base64Key);
  const aesKey = await window.crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const iv = base64ToArrayBuffer(ivBase64);
  const cipher = base64ToArrayBuffer(cipherBase64);

  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    aesKey,
    cipher
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}
export async function wrapPrivateKey(privateKey: CryptoKey, syncAesKeyBase64: string): Promise<string> {
  const rawKey = base64ToArrayBuffer(syncAesKeyBase64);
  const syncAesKey = await window.crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM", length: 256 }, false, ["wrapKey"]);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await window.crypto.subtle.wrapKey(
    "jwk", privateKey, syncAesKey, { name: "AES-GCM", iv }
  );
  return arrayBufferToBase64(iv.buffer) + ":" + arrayBufferToBase64(wrapped);
}

export async function unwrapPrivateKey(wrappedData: string, syncAesKeyBase64: string): Promise<CryptoKey> {
  const [ivBase64, wrappedBase64] = wrappedData.split(":");
  const rawKey = base64ToArrayBuffer(syncAesKeyBase64);
  const syncAesKey = await window.crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM", length: 256 }, false, ["unwrapKey"]);
  const iv = base64ToArrayBuffer(ivBase64);
  const wrapped = base64ToArrayBuffer(wrappedBase64);
  return await window.crypto.subtle.unwrapKey(
    "jwk", wrapped, syncAesKey, { name: "AES-GCM", iv: new Uint8Array(iv) }, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["decrypt"]
  );
}
