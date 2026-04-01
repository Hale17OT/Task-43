import { describe, it, expect } from 'vitest';
import { CreditScore } from './credit-score.js';

describe('CreditScore value object', () => {
  it('clamps to 0 minimum', () => {
    const score = CreditScore.create(-10);
    expect(score.value).toBe(0);
  });

  it('clamps to 100 maximum', () => {
    const score = CreditScore.create(150);
    expect(score.value).toBe(100);
  });

  it('preserves values in range', () => {
    const score = CreditScore.create(50);
    expect(score.value).toBe(50);
  });

  it('applies positive change', () => {
    const score = CreditScore.create(50);
    const updated = score.apply(2);
    expect(updated.value).toBe(52);
  });

  it('applies negative change', () => {
    const score = CreditScore.create(50);
    const updated = score.apply(-10);
    expect(updated.value).toBe(40);
  });

  it('clamps on positive overflow', () => {
    const score = CreditScore.create(99);
    const updated = score.apply(5);
    expect(updated.value).toBe(100);
  });

  it('clamps on negative overflow', () => {
    const score = CreditScore.create(3);
    const updated = score.apply(-10);
    expect(updated.value).toBe(0);
  });

  it('identifies score below threshold', () => {
    const score = CreditScore.create(15);
    expect(score.isBelowThreshold()).toBe(true);
    expect(score.isAboveThreshold()).toBe(false);
  });

  it('identifies score at threshold', () => {
    const score = CreditScore.create(20);
    expect(score.isAboveThreshold()).toBe(true);
    expect(score.isBelowThreshold()).toBe(false);
  });
});
