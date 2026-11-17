import { useState } from 'react';
import { LIMITS, type PublicMember, type PublicRoomState } from '@bg/shared';
import { actions } from '../net/session';
import { Barcode, Button, Monogram } from '../components/ui';
import { Masthead } from '../components/Masthead';

export function inviteUrl(code: string): string {
  const url = new URL(location.href);
  url.search = `?code=${code}`;
  url.hash = '';
  return url.toString();
}

export function Lobby({ room, meId }: { room: PublicRoomState; meId: string }) {
  const [copied, setCopied] = useState(false);
  const isHost = room.hostId === meId;
  const players = room.members.filter((m) => m.role === 'player');
  const spectators = room.members.filter((m) => m.role === 'spectator');
  const canStart = players.length >= LIMITS.MIN_PLAYERS;

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl(room.code));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      prompt('Copie ce lien :', inviteUrl(room.code));
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-8 px-4 py-6">
      <Masthead code={room.code} section="Salle d’attente" />

      <div className="grid items-start gap-8 md:grid-cols-[minmax(0,320px)_1fr]">
        {/* Ticket avec le code du salon */}
        <aside className="receipt animate-print mx-auto w-full max-w-xs px-6 text-center">
          <div className="text-sm tracking-widest">FLAMBE TOUT</div>
          <div className="text-xs text-ink-soft">ticket d’entrée — valable pour une partie</div>
          <hr className="perf my-3" />
          <div className="text-xs tracking-widest">CODE DU SALON</div>
          <div className="text-6xl leading-tight font-bold tracking-[0.25em]">{room.code}</div>
          <Barcode value={room.code} className="mx-auto mt-2 w-full text-ink" />
          <hr className="perf my-3" />
          <button onClick={copyInvite} className="w-full cursor-pointer border-2 border-ink py-2 text-sm font-bold uppercase hover:bg-ink hover:text-sheet">
            {copied ? 'Lien copié' : 'Copier le lien d’invitation'}
          </button>
          <p className="mt-3 text-xs text-ink-soft">Les invités peuvent aussi taper le code sur la page d’accueil.</p>
        </aside>

        <section className="flex flex-col gap-6">
          <Register title="Clients" members={players} meId={meId} canKick={isHost} />
          {spectators.length > 0 && <Register title="Spectateurs" members={spectators} meId={meId} canKick={isHost} />}
        </section>
      </div>

      <footer className="mt-auto flex flex-col gap-3 border-t-2 border-ink pt-4 sm:flex-row sm:items-center sm:justify-between">
        {isHost ? (
          <>
            <p className="font-mono text-sm text-ink-soft">
              {canStart
                ? 'Tout le monde est là ? Réglons les conditions de vente.'
                : `Il faudra au moins ${LIMITS.MIN_PLAYERS} clients pour lancer.`}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => confirm('Fermer le salon ? Tout le monde sera déconnecté.') && actions.closeRoom()}
              >
                Fermer
              </Button>
              <Button onClick={actions.openConfig}>Conditions de vente →</Button>
            </div>
          </>
        ) : (
          <>
            <p className="font-mono text-sm text-ink-soft">En attente de l’hôte…</p>
            <Button variant="outline" onClick={actions.leaveRoom}>
              Quitter
            </Button>
          </>
        )}
      </footer>
    </main>
  );
}

function Register({
  title,
  members,
  meId,
  canKick,
}: {
  title: string;
  members: PublicMember[];
  meId: string;
  canKick: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between border-b-2 border-ink pb-1">
        <h2 className="display text-3xl">{title}</h2>
        <span className="font-mono text-sm">{String(members.length).padStart(2, '0')} inscrit(s)</span>
      </div>
      <ol>
        {members.map((m, i) => (
          <li
            key={m.id}
            className={`animate-drop flex items-center gap-3 border-b border-rule py-2.5 ${m.connected ? '' : 'opacity-45'}`}
          >
            <span className="w-7 font-mono text-sm text-ink-faint">{String(i + 1).padStart(2, '0')}</span>
            <Monogram name={m.name} color={m.color} size={32} />
            <span className="leader min-w-0 flex-1 text-lg font-semibold">
              <span className="truncate">
                {m.name}
                {m.id === meId && <span className="ml-1.5 font-mono text-sm font-normal text-ink-soft">(toi)</span>}
              </span>
              <span className="font-mono text-xs tracking-widest text-ink-soft uppercase">
                {m.isHost ? 'hôte' : !m.connected ? 'absent' : m.role === 'spectator' ? 'spectateur' : 'client'}
              </span>
            </span>
            {canKick && m.id !== meId && (
              <button
                onClick={() => confirm(`Retirer ${m.name} du salon ?`) && actions.kick(m.id)}
                className="cursor-pointer font-mono text-xs text-ink-soft underline hover:text-tag"
              >
                retirer
              </button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
