import { useState, type FormEvent } from 'react';
import {
  BONUS_LABELS,
  BUDGET_PRESETS_CENTS,
  DEFAULT_CRITERIA,
  DURATION_PRESETS_SEC,
  GAME_LIMITS,
  LIMITS,
  formatEuros,
  formatEurosCompact,
  parseEuroInput,
  type Criterion,
  type GameConfig,
  type PublicRoomState,
} from '@bg/shared';
import { actions } from '../net/session';
import { Ballot, Button, Choice, Input, Monogram, Sheet } from '../components/ui';
import { Masthead, SectionTitle } from '../components/Masthead';

export function Config({ room, meId }: { room: PublicRoomState; meId: string }) {
  const isHost = room.hostId === meId;
  const players = room.members.filter((m) => m.role === 'player');
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const config = room.config;
  const ready = players.length >= LIMITS.MIN_PLAYERS && config.criteria.length > 0;

  async function update(patch: Partial<GameConfig>) {
    setError(await actions.updateConfig({ ...config, ...patch }));
  }

  async function start() {
    setStarting(true);
    setError(await actions.startGame());
    setStarting(false);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-6 px-4 py-6 pb-28">
      <Masthead
        code={room.code}
        section="Bon de commande"
        right={
          <div className="flex -space-x-1">
            {room.members.map((m) => (
              <span key={m.id} title={m.name} className={m.connected ? '' : 'opacity-40'}>
                <Monogram name={m.name} color={m.color} size={30} />
              </span>
            ))}
          </div>
        }
      />
      <p className="font-mono text-sm text-ink-soft">
        {isHost
          ? 'Remplis le bon. Les autres le voient se compléter en direct.'
          : 'L’hôte remplit le bon de commande. Lecture seule.'}
      </p>

      <Sheet className="flex flex-col gap-8 p-5 sm:p-8">
        <section className="flex flex-col gap-3">
          <SectionTitle n={1} aside={formatEuros(config.budgetCents)}>
            Budget alloué à chaque client
          </SectionTitle>
          <Choice
            disabled={!isHost}
            value={config.budgetCents}
            onChange={(budgetCents) => update({ budgetCents })}
            options={BUDGET_PRESETS_CENTS.map((c) => ({ value: c, label: formatEurosCompact(c) }))}
          />
          {isHost && (
            <FreeEntry
              label="Ou montant libre"
              placeholder="42 000 000 · 3,5M · 2 milliards"
              parse={(s) => {
                const c = parseEuroInput(s);
                return c && c >= GAME_LIMITS.BUDGET_MIN_CENTS && c <= GAME_LIMITS.BUDGET_MAX_CENTS ? c : null;
              }}
              preview={formatEuros}
              onSubmit={(budgetCents) => update({ budgetCents })}
            />
          )}
        </section>

        <section className="flex flex-col gap-3">
          <SectionTitle n={2} aside={`${Math.round((config.durationSec / 60) * 10) / 10} min`}>
            Durée d’ouverture du magasin
          </SectionTitle>
          <Choice
            disabled={!isHost}
            value={config.durationSec}
            onChange={(durationSec) => update({ durationSec })}
            options={DURATION_PRESETS_SEC.map((s) => ({ value: s, label: `${s / 60} min` }))}
          />
          {isHost && (
            <FreeEntry
              label="Ou durée libre (minutes)"
              placeholder="1 à 60"
              inputMode="decimal"
              parse={(s) => {
                const sec = Math.round(Number(s.replace(',', '.')) * 60);
                return sec >= GAME_LIMITS.DURATION_MIN_SEC && sec <= GAME_LIMITS.DURATION_MAX_SEC ? sec : null;
              }}
              preview={(sec) => `${Math.floor(sec / 60)} min${sec % 60 ? ` ${sec % 60} s` : ''}`}
              onSubmit={(durationSec) => update({ durationSec })}
            />
          )}
        </section>

        <section className="flex flex-col gap-3">
          <SectionTitle n={3}>Justificatifs</SectionTitle>
          <Ballot disabled={!isHost} checked={config.requireUrl} onChange={(requireUrl) => update({ requireUrl })}>
            Lien source obligatoire pour chaque article
          </Ballot>
        </section>

        <CriteriaSection config={config} isHost={isHost} onChange={(criteria) => update({ criteria })} />

        <section className="flex flex-col gap-3">
          <SectionTitle n={5} aside="+1 pt chacune, sans vote">
            Primes automatiques
          </SectionTitle>
          {(Object.keys(BONUS_LABELS) as (keyof GameConfig['bonuses'])[]).map((key) => (
            <Ballot
              key={key}
              disabled={!isHost}
              checked={config.bonuses[key]}
              onChange={(v) => update({ bonuses: { ...config.bonuses, [key]: v } })}
            >
              {BONUS_LABELS[key].label}
            </Ballot>
          ))}
        </section>
      </Sheet>

      {error && <p className="text-center font-mono font-bold text-tag">{error}</p>}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-ink bg-paper/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3">
          <span className="font-mono text-sm text-ink-soft">
            {players.length} client{players.length > 1 ? 's' : ''} · {config.criteria.length} critère
            {config.criteria.length > 1 ? 's' : ''}
          </span>
          {isHost ? (
            <Button variant="tag" disabled={!ready || starting} onClick={start}>
              {players.length < LIMITS.MIN_PLAYERS ? `Il manque ${LIMITS.MIN_PLAYERS - players.length} client(s)` : 'Ouvrir le magasin'}
            </Button>
          ) : (
            <span className="font-mono text-sm">Prépare-toi…</span>
          )}
        </div>
      </div>
    </main>
  );
}

function FreeEntry({
  label,
  placeholder,
  parse,
  preview,
  onSubmit,
  inputMode,
}: {
  label: string;
  placeholder: string;
  parse: (s: string) => number | null;
  preview: (v: number) => string;
  onSubmit: (v: number) => void;
  inputMode?: 'numeric' | 'decimal';
}) {
  const [text, setText] = useState('');
  const value = text.trim() ? parse(text) : null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value !== null) {
      onSubmit(value);
      setText('');
    }
  };
  return (
    <form onSubmit={submit} className="flex max-w-md items-end gap-3">
      <label className="flex flex-1 flex-col gap-1">
        <span className="kicker">{label}</span>
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} inputMode={inputMode} />
        <span className={`h-4 font-mono text-xs ${value === null ? 'text-tag' : 'text-ink-soft'}`}>
          {text.trim() ? (value === null ? 'valeur invalide' : `= ${preview(value)}`) : ''}
        </span>
      </label>
      <Button type="submit" variant="outline" size="sm" disabled={value === null} className="mb-5">
        Appliquer
      </Button>
    </form>
  );
}

function CriteriaSection({
  config,
  isHost,
  onChange,
}: {
  config: GameConfig;
  isHost: boolean;
  onChange: (c: Criterion[]) => void;
}) {
  const [custom, setCustom] = useState('');
  const selected = new Set(config.criteria.map((c) => c.id));
  const customs = config.criteria.filter((c) => !DEFAULT_CRITERIA.some((d) => d.id === c.id));
  const full = config.criteria.length >= GAME_LIMITS.CRITERIA_MAX;
  const list = isHost ? [...DEFAULT_CRITERIA, ...customs] : config.criteria;

  const toggle = (c: Criterion, on: boolean) =>
    onChange(on ? [...config.criteria, c] : config.criteria.filter((x) => x.id !== c.id));

  const addCustom = (e: FormEvent) => {
    e.preventDefault();
    const label = custom.trim();
    if (!label || full) return;
    onChange([...config.criteria, { id: `c-${Math.random().toString(36).slice(2, 10)}`, emoji: '', label }]);
    setCustom('');
  };

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle n={4} aside={`${config.criteria.length} retenu(s)`}>
        Critères soumis au vote
      </SectionTitle>
      <div className="grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
        {list.map((c) => {
          const on = selected.has(c.id);
          return (
            <Ballot key={c.id} checked={on} disabled={!isHost || (!on && full)} onChange={(v) => toggle(c, v)}>
              {c.label}
            </Ballot>
          );
        })}
      </div>
      {isHost && (
        <form onSubmit={addCustom} className="flex max-w-md items-end gap-3 pt-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="kicker">Critère personnalisé</span>
            <Input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              maxLength={GAME_LIMITS.CRITERION_LABEL_MAX}
              placeholder="Ex. : le plus kitsch"
            />
          </label>
          <Button type="submit" variant="outline" size="sm" disabled={!custom.trim() || full}>
            Ajouter
          </Button>
        </form>
      )}
    </section>
  );
}
