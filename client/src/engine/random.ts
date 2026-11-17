// Aléatoire cryptographique via Web Crypto (dispo dans tous les navigateurs modernes et Node ≥ 19).

export function randomHex(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Entier uniforme dans [0, max). */
export function randomInt(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % max;
}

export const randomUUID = (): string => crypto.randomUUID();
