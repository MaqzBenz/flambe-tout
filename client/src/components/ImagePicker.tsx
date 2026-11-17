import { useEffect, useRef, useState, type DragEvent } from 'react';
import { compressImage, firstImage } from '../lib/image';

export interface PickedImage {
  blob: Blob;
  url: string;
}

/**
 * Pièce jointe : clic (fichier / appareil photo sur mobile), glisser-déposer,
 * ou Ctrl+V n'importe où sur la page.
 */
export function ImagePicker({
  value,
  onChange,
  disabled,
}: {
  value: PickedImage | null;
  onChange: (img: PickedImage | null) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function accept(file: File | null) {
    if (!file || disabled) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await compressImage(file);
      if (value) URL.revokeObjectURL(value.url);
      onChange({ blob, url: URL.createObjectURL(blob) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Image illisible.');
    } finally {
      setBusy(false);
    }
  }

  // Ctrl+V global : n'intercepte que si le presse-papier contient une image.
  const acceptRef = useRef(accept);
  acceptRef.current = accept;
  useEffect(() => {
    if (disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const file = firstImage(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      acceptRef.current(file);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [disabled]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    accept(firstImage(e.dataTransfer));
  };

  function clear() {
    if (value) URL.revokeObjectURL(value.url);
    onChange(null);
    setError(null);
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="kicker">Pièce jointe — image ou capture</span>
      {value ? (
        <figure className="flex items-start gap-3 border-2 border-ink bg-paper-deep p-2">
          <img src={value.url} alt="Aperçu" className="h-28 w-28 border border-ink bg-sheet object-contain" />
          <figcaption className="flex flex-1 flex-col gap-1 font-mono text-xs">
            <span>{Math.round(value.blob.size / 1024)} Ko · métadonnées retirées</span>
            <button type="button" onClick={clear} disabled={disabled} className="cursor-pointer self-start underline hover:text-tag">
              retirer la pièce jointe
            </button>
          </figcaption>
        </figure>
      ) : (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`cursor-pointer border-2 border-dashed px-4 py-4 text-left font-mono text-sm transition-colors ${
            dragging ? 'border-tag bg-sheet' : 'border-ink-faint hover:border-ink hover:bg-sheet/60'
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {busy ? (
            'Compression en cours…'
          ) : (
            <>
              <span className="font-bold">Agrafer une image ici</span>
              <span className="block text-ink-soft">
                cliquer, glisser un fichier, ou coller avec <kbd className="border border-ink px-1">Ctrl</kbd>+
                <kbd className="border border-ink px-1">V</kbd>
              </span>
            </>
          )}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          accept(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />
      {error && <span className="font-mono text-xs text-tag">{error}</span>}
    </div>
  );
}

/** Vignette d'un article, encadrée comme une photo de catalogue. */
export function ItemThumb({ url, size = 48 }: { url: string | null; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden border border-ink bg-paper-deep"
      style={{ width: size, height: size }}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <svg viewBox="0 0 24 24" className="h-1/2 w-1/2 text-ink-faint" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="7" width="18" height="13" />
          <path d="M8 7V5a4 4 0 0 1 8 0v2" />
        </svg>
      )}
    </span>
  );
}
