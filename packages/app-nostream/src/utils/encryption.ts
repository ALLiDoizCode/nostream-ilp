import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'crypto'

/**
 * AES-256-GCM encryption/decryption utilities
 *
 * Used for encrypting sensitive configuration values (e.g., wallet mnemonics).
 */

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const SALT_LENGTH = 32
const KEY_LENGTH = 32

/**
 * Derives an encryption key from a password using PBKDF2
 *
 * @param password - Password to derive key from
 * @param salt - Salt for key derivation
 * @returns Derived key
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return pbkdf2Sync(password, salt, 100000, KEY_LENGTH, 'sha256')
}

/**
 * Encrypts a plaintext string using AES-256-GCM
 *
 * @param plaintext - The text to encrypt
 * @param password - Password for encryption
 * @returns Base64-encoded encrypted data (format: salt:iv:authTag:ciphertext)
 */
export function encrypt(plaintext: string, password: string): string {
  const salt = randomBytes(SALT_LENGTH)
  const key = deriveKey(password, salt)
  const iv = randomBytes(IV_LENGTH)

  const cipher = createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(plaintext, 'utf8', 'base64')
  encrypted += cipher.final('base64')

  const authTag = cipher.getAuthTag()

  // Format: salt:iv:authTag:ciphertext (all base64-encoded)
  return [
    salt.toString('base64'),
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted,
  ].join(':')
}

/**
 * Decrypts an AES-256-GCM encrypted string
 *
 * @param encrypted - Base64-encoded encrypted data (format: salt:iv:authTag:ciphertext)
 * @param password - Password for decryption
 * @returns Decrypted plaintext
 * @throws {Error} If decryption fails (wrong password, corrupted data)
 */
export function decrypt(encrypted: string, password: string): string {
  const parts = encrypted.split(':')

  if (parts.length !== 4) {
    throw new Error('Invalid encrypted data format')
  }

  const [saltB64, ivB64, authTagB64, ciphertext] = parts

  const salt = Buffer.from(saltB64, 'base64')
  const iv = Buffer.from(ivB64, 'base64')
  const authTag = Buffer.from(authTagB64, 'base64')

  const key = deriveKey(password, salt)

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(ciphertext, 'base64', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}
