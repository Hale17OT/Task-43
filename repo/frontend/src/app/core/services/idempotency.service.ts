import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class IdempotencyService {
  generateKey(): string {
    return crypto.randomUUID();
  }
}
