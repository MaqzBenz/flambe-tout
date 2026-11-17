import { useEffect, useState } from 'react';
import { serverNow } from '../store';

/** Temps restant (ms) jusqu'à `endsAt` (horloge de l'hôte), rafraîchi 4 fois par seconde. */
export function useCountdown(endsAt: number | null): number {
  const compute = () => (endsAt === null ? 0 : Math.max(0, endsAt - serverNow()));
  const [left, setLeft] = useState(compute);
  useEffect(() => {
    setLeft(compute());
    if (endsAt === null) return;
    const id = setInterval(() => setLeft(compute()), 250);
    return () => clearInterval(id);
  }, [endsAt]);
  return left;
}

/** Afficheur de caisse enregistreuse. */
export function Timer({ endsAt }: { endsAt: number | null }) {
  const left = useCountdown(endsAt);
  const totalSec = Math.ceil(left / 1000);
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  const urgent = totalSec <= 60;
  return (
    <div className="flex flex-col">
      <span className="kicker">Fermeture dans</span>
      <div
        role="timer"
        className={`bg-ink px-3 py-1 font-mono text-4xl leading-none font-bold tabular-nums sm:text-5xl ${
          urgent ? 'text-tag' : 'text-sheet'
        } ${totalSec <= 10 ? 'animate-pulse' : ''}`}
      >
        {mm}
        <span className={totalSec % 2 ? 'opacity-100' : 'opacity-40'}>:</span>
        {ss}
      </div>
    </div>
  );
}
