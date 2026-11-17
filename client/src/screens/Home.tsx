import { useState, type FormEvent } from 'react';
import { LIMITS, ROOM_CODE_LENGTH, normalizeRoomCode } from '@bg/shared';
import { actions } from '../net/session';
import { useGame } from '../store';
import { Ballot, Button, Field, Input, Notice } from '../components/ui';

export function Home() {
  const notice = useGame((s) => s.notice);
  const invitedCode = normalizeRoomCode(new URLSearchParams(location.search).get('code'));

  const [name, setName] = useState('');
  const [code, setCode] = useState(invitedCode);
  const [spectator, setSpectator] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);

  const nameOk = name.trim().length >= LIMITS.NAME_MIN;
  const codeOk = code.length === ROOM_CODE_LENGTH;

  async function run(kind: 'create' | 'join', task: () => Promise<string | null>) {
    setBusy(kind);
    setError(null);
    const err = await task();
    setBusy(null);
    if (err) setError(err);
  }

  const onJoin = (e: FormEvent) => {
    e.preventDefault();
    if (nameOk && codeOk) run('join', () => actions.joinRoom(code, name, spectator ? 'spectator' : 'player'));
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-8 px-4 py-6 sm:py-10">
      <header className="flex flex-col gap-2 text-center">
        <div className="flex items-center justify-between border-b-2 border-ink pb-1">
          <span className="kicker">Grand magasin de l’absurde</span>
          <span className="kicker">Ouvert 24 h / 24</span>
        </div>
        <h1 className="display mt-2 text-[clamp(4.5rem,21vw,12rem)]">
          Flambe <span className="text-tag">Tout</span>
        </h1>
        <hr className="rule-double" />
        <p className="mx-auto max-w-xl pt-1 text-lg text-ink-soft [font-stretch:90%]">
          Un budget délirant, un chrono qui tourne, des achats à justifier devant tout le monde. Puis on vote.
        </p>
      </header>

      {notice && <Notice>{notice}</Notice>}

      <section className="mx-auto w-full max-w-md">
        <Field label="Ton nom, client·e">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={LIMITS.NAME_MAX}
            placeholder="Ex. : Picsou du 93"
            autoFocus
            className="text-2xl"
          />
        </Field>
      </section>

      <div className={`grid gap-6 ${invitedCode ? '' : 'md:grid-cols-2'}`}>
        {!invitedCode && (
          <Coupon number="01" title="Ouvrir une caisse" subtitle="Tu crées le salon et tu deviens l’hôte.">
            <p className="font-mono text-sm text-ink-soft">
              Ton navigateur fait office de serveur : garde cet onglet ouvert pendant toute la partie.
            </p>
            <Button disabled={!nameOk || busy !== null} onClick={() => run('create', () => actions.createRoom(name))}>
              {busy === 'create' ? 'Ouverture…' : 'Créer le salon'}
            </Button>
          </Coupon>
        )}

        <Coupon
          number={invitedCode ? '01' : '02'}
          title={invitedCode ? 'Tu es invité·e' : 'Rejoindre une caisse'}
          subtitle="Entre le code à quatre lettres donné par l’hôte."
        >
          <form onSubmit={onJoin} className="flex flex-col gap-4">
            <input
              value={code}
              onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
              placeholder="ABCD"
              aria-label="Code du salon"
              autoComplete="off"
              spellCheck={false}
              className="w-full border-2 border-ink bg-sheet py-2 text-center font-mono text-5xl font-bold tracking-[0.4em] uppercase outline-none placeholder:text-rule focus:border-tag"
            />
            <Ballot checked={spectator} onChange={setSpectator}>
              Venir en spectateur (je vote, je n’achète pas)
            </Ballot>
            <Button type="submit" variant="outline" disabled={!nameOk || !codeOk || busy !== null}>
              {busy === 'join' ? 'Connexion…' : 'Entrer'}
            </Button>
          </form>
        </Coupon>
      </div>

      {error && <p className="text-center font-mono font-bold text-tag">{error}</p>}

      <footer className="mt-auto border-t border-ink pt-2 text-center font-mono text-xs text-ink-soft">
        Aucun compte, aucune base de données. Les achats et les images restent dans les navigateurs le temps de la
        partie, puis disparaissent.
      </footer>
    </main>
  );
}

function Coupon({
  number,
  title,
  subtitle,
  children,
}: {
  number: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="relative border-2 border-dashed border-ink bg-sheet/70 p-5 pt-6">
      <span className="absolute -top-3 left-4 bg-paper px-2 font-mono text-xs tracking-widest">BON N° {number}</span>
      <h2 className="display text-4xl">{title}</h2>
      <p className="mt-1 mb-4 text-ink-soft">{subtitle}</p>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}
