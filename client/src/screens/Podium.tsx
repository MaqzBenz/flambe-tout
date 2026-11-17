import type { PodiumEntry, PublicRoomState } from '@bg/shared';
import { actions } from '../net/session';
import { formatPoints } from '../lib/points';
import { Button, Monogram, Sheet, Stamp } from '../components/ui';
import { Masthead } from '../components/Masthead';

const ordinal = (n: number) => (n === 1 ? '1er' : `${n}e`);
/** Ordre visuel du podium : 2e, 1er, 3e. */
const SLOTS = [1, 0, 2];
const HEIGHT = ['h-44', 'h-32', 'h-24'];

export function Podium({ room, meId }: { room: PublicRoomState; meId: string }) {
  const ranking = room.podium ?? [];
  const isHost = room.hostId === meId;
  const winners = ranking.filter((e) => e.rank === 1);
  const top3 = ranking.slice(0, 3);

  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-8 px-4 py-6">
      <Masthead code={room.code} section="Palmarès" />

      <section className="relative text-center">
        <span className="kicker">{winners.length > 1 ? 'Ex æquo en tête' : 'Grand gagnant de la soirée'}</span>
        <p className="display mt-1 text-[clamp(3.5rem,14vw,9rem)] text-tag">
          {winners.map((w) => w.name).join(' & ') || '—'}
        </p>
        <div className="pointer-events-none absolute top-2 right-0 hidden sm:block">
          <Stamp color="stamp" rotate={12} className="text-2xl">
            Officiel
          </Stamp>
        </div>
      </section>

      {top3.length > 0 && (
        <div className="flex items-end justify-center gap-2 border-b-4 border-ink sm:gap-4">
          {SLOTS.filter((i) => top3[i]).map((i) => (
            <Step key={top3[i].memberId} entry={top3[i]} delay={(2 - i) * 180} />
          ))}
        </div>
      )}

      <Sheet className="p-5 sm:p-7">
        <div className="flex items-baseline justify-between border-b-2 border-ink pb-1">
          <h2 className="display text-3xl">Feuille des résultats</h2>
          <span className="kicker">points</span>
        </div>
        <ol>
          {ranking.map((e) => (
            <li key={e.memberId} className="border-b border-rule py-3">
              <div className="flex items-center gap-3">
                <span className="display w-14 text-4xl text-ink-soft">{ordinal(e.rank)}</span>
                <Monogram name={e.name} color={e.color} size={30} />
                <span className="leader min-w-0 flex-1 text-xl font-bold">
                  <span className="truncate">
                    {e.name}
                    {e.memberId === meId && <span className="ml-1.5 font-mono text-sm font-normal text-ink-soft">(toi)</span>}
                  </span>
                  <span className="font-mono text-2xl">{formatPoints(e.points)}</span>
                </span>
              </div>
              {e.awards.length > 0 ? (
                <ul className="mt-1.5 ml-10 sm:ml-[5.5rem] flex flex-col gap-0.5 font-mono text-sm text-ink-soft">
                  {e.awards.map((a, i) => (
                    <li key={i} className="leader">
                      <span className="truncate">{a.label}</span>
                      <span className="text-ink">+{formatPoints(a.points)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 ml-10 sm:ml-[5.5rem] font-mono text-sm text-ink-faint italic">aucune distinction</p>
              )}
            </li>
          ))}
        </ol>
      </Sheet>

      <footer className="mt-auto flex flex-col gap-3 border-t-2 border-ink pt-4 sm:flex-row sm:justify-end">
        {isHost ? (
          <>
            <Button
              variant="outline"
              onClick={() => confirm('Fermer le salon ? Toutes les données et images seront effacées.') && actions.closeRoom()}
            >
              Fermer et tout effacer
            </Button>
            <Button variant="tag" onClick={actions.replay}>
              Nouvelle partie, mêmes clients
            </Button>
          </>
        ) : (
          <>
            <p className="font-mono text-sm text-ink-soft sm:mr-auto sm:self-center">L’hôte peut relancer une partie.</p>
            <Button variant="outline" onClick={actions.leaveRoom}>
              Quitter
            </Button>
          </>
        )}
      </footer>
    </main>
  );
}

function Step({ entry, delay }: { entry: PodiumEntry; delay: number }) {
  const tier = Math.min(entry.rank - 1, 2);
  return (
    <div className="animate-drop flex w-28 flex-col items-center gap-2 sm:w-40" style={{ animationDelay: `${delay}ms` }}>
      <Monogram name={entry.name} color={entry.color} size={tier === 0 ? 56 : 44} />
      <span className="max-w-full truncate text-lg font-bold [font-stretch:80%]">{entry.name}</span>
      <div
        className={`flex w-full flex-col items-center justify-start border-2 border-b-0 border-ink pt-2 ${HEIGHT[tier]} ${
          tier === 0 ? 'bg-ink text-sheet' : 'bg-sheet'
        }`}
      >
        <span className="display text-5xl">{ordinal(entry.rank)}</span>
        <span className="font-mono text-sm">{formatPoints(entry.points)} pts</span>
      </div>
    </div>
  );
}
