// =====================================================
// LinkedBridge — ICryptoService Interface
// =====================================================
// Domain-level contract for symmetric encryption.
// Implementations MUST use authenticated encryption
// (e.g., AES-256-GCM) to guarantee both confidentiality
// and integrity of the ciphertext.
// =====================================================

/**
 * Result of an encryption operation.
 * All fields are hex-encoded strings safe for database storage.
 */
export interface EncryptResult {
  /** Hex-encoded ciphertext */
  encryptedText: string;
  /** Hex-encoded Initialization Vector (unique per encryption) */
  iv: string;
  /** Hex-encoded GCM Authentication Tag (integrity proof) */
  authTag: string;
}

/**
 * Domain interface for symmetric encryption/decryption.
 *
 * Implementations MUST:
 * - Use authenticated encryption (AES-256-GCM)
 * - Generate a unique IV per encryption call
 * - Validate the authTag on decryption (reject tampered ciphertext)
 * - Fail-Fast if the master key is missing or malformed
 */
export interface ICryptoService {
  /**
   * Encrypts a plaintext string.
   *
   * @param plainText - The secret to encrypt (e.g., an OAuth access token)
   * @returns An object containing the hex-encoded ciphertext, IV, and authTag
   */
  encrypt(plainText: string): EncryptResult;

  /**
   * Decrypts ciphertext back to the original plaintext.
   *
   * @param encryptedText - Hex-encoded ciphertext
   * @param iv - Hex-encoded IV used during encryption
   * @param authTag - Hex-encoded GCM authTag for integrity verification
   * @returns The original plaintext string
   * @throws If the authTag verification fails (tampered ciphertext)
   */
  decrypt(encryptedText: string, iv: string, authTag: string): string;
}
