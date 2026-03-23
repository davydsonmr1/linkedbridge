// =====================================================
// LinkedBridge — AES-256-GCM Crypto Service Tests
// =====================================================
// Uses Node.js native test runner (node:test) — zero external deps.
//
// Coverage:
// 1. Encrypt → Decrypt round-trip produces original plaintext
// 2. Different IVs generated per encryption (same plaintext ≠ same ciphertext)
// 3. Tampered authTag causes decryption to fail (integrity check)
// 4. Tampered ciphertext causes decryption to fail
// 5. Missing master key throws CRITICAL error (Fail-Fast)
// 6. Wrong-length master key throws CRITICAL error
// 7. Empty string encryption works correctly
// 8. Unicode / multi-byte string encryption works correctly
// =====================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { AesGcmCryptoService } from './aes-gcm.service.js';

// Generate a valid 32-byte key for testing
const TEST_KEY = randomBytes(32).toString('base64');

describe('AesGcmCryptoService', () => {
  // ----- Construction / Fail-Fast -----

  describe('constructor (Fail-Fast validation)', () => {
    it('should throw CRITICAL error when master key is undefined', () => {
      // Temporarily remove the env var to test the fallback path
      const original = process.env['ENCRYPTION_MASTER_KEY'];
      delete process.env['ENCRYPTION_MASTER_KEY'];

      assert.throws(
        () => new AesGcmCryptoService(undefined),
        (error: Error) => {
          assert.ok(error.message.includes('[CRITICAL]'));
          assert.ok(error.message.includes('ENCRYPTION_MASTER_KEY'));
          return true;
        },
      );

      // Restore
      if (original !== undefined) {
        process.env['ENCRYPTION_MASTER_KEY'] = original;
      }
    });

    it('should throw CRITICAL error when master key is too short', () => {
      const shortKey = randomBytes(16).toString('base64'); // 16 bytes, not 32
      assert.throws(
        () => new AesGcmCryptoService(shortKey),
        (error: Error) => {
          assert.ok(error.message.includes('[CRITICAL]'));
          assert.ok(error.message.includes('32 bytes'));
          return true;
        },
      );
    });

    it('should throw CRITICAL error when master key is too long', () => {
      const longKey = randomBytes(64).toString('base64'); // 64 bytes, not 32
      assert.throws(
        () => new AesGcmCryptoService(longKey),
        (error: Error) => {
          assert.ok(error.message.includes('[CRITICAL]'));
          assert.ok(error.message.includes('32 bytes'));
          return true;
        },
      );
    });

    it('should succeed with a valid 32-byte base64 key', () => {
      assert.doesNotThrow(() => new AesGcmCryptoService(TEST_KEY));
    });
  });

  // ----- Encrypt / Decrypt Round-Trip -----

  describe('encrypt() → decrypt() round-trip', () => {
    const service = new AesGcmCryptoService(TEST_KEY);

    it('should encrypt and decrypt a simple string correctly', () => {
      const plainText = 'my-super-secret-oauth-access-token';
      const { encryptedText, iv, authTag } = service.encrypt(plainText);

      // Encrypted text must NOT be the same as plaintext
      assert.notEqual(encryptedText, plainText);

      // All outputs must be non-empty hex strings
      assert.ok(encryptedText.length > 0, 'encryptedText must not be empty');
      assert.ok(iv.length > 0, 'iv must not be empty');
      assert.ok(authTag.length > 0, 'authTag must not be empty');

      // Decrypt must return the original
      const decrypted = service.decrypt(encryptedText, iv, authTag);
      assert.equal(decrypted, plainText);
    });

    it('should handle empty string encryption', () => {
      const plainText = '';
      const { encryptedText, iv, authTag } = service.encrypt(plainText);
      const decrypted = service.decrypt(encryptedText, iv, authTag);
      assert.equal(decrypted, plainText);
    });

    it('should handle unicode / multi-byte strings', () => {
      const plainText = '🔐 Segurança é prioridade! Não há atalhos. 日本語テスト';
      const { encryptedText, iv, authTag } = service.encrypt(plainText);
      const decrypted = service.decrypt(encryptedText, iv, authTag);
      assert.equal(decrypted, plainText);
    });

    it('should handle very long strings', () => {
      const plainText = 'A'.repeat(10_000);
      const { encryptedText, iv, authTag } = service.encrypt(plainText);
      const decrypted = service.decrypt(encryptedText, iv, authTag);
      assert.equal(decrypted, plainText);
    });
  });

  // ----- IV Uniqueness -----

  describe('IV uniqueness', () => {
    const service = new AesGcmCryptoService(TEST_KEY);

    it('should generate different IVs for the same plaintext', () => {
      const plainText = 'same-input-different-output';
      const result1 = service.encrypt(plainText);
      const result2 = service.encrypt(plainText);

      // IVs must be different
      assert.notEqual(result1.iv, result2.iv);

      // Ciphertexts must be different (because IVs differ)
      assert.notEqual(result1.encryptedText, result2.encryptedText);

      // But both must decrypt to the same plaintext
      assert.equal(service.decrypt(result1.encryptedText, result1.iv, result1.authTag), plainText);
      assert.equal(service.decrypt(result2.encryptedText, result2.iv, result2.authTag), plainText);
    });
  });

  // ----- Integrity / Tamper Detection -----

  describe('tamper detection (GCM integrity)', () => {
    const service = new AesGcmCryptoService(TEST_KEY);

    it('should reject decryption when authTag is corrupted', () => {
      const plainText = 'sensitive-data-to-protect';
      const { encryptedText, iv, authTag } = service.encrypt(plainText);

      // Corrupt the authTag by flipping the first character
      const corruptedAuthTag = (authTag[0] === 'a' ? 'b' : 'a') + authTag.slice(1);

      assert.throws(
        () => service.decrypt(encryptedText, iv, corruptedAuthTag),
        (error: Error) => {
          // Node.js GCM throws "Unsupported state or unable to authenticate data"
          assert.ok(error.message.length > 0);
          return true;
        },
      );
    });

    it('should reject decryption when ciphertext is corrupted', () => {
      const plainText = 'another-secret';
      const { encryptedText, iv, authTag } = service.encrypt(plainText);

      // Corrupt the ciphertext by flipping the first character
      const corruptedCiphertext = (encryptedText[0] === 'a' ? 'b' : 'a') + encryptedText.slice(1);

      assert.throws(
        () => service.decrypt(corruptedCiphertext, iv, authTag),
        (error: Error) => {
          assert.ok(error.message.length > 0);
          return true;
        },
      );
    });

    it('should reject decryption when IV is corrupted', () => {
      const plainText = 'yet-another-secret';
      const { encryptedText, iv, authTag } = service.encrypt(plainText);

      // Corrupt the IV
      const corruptedIv = (iv[0] === 'a' ? 'b' : 'a') + iv.slice(1);

      assert.throws(
        () => service.decrypt(encryptedText, corruptedIv, authTag),
        (error: Error) => {
          assert.ok(error.message.length > 0);
          return true;
        },
      );
    });
  });

  // ----- Cross-Key Isolation -----

  describe('cross-key isolation', () => {
    it('should fail to decrypt with a different key', () => {
      const service1 = new AesGcmCryptoService(TEST_KEY);
      const otherKey = randomBytes(32).toString('base64');
      const service2 = new AesGcmCryptoService(otherKey);

      const plainText = 'key-isolated-data';
      const { encryptedText, iv, authTag } = service1.encrypt(plainText);

      assert.throws(
        () => service2.decrypt(encryptedText, iv, authTag),
        (error: Error) => {
          assert.ok(error.message.length > 0);
          return true;
        },
      );
    });
  });
});
