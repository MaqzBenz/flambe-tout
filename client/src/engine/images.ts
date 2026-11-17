import { GAME_LIMITS } from '@bg/shared';

export interface StoredImage {
  data: Uint8Array;
  mime: 'image/webp' | 'image/jpeg' | 'image/png';
}

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Identifie le vrai format via les "magic bytes" (on ne fait jamais confiance au type annoncé). */
function sniffMime(b: Uint8Array): StoredImage['mime'] | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && PNG_SIG.every((v, i) => b[i] === v)) return 'image/png';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Normalise ce qui arrive du réseau (ArrayBuffer, Uint8Array, vue typée) en Uint8Array. */
export function toBytes(raw: unknown): Uint8Array | null {
  if (raw instanceof Uint8Array) return raw;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (ArrayBuffer.isView(raw)) return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  return null;
}

/** Valide l'image reçue. `undefined` = pas d'image ; string = erreur. */
export function parseImage(raw: unknown): StoredImage | undefined | string {
  if (raw === undefined || raw === null) return undefined;
  const data = toBytes(raw);
  if (!data) return 'Image invalide.';
  if (data.byteLength > GAME_LIMITS.IMAGE_MAX_BYTES) return 'Image trop lourde.';
  const mime = sniffMime(data);
  if (!mime) {
    wipe(data);
    return 'Format d’image non supporté (WebP, JPEG ou PNG).';
  }
  return { data, mime };
}

/** Écrase les octets avant de lâcher la référence : rien ne traîne en mémoire en attendant le GC. */
export function wipe(buf: Uint8Array | undefined): void {
  buf?.fill(0);
}

/** Plafond de RAM consacrée aux images dans l'onglet de l'hôte. */
export const MAX_IMAGE_MEMORY_BYTES = 400 * 1024 * 1024;
