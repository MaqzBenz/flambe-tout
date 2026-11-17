import { useEffect, useState } from 'react';
import { actions } from '../net/session';
import { useGame } from '../store';

/**
 * Cache d'images en mémoire de l'onglet uniquement (Object URLs).
 * Rien n'est écrit sur disque ; tout est révoqué quand on quitte le salon.
 */
const urls = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

export function putImage(itemId: string, blob: Blob): void {
  dropImage(itemId);
  urls.set(itemId, URL.createObjectURL(blob));
}

export function dropImage(itemId: string): void {
  const url = urls.get(itemId);
  if (url) URL.revokeObjectURL(url);
  urls.delete(itemId);
}

export function clearImages(): void {
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
  pending.clear();
}

async function fetchImage(itemId: string): Promise<string | null> {
  try {
    const res = await actions.getImage(itemId);
    if (!res.ok) return null;
    putImage(itemId, new Blob([res.data], { type: res.mime }));
    return urls.get(itemId) ?? null;
  } catch {
    return null;
  } finally {
    pending.delete(itemId);
  }
}

/** URL affichable de l'image d'un article (récupérée au besoin auprès du serveur). */
export function useItemImage(itemId: string, hasImage: boolean): string | null {
  const [url, setUrl] = useState(() => urls.get(itemId) ?? null);
  useEffect(() => {
    if (!hasImage) return setUrl(null);
    const cached = urls.get(itemId);
    if (cached) return setUrl(cached);
    let alive = true;
    let p = pending.get(itemId);
    if (!p) pending.set(itemId, (p = fetchImage(itemId)));
    p.then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [itemId, hasImage]);
  return url;
}

// Purge locale dès qu'on quitte le salon (fermeture, expulsion, départ).
// …et quand une nouvelle manche commence (rejouer).
useGame.subscribe((s, prev) => {
  if (prev.session && !s.session) clearImages();
  else if (prev.room?.phase === 'PODIUM' && s.room?.phase === 'CONFIG') clearImages();
});
