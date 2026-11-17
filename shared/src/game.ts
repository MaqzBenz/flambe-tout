// Configuration de partie, critères et articles.

export interface Criterion {
  id: string;
  emoji: string;
  label: string;
}

export interface GameConfig {
  budgetCents: number;
  durationSec: number;
  requireUrl: boolean;
  criteria: Criterion[];
  bonuses: {
    closestToZero: boolean;
    mostItems: boolean;
    biggestPurchase: boolean;
  };
}

export interface Item {
  id: string;
  name: string;
  priceCents: number;
  url?: string;
  description?: string;
  /** L'image elle-même ne voyage jamais dans l'état : elle se récupère à la demande (image:get). */
  hasImage: boolean;
}

export type ItemInput = Omit<Item, 'id' | 'hasImage'> & {
  /** Image déjà compressée côté client (WebP/JPEG), envoyée en binaire. */
  image?: ArrayBuffer;
};

/** Article révélé, avec son propriétaire. */
export interface RevealedItem extends Item {
  ownerId: string;
}

export interface PlayerSummary {
  memberId: string;
  spentCents: number;
  remainingCents: number;
  itemCount: number;
}

export interface RevealState {
  /** -1 = écran d'intro, puis index du dernier article révélé. */
  index: number;
  total: number;
  /** Articles déjà révélés, dans l'ordre (alterné entre joueurs). */
  revealed: RevealedItem[];
  /** Récapitulatif global, présent seulement une fois tout révélé. */
  summary: PlayerSummary[] | null;
}

/** Vue privée : seul le propriétaire reçoit son panier pendant les achats. */
export interface PrivateBasket {
  items: Item[];
  spentCents: number;
  done: boolean;
}

export const DEFAULT_CRITERIA: Criterion[] = [
  { id: 'weird', emoji: '🦄', label: 'L’achat le plus insolite' },
  { id: 'invest', emoji: '📈', label: 'Le meilleur investissement' },
  { id: 'waste', emoji: '🔥', label: 'Le pire gaspillage' },
  { id: 'coherent', emoji: '🧩', label: 'Le panier le plus cohérent' },
  { id: 'pitch', emoji: '🎤', label: 'Le meilleur pitch' },
  { id: 'bling', emoji: '💎', label: 'Le plus « nouveau riche »' },
  { id: 'generous', emoji: '🤝', label: 'Le plus généreux' },
  { id: 'survival', emoji: '🧟', label: 'Le panier de survie' },
  { id: 'shady', emoji: '🕵️', label: '« Le fisc va te poser des questions »' },
  { id: 'mirror', emoji: '🪞', label: 'Le panier qui lui ressemble le plus' },
];

export const BONUS_LABELS: Record<keyof GameConfig['bonuses'], { emoji: string; label: string }> = {
  closestToZero: { emoji: '🎯', label: 'Le plus proche de 0 € restant' },
  mostItems: { emoji: '🛒', label: 'Le plus d’articles achetés' },
  biggestPurchase: { emoji: '💰', label: 'Le plus gros achat unique' },
};

export const BUDGET_PRESETS_CENTS = [1e6, 1e7, 2e7, 1e9, 1e11].map((e) => e * 100);
export const DURATION_PRESETS_SEC = [5, 10, 15, 20].map((m) => m * 60);

export const GAME_LIMITS = {
  BUDGET_MIN_CENTS: 100,
  BUDGET_MAX_CENTS: 1e12 * 100, // 1 000 milliards €
  DURATION_MIN_SEC: 60,
  DURATION_MAX_SEC: 60 * 60,
  CRITERIA_MIN: 1,
  CRITERIA_MAX: 20,
  CRITERION_LABEL_MAX: 60,
  ITEM_NAME_MAX: 80,
  ITEM_URL_MAX: 500,
  ITEM_DESCRIPTION_MAX: 500,
  ITEMS_PER_PLAYER_MAX: 100,
  /** Taille max d'une image après compression côté client. */
  IMAGE_MAX_BYTES: 1_500_000,
  /** Plus grand côté d'une image après redimensionnement. */
  IMAGE_MAX_DIM: 1280,
  /** Quota d'images par joueur. */
  IMAGE_QUOTA_PER_PLAYER_BYTES: 25_000_000,
} as const;

export function defaultConfig(): GameConfig {
  return {
    budgetCents: BUDGET_PRESETS_CENTS[0],
    durationSec: DURATION_PRESETS_SEC[1],
    requireUrl: false,
    criteria: DEFAULT_CRITERIA.slice(0, 5),
    bonuses: { closestToZero: true, mostItems: false, biggestPurchase: false },
  };
}

// ─── Votes & podium ────────────────────────────────────────────────────────────

/**
 * standard : ≥ 3 joueurs, tout le monde vote (pas pour soi).
 * jury     : 2 joueurs + spectateurs, seuls les spectateurs votent.
 * duel     : 2 joueurs sans spectateur, « Revendique ou concède ».
 */
export type VoteMode = 'standard' | 'jury' | 'duel';
export type DuelChoice = 'claim' | 'concede';

export interface CriterionResult {
  criterion: Criterion;
  winners: string[];
  /** Points attribués à chaque gagnant (1, ou partagé en cas d'égalité). */
  pointsEach: number;
  /** Décompte par joueur (modes standard/jury). Jamais de lien votant → choix. */
  tally: { memberId: string; votes: number }[];
  /** Mode duel : les deux choix sont révélés simultanément. */
  duel?: { choices: Record<string, DuelChoice>; outcome: 'claim' | 'both-concede' | 'both-claim' };
}

export interface VoteState {
  mode: VoteMode;
  index: number;
  total: number;
  criterion: Criterion;
  status: 'open' | 'result';
  /** Joueurs pour qui on peut voter (ou duellistes). */
  candidates: string[];
  /** Qui peut voter, et qui l'a déjà fait (sans dire pour qui). */
  eligible: string[];
  voted: string[];
  result: CriterionResult | null;
}

export interface Award {
  emoji: string;
  label: string;
  points: number;
}

export interface PodiumEntry {
  memberId: string;
  name: string;
  color: string;
  points: number;
  rank: number;
  awards: Award[];
}
