export class Password {
  private constructor(public readonly value: string) {}

  static readonly MIN_LENGTH = 12;
  static readonly RULES = [
    { test: (p: string) => p.length >= Password.MIN_LENGTH, message: `Must be at least ${Password.MIN_LENGTH} characters` },
    { test: (p: string) => /\d/.test(p), message: 'Must contain at least one number' },
    { test: (p: string) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(p), message: 'Must contain at least one symbol' },
  ];

  static validate(raw: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    for (const rule of Password.RULES) {
      if (!rule.test(raw)) {
        errors.push(rule.message);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  static create(raw: string): Password {
    const { valid, errors } = Password.validate(raw);
    if (!valid) {
      throw new PasswordValidationError(errors);
    }
    return new Password(raw);
  }
}

export class PasswordValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Password validation failed: ${errors.join(', ')}`);
    this.name = 'PasswordValidationError';
  }
}
