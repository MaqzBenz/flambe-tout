import { useState } from 'react';
import {
  formatEuros,
  type CriterionResult,
  type DuelChoice,
  type PublicMember,
  type PublicRoomState,
  type RevealedItem,
  type VoteState,
} from '@bg/shared';
import { actions } from '../net/session';
import { useItemImage } from '../lib/imageCache';
import { formatPoints } from '../lib/points';
import { ItemThumb } from '../components/ImagePicker';
import { BallotBox, Button, Monogram, Sheet, Stamp } from '../components/ui';
import { Masthead } from '../components/Masthead';

const MODE_RULES: Record<VoteState['mode'], string> = {
  standard: 'Vote secret. Interdiction de voter pour soi-même. En cas d’égalité, le point est partagé.',
  jury: 'Duel à deux clients : seul le jury de spectateurs vote, à bulletin secret.',
  duel:
    'Duel à deux. Seul à revendiquer : tu gagnes le point. Les deux concèdent : ½ point chacun. Les deux revendiquent : personne ne marque.',
};

export function Voting({ room, meId }: { room: PublicRoomState; meId: string }) {
  const vote = room.vote;
  if (!vote) return null;
  const isHost = room.hostId === meId;
  const memberById = new Map(room.members.map((m) => [m.id, m]));
  const items = room.reveal?.revealed ?? [];
  const canVote = vote.eligible.includes(meId);
  const hasVoted = vote.voted.includes(meId);
  const scrutin = String(vote.index + 1).padStart(2, '0');

  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-6 px-4 py-6 pb-28">
      <Masthead
        code={room.code}
        section={`Scrutin n° ${scrutin}`}
        right={<span className="font-mono">sur {String(vote.total).padStart(2, '0')}</span>}
      />

      <Sheet className="flex flex-col gap-6 p-5 sm:p-8">
        <div className="text-center">
          <span className="kicker">{vote.mode === 'duel' ? 'Revendique ou concède' : 'Bulletin de vote'}</span>
          <h2 key={vote.index} className="display animate-drop mt-1 text-4xl sm:text-6xl">
            {vote.criterion.label}
          </h2>
          {vote.status === 'open' && <p className="mx-auto mt-3 max-w-xl font-mono text-sm text-ink-soft">{MODE_RULES[vote.mode]}</p>}
        </div>
        <hr className="perf" />

        {vote.status === 'result' && vote.result ? (
          <Count result={vote.result} memberById={memberById} />
        ) : !canVote ? (
          <p className="py-8 text-center text-xl">
            {vote.mode === 'jury' ? 'Le jury délibère. Silence dans la salle.' : 'Dépouillement imminent…'}
          </p>
        ) : hasVoted ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <Stamp color="stamp" rotate={-6} className="text-5xl">
              A voté
            </Stamp>
            <p className="font-mono text-sm text-ink-soft">Ton bulletin est dans l’urne. Personne ne saura pour qui.</p>
          </div>
        ) : vote.mode === 'duel' ? (
          <DuelBallot opponent={memberById.get(vote.candidates.find((c) => c !== meId) ?? '')} />
        ) : (
          <BallotPaper key={vote.index} candidates={vote.candidates.filter((c) => c !== meId)} memberById={memberById} items={items} />
        )}
      </Sheet>

      {vote.status === 'open' && <Register vote={vote} memberById={memberById} />}

      {isHost && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-ink bg-paper/95 backdrop-blur-sm">
          <div className="mx-auto flex max-w-4xl justify-end gap-3 px-4 py-3">
            {vote.status === 'open' ? (
              <Button
                variant="outline"
                onClick={() => confirm('Clore le scrutin maintenant ? Les bulletins manquants ne compteront pas.') && actions.voteClose()}
              >
                Clore le scrutin
              </Button>
            ) : (
              <Button variant="tag" onClick={actions.voteNext}>
                {vote.index >= vote.total - 1 ? 'Proclamer les résultats' : 'Scrutin suivant →'}
              </Button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function BallotPaper({
  candidates,
  memberById,
  items,
}: {
  candidates: string[];
  memberById: Map<string, PublicMember>;
  items: RevealedItem[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!selected) return;
    setBusy(true);
    setError(await actions.voteCast({ targetId: selected }));
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="kicker text-center">Cocher une seule case</p>
      <ul className="flex flex-col">
        {candidates.map((id) => {
          const m = memberById.get(id);
          const mine = items.filter((i) => i.ownerId === id);
          const spent = mine.reduce((s, i) => s + i.priceCents, 0);
          const on = selected === id;
          return (
            <li key={id}>
              <button
                onClick={() => setSelected(id)}
                aria-pressed={on}
                className={`flex w-full cursor-pointer items-center gap-4 border-b border-rule px-2 py-3 text-left transition-colors ${on ? 'bg-paper-deep' : 'hover:bg-paper/60'}`}
              >
                <BallotBox checked={on} size={30} />
                {m && <Monogram name={m.name} color={m.color} size={34} />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-2xl font-extrabold [font-stretch:75%]">{m?.name ?? 'Client parti'}</span>
                  <span className="font-mono text-xs text-ink-soft">
                    {mine.length} article{mine.length > 1 ? 's' : ''} · {formatEuros(spent)}
                  </span>
                </span>
                <span className="hidden gap-1 sm:flex">
                  {mine.slice(0, 5).map((i) => (
                    <Mini key={i.id} item={i} />
                  ))}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="text-center font-mono font-bold text-tag">{error}</p>}
      <Button size="lg" disabled={!selected || busy} onClick={submit}>
        {selected ? `Glisser dans l’urne — ${memberById.get(selected)?.name ?? ''}` : 'Choisis un client'}
      </Button>
    </div>
  );
}

function Mini({ item }: { item: RevealedItem }) {
  const img = useItemImage(item.id, item.hasImage);
  return (
    <span title={`${item.name} — ${formatEuros(item.priceCents)}`}>
      <ItemThumb url={img} size={34} />
    </span>
  );
}

function DuelBallot({ opponent }: { opponent?: PublicMember }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function pick(choice: DuelChoice) {
    setBusy(true);
    setError(await actions.voteCast({ choice }));
    setBusy(false);
  }
  const option = (choice: DuelChoice, title: string, sub: string, tone: string) => (
    <button
      disabled={busy}
      onClick={() => pick(choice)}
      className={`group flex cursor-pointer flex-col items-start gap-2 border-2 border-ink p-5 text-left transition-colors hover:bg-ink hover:text-sheet disabled:opacity-50`}
    >
      <BallotBox checked={false} size={28} />
      <span className={`display text-5xl ${tone} group-hover:text-sheet`}>{title}</span>
      <span className="font-mono text-sm opacity-75">{sub}</span>
    </button>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {option('claim', 'Je revendique', 'Ce point me revient.', 'text-tag')}
        {option('concede', 'Je concède', `${opponent?.name ?? 'L’autre'} le mérite.`, 'text-stamp')}
      </div>
      {error && <p className="text-center font-mono font-bold text-tag">{error}</p>}
    </div>
  );
}

/** Liste d'émargement : qui a déjà voté (jamais pour qui). */
function Register({ vote, memberById }: { vote: VoteState; memberById: Map<string, PublicMember> }) {
  return (
    <section>
      <div className="flex items-baseline justify-between border-b border-ink pb-1">
        <h3 className="kicker">Liste d’émargement</h3>
        <span className="font-mono text-sm">
          {vote.voted.length}/{vote.eligible.length}
        </span>
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 pt-2 font-mono text-sm">
        {vote.eligible.map((id) => {
          const done = vote.voted.includes(id);
          return (
            <li key={id} className={done ? '' : 'text-ink-faint'}>
              {memberById.get(id)?.name} {done ? '— signé' : '— …'}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Bâtons de comptage, regroupés par cinq. */
function TallyMarks({ n }: { n: number }) {
  const groups = Array.from({ length: Math.ceil(n / 5) }, (_, g) => Math.min(5, n - g * 5));
  if (n === 0) return <span className="font-mono text-sm text-ink-faint">aucune voix</span>;
  return (
    <span className="inline-flex flex-wrap gap-3">
      {groups.map((k, g) => (
        <svg key={g} viewBox="0 0 34 26" className="h-6 w-8 text-ink" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          {Array.from({ length: Math.min(k, 4) }, (_, i) => (
            <path key={i} d={`M${5 + i * 7} 3 L${4 + i * 7} 23`} />
          ))}
          {k === 5 && <path d="M1 19 L32 6" className="text-tag" stroke="currentColor" />}
        </svg>
      ))}
    </span>
  );
}

function Count({ result, memberById }: { result: CriterionResult; memberById: Map<string, PublicMember> }) {
  const name = (id: string) => memberById.get(id)?.name ?? 'Client parti';
  let headline: string;
  if (result.duel) {
    headline =
      result.duel.outcome === 'claim'
        ? `${name(result.winners[0])} empoche le point`
        : result.duel.outcome === 'both-concede'
          ? 'Courtoisie mutuelle : ½ point chacun'
          : 'Les deux revendiquent : personne ne marque';
  } else if (result.winners.length === 0) headline = 'Aucun bulletin : point non attribué';
  else if (result.winners.length === 1) headline = `${name(result.winners[0])} est élu·e`;
  else headline = `Égalité : ${result.winners.map(name).join(', ')}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="kicker">Résultat du dépouillement</span>
        <p className="display text-4xl sm:text-5xl">{headline}</p>
        {result.pointsEach > 0 && (
          <span className="font-mono text-lg">
            + {formatPoints(result.pointsEach)} point{result.pointsEach > 1 ? 's' : ''}
            {result.winners.length > 1 ? ' chacun' : ''}
          </span>
        )}
      </div>

      {result.duel ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(result.duel.choices).map(([id, c]) => (
            <div key={id} className="flex items-center justify-between border-2 border-ink p-3">
              <span className="text-xl font-bold [font-stretch:80%]">{name(id)}</span>
              <Stamp color={c === 'claim' ? 'tag' : 'stamp'} rotate={c === 'claim' ? -6 : 5} className="text-xl">
                {c === 'claim' ? 'Revendique' : 'Concède'}
              </Stamp>
            </div>
          ))}
        </div>
      ) : (
        <ul className="flex flex-col">
          {result.tally.map((t) => {
            const won = result.winners.includes(t.memberId);
            const m = memberById.get(t.memberId);
            return (
              <li key={t.memberId} className="relative flex items-center gap-4 border-b border-rule py-3">
                {m && <Monogram name={m.name} color={m.color} size={30} />}
                <span className="w-32 truncate text-xl font-bold [font-stretch:80%] sm:w-48">{name(t.memberId)}</span>
                <span className="flex-1">
                  <TallyMarks n={t.votes} />
                </span>
                <span className="w-16 text-right font-mono text-sm">{t.votes} voix</span>
                {won && (
                  <span className="pointer-events-none absolute top-1 right-24">
                    <Stamp rotate={-10} className="text-2xl">
                      Élu
                    </Stamp>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!result.duel && <p className="text-center font-mono text-xs text-ink-soft">Seul le total est connu : aucun bulletin n’est rattaché à un votant.</p>}
    </div>
  );
}
