import { create } from 'zustand';
import type { PrivateBasket, PublicRoomState, Session } from '@bg/shared';

const SESSION_KEY = 'flambe:session';

/** Session locale : on retient aussi si ce navigateur est l'hôte (= le serveur de la partie). */
export interface LocalSession extends Session {
  isHost: boolean;
}

interface GameStore {
  /** false pendant une reconnexion d'invité. */
  connected: boolean;
  session: LocalSession | null;
  room: PublicRoomState | null;
  /** Mon panier (privé), reçu uniquement pendant/après les achats. */
  basket: PrivateBasket | null;
  /** Décalage horloge de l'hôte - horloge locale (ms). */
  clockOffset: number;
  /** Message affiché sur l'écran d'accueil (salon fermé, expulsion…). */
  notice: string | null;
}

export const useGame = create<GameStore>(() => ({
  connected: true,
  session: null,
  room: null,
  basket: null,
  clockOffset: 0,
  notice: null,
}));

/** Heure de l'hôte estimée, pour que tout le monde voie le même chrono. */
export const serverNow = () => Date.now() + useGame.getState().clockOffset;

// sessionStorage : survit à un rechargement de l'onglet, disparaît à sa fermeture.
// On n'y garde que l'identifiant de reconnexion, jamais de données de partie.
export function loadSession(): LocalSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as LocalSession) : null;
  } catch {
    return null;
  }
}

export function setSession(session: LocalSession): void {
  useGame.setState({ session, notice: null, connected: true });
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* navigation privée : pas de reconnexion auto */
  }
}

export function resetSession(notice: string | null = null): void {
  useGame.setState({ session: null, room: null, basket: null, notice, connected: true });
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
