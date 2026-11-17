import type { ReactNode } from 'react';

/** En-tête des écrans de jeu : bandeau de magasin + intitulé de la page. */
export function Masthead({ code, section, right }: { code?: string; section: string; right?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 border-b-2 border-ink pb-1.5">
        <span className="display text-xl tracking-wide">Flambe Tout</span>
        <span className="kicker">
          {code ? <>Caisse <b className="text-ink">{code}</b></> : 'Grand magasin de l’absurde'}
        </span>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="display text-5xl sm:text-7xl">{section}</h1>
        {right}
      </div>
      <hr className="rule-double" />
    </header>
  );
}

/** Numéro de rubrique façon formulaire administratif. */
export function SectionTitle({ n, children, aside }: { n?: number | string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-ink pb-1">
      <h2 className="text-lg font-extrabold uppercase [font-stretch:75%]">
        {n !== undefined && <span className="mr-2 font-mono text-tag">{String(n).padStart(2, '0')}</span>}
        {children}
      </h2>
      {aside && <span className="font-mono text-sm text-ink-soft">{aside}</span>}
    </div>
  );
}
