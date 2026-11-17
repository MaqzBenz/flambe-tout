import { useGame } from './store';
import { ConnectionBanner } from './components/ui';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { Config } from './screens/Config';
import { Shopping } from './screens/Shopping';
import { Reveal } from './screens/Reveal';
import { Voting } from './screens/Voting';
import { Podium } from './screens/Podium';

export function App() {
  const { connected, session, room } = useGame();
  const inRoom = session && room && room.code === session.code;

  if (session && !inRoom) {
    // Reconnexion d'un invité après un rechargement de page.
    return (
      <main className="grid min-h-dvh place-items-center px-4 text-center">
        <div>
          <p className="display text-5xl">Reconnexion…</p>
          <p className="mt-2 font-mono text-sm text-ink-soft">On retrouve ta place dans le salon {session.code}.</p>
        </div>
      </main>
    );
  }

  return (
    <>
      <ConnectionBanner connected={connected} />
      {!inRoom ? (
        <Home />
      ) : room.phase === 'LOBBY' ? (
        <Lobby room={room} meId={session.memberId} />
      ) : room.phase === 'CONFIG' ? (
        <Config room={room} meId={session.memberId} />
      ) : room.phase === 'SHOPPING' ? (
        <Shopping room={room} meId={session.memberId} />
      ) : room.phase === 'REVEAL' ? (
        <Reveal room={room} meId={session.memberId} />
      ) : room.phase === 'VOTING' ? (
        <Voting room={room} meId={session.memberId} />
      ) : (
        <Podium room={room} meId={session.memberId} />
      )}
    </>
  );
}
