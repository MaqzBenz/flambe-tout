import { GAME_LIMITS } from '@bg/shared';

const MAX_SOURCE_BYTES = 40_000_000;

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Redimensionne et ré-encode l'image dans le navigateur avant envoi.
 * Le ré-encodage via canvas supprime au passage toutes les métadonnées (EXIF, GPS…).
 */
export async function compressImage(file: Blob): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Ce fichier n’est pas une image.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('Image trop lourde (40 Mo max).');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Impossible de lire cette image.');
  }

  try {
    let maxDim: number = GAME_LIMITS.IMAGE_MAX_DIM;
    let quality = 0.82;
    for (let attempt = 0; attempt < 5; attempt++) {
      const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas indisponible.');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      // WebP si le navigateur sait l'encoder, sinon JPEG.
      let blob = await toBlob(canvas, 'image/webp', quality);
      if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', quality);
      canvas.width = canvas.height = 0; // libère la mémoire du canvas
      if (blob && blob.size <= GAME_LIMITS.IMAGE_MAX_BYTES) return blob;

      maxDim = Math.round(maxDim * 0.75);
      quality = Math.max(0.5, quality - 0.1);
    }
    throw new Error('Impossible de compresser suffisamment cette image.');
  } finally {
    bitmap.close();
  }
}

/** Première image trouvée dans un presse-papier / glisser-déposer. */
export function firstImage(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const f of Array.from(data.files)) if (f.type.startsWith('image/')) return f;
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile();
  }
  return null;
}
