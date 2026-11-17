import { randomHex } from './random';
import {
  DEFAULT_CRITERIA,
  GAME_LIMITS as L,
  type Criterion,
  type GameConfig,
  type Item,
} from '@bg/shared';

/** Supprime les caractères de contrôle et normalise les espaces (sauf retours à la ligne si demandé). */
export function cleanText(raw: unknown, max: number, multiline = false): string | null {
  if (typeof raw !== 'string') return null;
  let s = multiline
    ? raw.replace(/\r\n?/g, '\n').replace(/[^\P{C}\n]/gu, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n')
    : raw.replace(/\p{C}/gu, '').replace(/\s+/g, ' ');
  s = s.trim();
  return s.length <= max ? s : null;
}

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;

/** Valide intégralement une config envoyée par l'hôte. Renvoie un message d'erreur sinon. */
export function validateConfig(raw: unknown): GameConfig | string {
  const c = raw as Partial<GameConfig> | null;
  if (!c || typeof c !== 'object') return 'Configuration invalide.';
  if (!isInt(c.budgetCents, L.BUDGET_MIN_CENTS, L.BUDGET_MAX_CENTS)) return 'Budget invalide (1 € à 1 000 milliards €).';
  if (!isInt(c.durationSec, L.DURATION_MIN_SEC, L.DURATION_MAX_SEC)) return 'Durée invalide (1 à 60 minutes).';
  if (!Array.isArray(c.criteria) || c.criteria.length > L.CRITERIA_MAX) return 'Liste de critères invalide.';

  const criteria: Criterion[] = [];
  const seen = new Set<string>();
  for (const raw of c.criteria as unknown[]) {
    const r = raw as Partial<Criterion> | null;
    const known = DEFAULT_CRITERIA.find((d) => d.id === r?.id);
    let crit: Criterion | null = known ?? null;
    if (!crit) {
      const label = cleanText(r?.label, L.CRITERION_LABEL_MAX);
      if (!label) return 'Critère personnalisé invalide.';
      const id = typeof r?.id === 'string' && /^c-[a-z0-9]{1,16}$/.test(r.id) ? r.id : `c-${randomHex(4)}`;
      const emoji = cleanText(r?.emoji, 8) || '⭐';
      crit = { id, emoji, label };
    }
    if (seen.has(crit.id)) continue;
    seen.add(crit.id);
    criteria.push(crit);
  }

  const b = (c.bonuses ?? {}) as Partial<GameConfig['bonuses']>;
  return {
    budgetCents: c.budgetCents,
    durationSec: c.durationSec,
    requireUrl: c.requireUrl === true,
    criteria,
    bonuses: {
      closestToZero: b.closestToZero === true,
      mostItems: b.mostItems === true,
      biggestPurchase: b.biggestPurchase === true,
    },
  };
}

/** Valide un article ajouté par un joueur contre la config et son solde. */
export function validateItem(raw: unknown, config: GameConfig, balanceCents: number): Item | string {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = cleanText(r.name, L.ITEM_NAME_MAX);
  if (!name) return `Nom obligatoire (${L.ITEM_NAME_MAX} caractères max).`;

  if (!isInt(r.priceCents, 1, Number.MAX_SAFE_INTEGER)) return 'Prix invalide.';
  if (r.priceCents > balanceCents) return 'Pas assez d’argent pour cet achat !';

  let url: string | undefined;
  const rawUrl = cleanText(r.url ?? '', L.ITEM_URL_MAX);
  if (rawUrl === null) return 'Lien trop long.';
  if (rawUrl) {
    try {
      const u = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
      url = u.toString();
    } catch {
      return 'Lien invalide.';
    }
  } else if (config.requireUrl) return 'Le lien source est obligatoire dans cette partie.';

  const description = cleanText(r.description ?? '', L.ITEM_DESCRIPTION_MAX, true);
  if (description === null) return `Description trop longue (${L.ITEM_DESCRIPTION_MAX} caractères max).`;

  return {
    id: randomHex(6),
    hasImage: false,
    name,
    priceCents: r.priceCents,
    ...(url && { url }),
    ...(description && { description }),
  };
}
