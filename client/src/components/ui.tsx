import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';

// ─── Boutons ──────────────────────────────────────────────────────────────────

type Variant = 'ink' | 'outline' | 'tag' | 'link';

const variants: Record<Variant, string> = {
  ink: 'bg-ink text-sheet border-2 border-ink hover:bg-tag hover:border-tag',
  outline: 'bg-transparent text-ink border-2 border-ink hover:bg-ink hover:text-sheet',
  tag: 'bg-tag text-sheet border-2 border-tag hover:bg-ink hover:border-ink',
  link: 'border-0 bg-transparent p-0! underline decoration-2 underline-offset-4 text-ink-soft hover:text-tag normal-case! tracking-normal! font-semibold! [font-stretch:100%]!',
};

export function Button({
  variant = 'ink',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-5 py-2.5 text-lg', lg: 'px-6 py-3.5 text-2xl' };
  return (
    <button
      {...props}
      className={`cursor-pointer font-extrabold tracking-wide uppercase [font-stretch:68%] transition-colors duration-100 active:translate-y-px disabled:pointer-events-none disabled:opacity-35 ${sizes[size]} ${variants[variant]} ${className}`}
    />
  );
}

// ─── Champs ───────────────────────────────────────────────────────────────────

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="kicker">{label}</span>
      {children}
      {hint && <span className="font-mono text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}

export function Input({ className = '', ...props }: ComponentProps<'input'>) {
  return <input {...props} className={`field-line ${className}`} />;
}

export function TextArea({ className = '', ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      {...props}
      className={`w-full resize-y border-2 border-ink bg-transparent p-2 text-base outline-none placeholder:text-ink-faint focus:border-tag ${className}`}
    />
  );
}

/** Case à cocher façon bulletin : un carré où l'on trace une croix. */
export function Ballot({
  checked,
  onChange,
  disabled,
  children,
  size = 22,
}: {
  checked: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
  children?: ReactNode;
  size?: number;
}) {
  return (
    <label className={`flex items-center gap-3 ${disabled ? 'cursor-default' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      <BallotBox checked={checked} size={size} />
      {children && <span className={checked ? '' : 'text-ink-soft'}>{children}</span>}
    </label>
  );
}

export function BallotBox({ checked, size = 22 }: { checked: boolean; size?: number }) {
  return (
    <span
      aria-hidden
      className="relative inline-flex shrink-0 border-2 border-ink bg-sheet peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-tag"
      style={{ width: size, height: size }}
    >
      {checked && (
        <svg viewBox="0 0 20 20" className="absolute inset-[-3px] text-tag" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round">
          <path d="M3 4 Q10 10 17 16" />
          <path d="M17 3 Q9 11 4 17" />
        </svg>
      )}
    </span>
  );
}

/** Rangée d'options exclusives (cases d'un formulaire). */
export function Choice<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap">
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.value)}
            aria-pressed={on}
            className={`-ml-0.5 border-2 border-ink px-3 py-1.5 font-mono text-sm first:ml-0 ${
              on ? 'relative z-10 bg-ink text-sheet' : 'bg-transparent enabled:hover:bg-paper-deep'
            } ${disabled ? 'cursor-default' : 'cursor-pointer'} ${i === 0 ? '' : ''}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Éléments imprimés ───────────────────────────────────────────────────────

export function Sheet({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`sheet ${className}`}>{children}</div>;
}

export function Stamp({
  children,
  color = 'tag',
  rotate = -8,
  className = '',
}: {
  children: ReactNode;
  color?: 'tag' | 'stamp' | 'ok';
  rotate?: number;
  className?: string;
}) {
  const colors = { tag: 'text-tag', stamp: 'text-stamp', ok: 'text-ok' };
  return (
    <span
      className={`stamp animate-stamp ${colors[color]} ${className}`}
      style={{ transform: `rotate(${rotate}deg)`, ['--rot' as string]: `${rotate}deg` }}
    >
      {children}
    </span>
  );
}

/** Monogramme d'un participant : initiale dans un carré, avec sa couleur d'encre. */
export function Monogram({ name, color, size = 36 }: { name: string; color: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center border-2 font-black text-sheet uppercase [font-stretch:62%]"
      style={{ width: size, height: size, fontSize: size * 0.6, backgroundColor: color, borderColor: color }}
    >
      {[...name][0]}
    </span>
  );
}

/** Code-barres décoratif, déterministe à partir d'un texte. */
export function Barcode({ value, height = 44, className = '' }: { value: string; height?: number; className?: string }) {
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  let seed = [...value].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  // On prend les bits hauts du générateur : les bits bas d'un LCG sont cycliques (barres trop régulières).
  const next = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 16) % 4;
  for (let i = 0; i < 46; i++) {
    const w = 1 + next();
    if (i % 2 === 0) bars.push({ x, w });
    x += w + (i % 2 === 0 ? 0 : 1);
  }
  return (
    <svg viewBox={`0 0 ${x} 10`} preserveAspectRatio="none" className={className} style={{ height }} aria-hidden>
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={10} fill="currentColor" />
      ))}
    </svg>
  );
}

/** Bandeau affiché quand la connexion à l'hôte est perdue. */
export function ConnectionBanner({ connected }: { connected: boolean }) {
  if (connected) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-tag py-1.5 text-center font-mono text-sm text-sheet">
      Liaison avec l’hôte interrompue — reconnexion…
    </div>
  );
}

/** Note manuscrite / avis encadré. */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="border-2 border-tag bg-sheet px-4 py-3 text-tag">
      <span className="kicker mr-2 text-tag!">Avis</span>
      <span className="font-mono text-sm">{children}</span>
    </div>
  );
}
