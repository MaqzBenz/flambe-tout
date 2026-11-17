import { describe, expect, it } from 'vitest';
import { formatEuros, parseEuroInput } from '@bg/shared';

describe('parseEuroInput', () => {
  it.each([
    ['1 500 000', 150_000_000],
    ['1,5M', 150_000_000],
    ['2.5 k', 250_000],
    ['3 milliards', 300_000_000_000],
    ['49,99 €', 4_999],
    ['1.500', 150_000],
    ['1,234,567', 123_456_700],
    ['1.234,56', 123_456],
    ['2 Md', 200_000_000_000],
  ])('%s → %i centimes', (input, cents) => {
    expect(parseEuroInput(input)).toBe(cents);
  });

  it.each(['abc', '0', '-5', ''])('refuse « %s »', (input) => {
    expect(parseEuroInput(input)).toBeNull();
  });

  it('formate en euros à la française', () => {
    expect(formatEuros(150_000_000).replace(/\s/g, ' ')).toBe('1 500 000 €');
    expect(formatEuros(4_999).replace(/\s/g, ' ')).toBe('49,99 €');
  });
});
