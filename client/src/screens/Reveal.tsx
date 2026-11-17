import { useEffect, useState } from 'react';
import {
  formatEuros,
  type PublicMember,
  type PublicRoomState,
  type RevealState,
  type RevealedItem,
} from '@bg/shared';
import { actions } from '../net/session';
import { useItemImage } from '../lib/imageCache';
import { ItemThumb } from '../components/ImagePicker';
import { Barcode, Button, Monogram, Stamp } from '../components/ui';
import { Masthead } from '../components/Masthead';

const lot = (n: number) => String(n).padStart(2, '0');

export function Reveal({ room, meId }: { room: PublicRoomState; meId: string }) {
  const reveal = room.reveal;
  const isHost = room.hostId === meId;
  const memberById = new Map(room.members.map((m) => [m.id, m]));

  // Raccourcis clavier pour l'hôte : → / Espace = suivant, ← = précédent.
  useEffect(() => {
    if (!isHost) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        actions.revealNext();
      } else if (e.key === 'ArrowLeft') actions.revealPrev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isHost]);

  if (!reveal) return null;
  const current = reveal.index >= 0 ? reveal.revealed[reveal.index] : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-6 px-4 py-6 pb-28">
      <Masthead
        code={room.code}
        section={reveal.summary ? 'Relevé des comptes' : 'Vente publique'}
        right={
          !reveal.summary && reveal.total > 0 ? (
            <span className="font-mono text-lg">
              lot <b>{lot(Math.max(0, reveal.index + 1))}</b> / {lot(reveal.total)}
            </span>
          ) : undefined
        }
      />

      {reveal.summary ? (
        <Summary reveal={reveal} room={room} memberById={memberById} />
      ) : current ? (
        <Lot key={current.id} item={current} number={reveal.index + 1} owner={memberById.get(current.ownerId)} />
      ) : (
        <Intro total={reveal.total} />
      )}

      {!reveal.summary && reveal.index > 0 && (
        <PastLots items={reveal.revealed.slice(0, reveal.index)} memberById={memberById} />
      )}

      <HostBar isHost={isHost} reveal={reveal} hostName={memberById.get(room.hostId)?.name} />
    </main>
  );
}

function Intro({ total }: { total: number }) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-center">
      <span className="kicker">Catalogue de la vente</span>
      <p className="display text-[clamp(3rem,12vw,8rem)]">
        {total} lot{total > 1 ? 's' : ''}
      </p>
      <p className="max-w-md text-lg text-ink-soft">
        Les achats vont être présentés un par un, en alternant les clients. Chacun défend ses choix.
      </p>
    </section>
  );
}

function Lot({ item, number, owner }: { item: RevealedItem; number: number; owner?: PublicMember }) {
  const img = useItemImage(item.id, item.hasImage);
  const price = useCountUp(item.priceCents);
  let host = '';
  try {
    host = item.url ? new URL(item.url).hostname.replace(/^www\./, '') : '';
  } catch {
    /* ignore */
  }

  return (
    <article className="animate-drop grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-10">
      <figure className="flex flex-col gap-2">
        <div className="flex aspect-[4/3] items-center justify-center border-2 border-ink bg-sheet p-3">
          {item.hasImage ? (
            img ? (
              <img src={img} alt={item.name} className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="font-mono text-sm text-ink-soft">chargement de la photographie…</span>
            )
          ) : (
            <span className="text-center font-mono text-sm text-ink-soft">
              aucune photographie
              <br />
              fournie par le vendeur
            </span>
          )}
        </div>
        <figcaption className="kicker">Lot n° {lot(number)} — photographie non contractuelle</figcaption>
      </figure>

      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          {owner && <Monogram name={owner.name} color={owner.color} size={40} />}
          <div>
            <span className="kicker">Acquis par</span>
            <div className="text-2xl font-extrabold [font-stretch:80%]" style={{ color: owner?.color }}>
              {owner?.name ?? 'Client parti'}
            </div>
          </div>
        </div>
        <h2 className="display text-5xl break-words sm:text-6xl">{item.name}</h2>
        <div className="flex">
          <span className="price-tag animate-stamp font-mono text-4xl font-bold sm:text-5xl" style={{ ['--rot' as string]: '-2deg' }}>
            {formatEuros(price)}
          </span>
        </div>
        {item.description && (
          <blockquote className="border-l-4 border-ink pl-4 text-xl leading-snug whitespace-pre-line italic">
            « {item.description} »
          </blockquote>
        )}
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="self-start font-mono text-sm underline decoration-2 underline-offset-4 hover:text-tag"
          >
            Provenance : {host || 'voir la source'} ↗
          </a>
        )}
      </div>
    </article>
  );
}

function PastLots({ items, memberById }: { items: RevealedItem[]; memberById: Map<string, PublicMember> }) {
  return (
    <section>
      <h3 className="kicker border-b border-ink pb-1">Lots précédents</h3>
      <ol className="flex flex-col">
        {[...items].reverse().map((item, i) => (
          <PastLot key={item.id} item={item} n={items.length - i} owner={memberById.get(item.ownerId)} />
        ))}
      </ol>
    </section>
  );
}

function PastLot({ item, n, owner }: { item: RevealedItem; n: number; owner?: PublicMember }) {
  const img = useItemImage(item.id, item.hasImage);
  return (
    <li className="flex items-center gap-3 border-b border-rule py-1.5">
      <span className="w-8 font-mono text-xs text-ink-faint">{lot(n)}</span>
      <ItemThumb url={img} size={28} />
      <span className="leader min-w-0 flex-1">
        <span className="truncate">
          {item.name} <span className="font-mono text-xs" style={{ color: owner?.color }}>({owner?.name ?? '?'})</span>
        </span>
        <span className="font-mono text-sm">{formatEuros(item.priceCents)}</span>
      </span>
    </li>
  );
}

function Summary({
  reveal,
  room,
  memberById,
}: {
  reveal: RevealState;
  room: PublicRoomState;
  memberById: Map<string, PublicMember>;
}) {
  const summary = [...(reveal.summary ?? [])].sort((a, b) => b.spentCents - a.spentCents);
  return (
    <section className="flex flex-col gap-4">
      <p className="font-mono text-sm text-ink-soft">
        Budget de départ par client : <b className="text-ink">{formatEuros(room.config.budgetCents)}</b>
      </p>
      <div className="grid items-start gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {summary.map((s, i) => {
          const m = memberById.get(s.memberId);
          const items = reveal.revealed.filter((it) => it.ownerId === s.memberId);
          return (
            <div key={s.memberId} className="animate-drop relative" style={{ animationDelay: `${i * 120}ms` }}>
              <div className="receipt px-5 text-sm">
                <div className="flex items-center gap-2">
                  {m && <Monogram name={m.name} color={m.color} size={26} />}
                  <span className="truncate text-base font-bold">{m?.name ?? 'Client parti'}</span>
                </div>
                <hr className="perf my-3" />
                {items.length === 0 ? (
                  <p className="py-3 text-center text-ink-soft">— aucun achat —</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {items.map((it) => (
                      <li key={it.id} className="leader">
                        <span className="truncate">{it.name}</span>
                        <span>{formatEuros(it.priceCents)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <hr className="perf my-3" />
                <div className="leader font-bold">
                  <span>TOTAL</span>
                  <span>{formatEuros(s.spentCents)}</span>
                </div>
                <div className="leader">
                  <span>RESTE</span>
                  <span>{formatEuros(s.remainingCents)}</span>
                </div>
                <Barcode value={s.memberId} height={28} className="mt-3 w-full" />
              </div>
              <div className="pointer-events-none absolute top-10 right-3">
                {s.remainingCents === 0 ? (
                  <Stamp color="ok" rotate={-10} className="text-2xl">
                    Tout dépensé
                  </Stamp>
                ) : items.length === 0 ? (
                  <Stamp color="tag" rotate={8} className="text-2xl">
                    Radin
                  </Stamp>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function HostBar({ isHost, reveal, hostName }: { isHost: boolean; reveal: RevealState; hostName?: string }) {
  const atStart = reveal.index === -1 && !reveal.summary;
  const isLast = reveal.index >= reveal.total - 1;
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-ink bg-paper/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        {isHost ? (
          <>
            <Button variant="outline" onClick={actions.revealPrev} disabled={atStart || (reveal.summary !== null && reveal.total === 0)}>
              ←
            </Button>
            <span className="hidden font-mono text-xs text-ink-soft sm:block">flèches du clavier ou espace</span>
            {reveal.summary ? (
              <Button variant="tag" onClick={actions.startVoting}>
                Passer au vote →
              </Button>
            ) : (
              <Button onClick={actions.revealNext}>
                {atStart ? 'Ouvrir la vente' : isLast ? 'Relevé des comptes' : 'Lot suivant →'}
              </Button>
            )}
          </>
        ) : (
          <span className="w-full text-center font-mono text-sm text-ink-soft">
            {hostName ?? 'L’hôte'} tient le marteau.
          </span>
        )}
      </div>
    </div>
  );
}

/** Fait défiler un montant de 0 jusqu'à la cible (effet compteur). */
function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return setValue(target);
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(t === 1 ? target : Math.round((target * eased) / 100) * 100);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}
