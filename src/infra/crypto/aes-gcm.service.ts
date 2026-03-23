// =====================================================
// LinkedBridge — AES-256-GCM Crypto Service
// =====================================================
// Infrastructure-layer implementation of ICryptoService.
// Uses Node.js native `crypto` module — zero external deps.
//
// Security Properties:
// - AES-256-GCM: authenticated encryption (confidentiality + integrity)
// - Unique 16-byte IV per encryption (crypto.randomBytes)
// - Fail-Fast on missing/malformed master key
// - authTag verification on every decrypt (rejects tampered ciphertext)
// =====================================================

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';

import type { EncryptResult, ICryptoService } from '../../domain/interfaces/crypto.interface.js';

const ALGORITHM = 'aes-256-gcm' as const;
const IV_LENGTH_BYTES = 16;
const KEY_LENGTH_BYTES = 32;
const AUTH_TAG_LENGTH_BYTES = 16;
const ENCODING = 'hex' as const;

export class AesGcmCryptoService implements ICryptoService {
  private readonly masterKey: Buffer;

  constructor(masterKeyBase64?: string) {
    const keyValue = masterKeyBase64 ?? process.env['ENCRYPTION_MASTER_KEY'];

    if (!keyValue) {
      throw new Error(
        '[CRITICAL] ENCRYPTION_MASTER_KEY is not set. ' +
        'The application cannot start without a valid 32-byte encryption key. ' +
        'Generate one with: openssl rand -base64 32',
      );
    }

    const keyBuffer = Buffer.from(keyValue, 'base64');

    if (keyBuffer.length !== KEY_LENGTH_BYTES) {
      throw new Error(
        `[CRITICAL] ENCRYPTION_MASTER_KEY must decode to exactly ${KEY_LENGTH_BYTES} bytes (256 bits). ` +
        `Received ${keyBuffer.length} bytes. ` +
        'Generate a valid key with: openssl rand -base64 32',
      );
    }

    this.masterKey = keyBuffer;
  }

  /**
   * Encrypts a plaintext string using AES-256-GCM.
   *
   * A fresh 16-byte IV is generated for every call via crypto.randomBytes,
   * ensuring that encrypting the same plaintext twice produces different ciphertexts.
   */
  encrypt(plainText: string): EncryptResult {
    const iv = randomBytes(IV_LENGTH_BYTES);

    const cipher = createCipheriv(ALGORITHM, this.masterKey, iv, {
      authTagLength: AUTH_TAG_LENGTH_BYTES,
    });

    const encrypted = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return {
      encryptedText: encrypted.toString(ENCODING),
      iv: iv.toString(ENCODING),
      authTag: authTag.toString(ENCODING),
    };
  }

  /**
   * Decrypts ciphertext back to the original plaintext.
   *
   * Verifies the GCM authTag before returning — if the ciphertext or authTag
   * has been tampered with, an error is thrown (integrity guarantee).
   */
  decrypt(encryptedText: string, iv: string, authTag: string): string {
    const decipher = createDecipheriv(
      ALGORITHM,
      this.masterKey,
      Buffer.from(iv, ENCODING),
      { authTagLength: AUTH_TAG_LENGTH_BYTES },
    );

    decipher.setAuthTag(Buffer.from(authTag, ENCODING));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedText, ENCODING)),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }
}
