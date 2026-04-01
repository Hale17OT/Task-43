import { describe, it, expect, beforeAll } from 'vitest';
import { encrypt, decrypt } from './index.js';

describe('AES-256-GCM Encryption', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = 'test-encryption-key-32chars!!!!!';
  });

  it('encrypts and decrypts a string roundtrip', () => {
    const plaintext = 'Sensitive legal note about case #12345';
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted.split(':')).toHaveLength(3); // iv:tag:ciphertext

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertexts for same plaintext (random IV)', () => {
    const plaintext = 'Same input';
    const enc1 = encrypt(plaintext);
    const enc2 = encrypt(plaintext);
    expect(enc1).not.toBe(enc2);
  });

  it('throws on tampered ciphertext', () => {
    const encrypted = encrypt('test data');
    const tampered = encrypted.slice(0, -2) + 'XX';
    expect(() => decrypt(tampered)).toThrow();
  });

  it('throws on invalid format', () => {
    expect(() => decrypt('not-valid-format')).toThrow('Invalid encrypted data format');
  });

  it('handles empty string', () => {
    const encrypted = encrypt('');
    expect(decrypt(encrypted)).toBe('');
  });

  it('handles unicode content', () => {
    const plaintext = 'Legal note: Caso de inmigracin 2025';
    const encrypted = encrypt(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it('rejects short encryption key', () => {
    const original = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = 'too-short';
    expect(() => encrypt('test')).toThrow('must be exactly 32 bytes');
    process.env.ENCRYPTION_KEY = original;
  });

  it('rejects long encryption key', () => {
    const original = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = 'a'.repeat(33);
    expect(() => encrypt('test')).toThrow('must be exactly 32 bytes');
    process.env.ENCRYPTION_KEY = original;
  });
});
