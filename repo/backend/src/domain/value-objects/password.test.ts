import { describe, it, expect } from 'vitest';
import { Password, PasswordValidationError } from './password.js';

describe('Password value object', () => {
  describe('validate', () => {
    it('accepts a valid password meeting all rules', () => {
      const result = Password.validate('SecurePass1!');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects password shorter than 12 characters', () => {
      const result = Password.validate('Short1!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Must be at least 12 characters');
    });

    it('rejects password without a number', () => {
      const result = Password.validate('NoNumberHere!@');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Must contain at least one number');
    });

    it('rejects password without a symbol', () => {
      const result = Password.validate('NoSymbolHere1');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Must contain at least one symbol');
    });

    it('returns multiple errors for password violating multiple rules', () => {
      const result = Password.validate('short');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });

    it('accepts exactly 12 character password with number and symbol', () => {
      const result = Password.validate('Abcdefghij1!');
      expect(result.valid).toBe(true);
    });
  });

  describe('create', () => {
    it('creates Password for valid input', () => {
      const pw = Password.create('ValidPass123!');
      expect(pw.value).toBe('ValidPass123!');
    });

    it('throws PasswordValidationError for invalid input', () => {
      expect(() => Password.create('bad')).toThrow(PasswordValidationError);
    });
  });
});
