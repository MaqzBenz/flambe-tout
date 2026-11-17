// Contrat partagé client <-> serveur. Toute donnée de jeu transite par ces types.
import type {
  DuelChoice,
  GameConfig,
  Item,
  ItemInput,
  PodiumEntry,
  PrivateBasket,
  RevealState,
  VoteState,
} from './game';

export * from './game';
export * from './money';

export type Phase = 'LOBBY' | 'CONFIG' | 'SHOPPING' | 'REVEAL' | 'VOTING' | 'PODIUM';
export type Role = 'player' | 'spectator';

export interface PublicMember {
  id: string;
  name: string;
  role: Role;
  color: string;
  isHost: boolean;
  connected: boolean;
}

export interface PublicRoomState {
  code: string;
  phase: Phase;
  hostId: string;
  members: PublicMember[];
  config: GameConfig;
  /** Fin de la phase chronométrée (horloge serveur), sinon null. */
  endsAt: number | null;
  /** Horloge serveur au moment de l'envoi, pour corriger le décalage côté client. */
  serverNow: number;
  /** Avancement visible de tous pendant les achats (sans montants, pour le suspense). */
  progress: Record<string, { items: number; done: boolean }>;
  /** Présentation des achats (phase REVEAL et suivantes). */
  reveal: RevealState | null;
  vote: VoteState | null;
  podium: PodiumEntry[] | null;
}

/** Ce que le client garde (sessionStorage) pour se reconnecter après un rechargement. */
export interface Session {
  code: string;
  memberId: string;
  token: string;
}

export type AckResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };
export type Ack<T = object> = (res: AckResult<T>) => void;

export interface ClientToServerEvents {
  'room:create': (p: { name: string }, ack: Ack<{ session: Session }>) => void;
  'room:join': (p: { code: string; name: string; role: Role }, ack: Ack<{ session: Session }>) => void;
  'room:rejoin': (p: { code: string; token: string }, ack: Ack<{ session: Session }>) => void;
  'room:leave': () => void;
  'room:kick': (p: { memberId: string }) => void;
  'room:close': () => void;

  'config:open': () => void;
  'config:update': (config: GameConfig, ack: Ack) => void;
  'game:start': (ack: Ack) => void;

  'shop:add': (item: ItemInput, ack: Ack<{ item: Item }>) => void;
  'shop:remove': (p: { itemId: string }) => void;
  'shop:done': (p: { done: boolean }) => void;

  'reveal:next': () => void;
  'reveal:prev': () => void;

  'vote:start': () => void;
  'vote:cast': (p: { targetId?: string; choice?: DuelChoice }, ack: Ack) => void;
  'vote:close': () => void;
  'vote:next': () => void;
  'game:replay': () => void;

  'image:get': (p: { itemId: string }, ack: Ack<{ data: ArrayBuffer; mime: string }>) => void;
}

export interface ServerToClientEvents {
  'room:state': (state: PublicRoomState) => void;
  'room:kicked': () => void;
  'room:closed': (reason: string) => void;
  'me:basket': (basket: PrivateBasket) => void;
}

export const LIMITS = {
  NAME_MIN: 1,
  NAME_MAX: 20,
  MIN_PLAYERS: 2,
} as const;

/** Lettres sans I/O pour éviter les confusions à l'oral. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 4;

/** Encres d'imprimerie (lisibles sur papier crème, texte clair par-dessus). */
export const MEMBER_COLORS = [
  '#c4291c', '#24438f', '#2f6b3a', '#a8620f', '#6d2f7a', '#0f6b6b',
  '#8a3b12', '#3b4252', '#a3226b', '#4d5b16', '#1f5f99', '#7a1f2b',
] as const;

export function normalizeRoomCode(code: unknown): string {
  return typeof code === 'string' ? code.trim().toUpperCase().slice(0, ROOM_CODE_LENGTH) : '';
}
