import { randomHex, randomInt, randomUUID } from './random';
import {
  BONUS_LABELS,
  MEMBER_COLORS,
  defaultConfig,
  type Award,
  type PodiumEntry,
  type GameConfig,
  type Item,
  type Phase,
  type PrivateBasket,
  type PublicRoomState,
  type RevealState,
  type Role,
} from '@bg/shared';
import { wipe, type StoredImage } from './images';
import { Voting } from './voting';

export interface Member {
  id: string;
  /** Secret de reconnexion, jamais diffusé aux autres clients. */
  token: string;
  name: string;
  role: Role;
  color: string;
  connected: boolean;
  socketId: string | null;
  joinedAt: number;
  graceTimer: ReturnType<typeof setTimeout> | null;
}

/** Article côté serveur : l'image binaire reste ici, jamais dans l'état diffusé. */
export interface StoredItem extends Item {
  image?: StoredImage;
}

export interface Basket {
  items: StoredItem[];
  done: boolean;
}

interface Reveal {
  /** Ordre de présentation figé à la fin des achats. */
  order: { ownerId: string; itemId: string }[];
  index: number;
  showSummary: boolean;
}

const toPublicItem = ({ image: _image, ...item }: StoredItem): Item => item;

/**
 * Un salon vit uniquement en RAM. `destroy()` coupe tous les timers et lâche
 * toutes les références : rien n'est jamais écrit ailleurs.
 */
export class Room {
  readonly members = new Map<string, Member>();
  phase: Phase = 'LOBBY';
  hostId = '';
  lastActivity = Date.now();
  emptyTimer: ReturnType<typeof setTimeout> | null = null;
  destroyed = false;

  config: GameConfig = defaultConfig();
  /** Paniers des joueurs, indexés par memberId. Jamais diffusés tant que la phase d'achat dure. */
  readonly baskets = new Map<string, Basket>();
  endsAt: number | null = null;
  phaseTimer: ReturnType<typeof setTimeout> | null = null;
  reveal: Reveal | null = null;
  voting: Voting | null = null;
  podium: PodiumEntry[] | null = null;

  constructor(readonly code: string) {}

  touch(): void {
    this.lastActivity = Date.now();
  }

  addMember(name: string, role: Role, socketId: string): Member {
    const member: Member = {
      id: randomHex(6),
      token: randomUUID(),
      name,
      role,
      color: this.nextColor(),
      connected: true,
      socketId,
      joinedAt: Date.now(),
      graceTimer: null,
    };
    this.members.set(member.id, member);
    if (!this.hostId) this.hostId = member.id;
    this.touch();
    return member;
  }

  /** Retire un membre et réélit un hôte si besoin. */
  removeMember(id: string): void {
    const member = this.members.get(id);
    if (!member) return;
    if (member.graceTimer) clearTimeout(member.graceTimer);
    this.members.delete(id);
    this.dropBasket(id);
    this.voting?.removeCandidate(id);
    if (this.reveal) {
      // On retire ses articles de la présentation sans décaler ce qui a déjà été montré.
      const shown = this.reveal.order.slice(0, this.reveal.index + 1).filter((e) => e.ownerId !== id).length;
      this.reveal.order = this.reveal.order.filter((e) => e.ownerId !== id);
      this.reveal.index = shown - 1;
    }
    if (this.hostId === id) this.electHost();
    this.touch();
  }

  findByToken(token: unknown): Member | undefined {
    if (typeof token !== 'string') return undefined;
    for (const m of this.members.values()) if (m.token === token) return m;
    return undefined;
  }

  isNameTaken(name: string): boolean {
    const key = name.toLocaleLowerCase('fr');
    for (const m of this.members.values()) if (m.name.toLocaleLowerCase('fr') === key) return true;
    return false;
  }

  connectedCount(): number {
    let n = 0;
    for (const m of this.members.values()) if (m.connected) n++;
    return n;
  }

  playerCount(): number {
    let n = 0;
    for (const m of this.members.values()) if (m.role === 'player') n++;
    return n;
  }

  publicState(): PublicRoomState {
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      members: [...this.members.values()].map((m) => ({
        id: m.id,
        name: m.name,
        role: m.role,
        color: m.color,
        isHost: m.id === this.hostId,
        connected: m.connected,
      })),
      config: this.config,
      endsAt: this.endsAt,
      serverNow: Date.now(),
      progress: Object.fromEntries(
        [...this.baskets].map(([id, b]) => [id, { items: b.items.length, done: b.done }]),
      ),
      reveal: this.revealState(),
      vote: this.voting && this.phase === 'VOTING' ? this.voting.publicState(this.eligibleVoters()) : null,
      podium: this.podium,
    };
  }

  // ─── Votes ──────────────────────────────────────────────────────────────────

  /** Choisit la mécanique selon le nombre de joueurs et de spectateurs présents. */
  startVoting(): void {
    let spectators = 0;
    for (const m of this.members.values()) if (m.role === 'spectator' && m.connected) spectators++;
    const candidates = [...this.baskets.keys()];
    this.voting = new Voting(Voting.modeFor(candidates.length, spectators), this.config.criteria, candidates);
    this.phase = 'VOTING';
  }

  /** Membres connectés qui doivent voter pour le critère courant. */
  eligibleVoters(): string[] {
    const v = this.voting;
    if (!v) return [];
    return [...this.members.values()].filter((m) => m.connected && v.canVote(m.role, m.id)).map((m) => m.id);
  }

  finishGame(): void {
    this.podium = this.computePodium();
    this.phase = 'PODIUM';
  }

  /** Repart en configuration avec les mêmes membres ; toutes les données de la manche sont effacées. */
  resetForReplay(): void {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phaseTimer = null;
    this.endsAt = null;
    this.clearBaskets();
    this.reveal = null;
    this.voting = null;
    this.podium = null;
    this.phase = 'CONFIG';
  }

  private computePodium(): PodiumEntry[] {
    const entries = new Map<string, PodiumEntry>();
    for (const id of this.baskets.keys()) {
      const m = this.members.get(id);
      if (m) entries.set(id, { memberId: id, name: m.name, color: m.color, points: 0, rank: 0, awards: [] });
    }
    const give = (id: string, award: Award) => {
      const e = entries.get(id);
      if (!e || award.points <= 0) return;
      e.awards.push(award);
      e.points += award.points;
    };
    /** 1 point au(x) meilleur(s) selon `score` (partagé en cas d'égalité ; null = non classé). */
    const best = (score: (id: string) => number | null, emoji: string, label: string) => {
      const scored = [...entries.keys()].map((id) => [id, score(id)] as const).filter(([, s]) => s !== null);
      if (!scored.length) return;
      const top = Math.max(...scored.map(([, s]) => s!));
      const winners = scored.filter(([, s]) => s === top);
      for (const [id] of winners) give(id, { emoji, label, points: 1 / winners.length });
    };

    for (const r of this.voting?.results ?? []) {
      for (const w of r.winners) give(w, { emoji: r.criterion.emoji, label: r.criterion.label, points: r.pointsEach });
    }

    // Duel : bonus fair-play à celui qui a le plus concédé (s'il est seul dans ce cas).
    if (this.voting?.mode === 'duel') {
      const counts = [...this.voting.concessions];
      const max = Math.max(0, ...counts.map(([, n]) => n));
      const top = counts.filter(([, n]) => n === max);
      if (max > 0 && top.length === 1) give(top[0][0], { emoji: '🕊️', label: 'Fair-play', points: 1 });
    }

    const { bonuses } = this.config;
    const items = (id: string) => this.baskets.get(id)?.items ?? [];
    if (bonuses.closestToZero)
      best(
        (id) => -(this.config.budgetCents - this.spentCents(id)),
        BONUS_LABELS.closestToZero.emoji,
        BONUS_LABELS.closestToZero.label,
      );
    if (bonuses.mostItems)
      best((id) => items(id).length || null, BONUS_LABELS.mostItems.emoji, BONUS_LABELS.mostItems.label);
    if (bonuses.biggestPurchase)
      best(
        (id) => Math.max(0, ...items(id).map((i) => i.priceCents)) || null,
        BONUS_LABELS.biggestPurchase.emoji,
        BONUS_LABELS.biggestPurchase.label,
      );

    const ranking = [...entries.values()].sort((a, b) => b.points - a.points);
    ranking.forEach((e, i) => {
      // Classement "sportif" : 1, 1, 3…
      e.rank = i > 0 && Math.abs(e.points - ranking[i - 1].points) < 1e-9 ? ranking[i - 1].rank : i + 1;
    });
    return ranking;
  }

  /**
   * Ordre alterné : article 1 de chaque joueur, puis article 2 de chaque joueur, etc.
   * L'ordre des joueurs est tiré au sort pour que ce ne soit pas toujours le même qui ouvre.
   */
  buildReveal(): void {
    const owners = [...this.baskets.keys()];
    for (let i = owners.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [owners[i], owners[j]] = [owners[j], owners[i]];
    }
    const order: Reveal['order'] = [];
    const rounds = Math.max(0, ...owners.map((id) => this.baskets.get(id)!.items.length));
    for (let r = 0; r < rounds; r++) {
      for (const ownerId of owners) {
        const item = this.baskets.get(ownerId)!.items[r];
        if (item) order.push({ ownerId, itemId: item.id });
      }
    }
    this.reveal = { order, index: -1, showSummary: order.length === 0 };
  }

  /** Avance (+1) ou recule (-1) dans la présentation ; le récap vient après le dernier article. */
  stepReveal(dir: 1 | -1): boolean {
    const r = this.reveal;
    if (!r) return false;
    const last = r.order.length - 1;
    if (dir === 1) {
      if (r.showSummary) return false;
      if (r.index < last) r.index++;
      else r.showSummary = true;
    } else {
      if (r.showSummary && r.order.length > 0) r.showSummary = false;
      else if (r.index > -1) r.index--;
      else return false;
    }
    return true;
  }

  isRevealed(itemId: string): boolean {
    const r = this.reveal;
    if (!r) return false;
    return r.showSummary || r.order.slice(0, r.index + 1).some((e) => e.itemId === itemId);
  }

  private revealState(): RevealState | null {
    const r = this.reveal;
    if (!r) return null;
    const visible = r.showSummary ? r.order : r.order.slice(0, r.index + 1);
    return {
      index: r.showSummary ? r.order.length - 1 : r.index,
      total: r.order.length,
      revealed: visible.flatMap(({ ownerId, itemId }) => {
        const item = this.baskets.get(ownerId)?.items.find((i) => i.id === itemId);
        return item ? [{ ...toPublicItem(item), ownerId }] : [];
      }),
      summary: r.showSummary
        ? [...this.baskets.keys()].map((memberId) => {
            const spentCents = this.spentCents(memberId);
            return {
              memberId,
              spentCents,
              remainingCents: this.config.budgetCents - spentCents,
              itemCount: this.baskets.get(memberId)!.items.length,
            };
          })
        : null,
    };
  }

  spentCents(memberId: string): number {
    return this.baskets.get(memberId)?.items.reduce((sum, i) => sum + i.priceCents, 0) ?? 0;
  }

  privateBasket(memberId: string): PrivateBasket | null {
    const b = this.baskets.get(memberId);
    return b ? { items: b.items.map(toPublicItem), spentCents: this.spentCents(memberId), done: b.done } : null;
  }

  findItem(itemId: unknown): { ownerId: string; item: StoredItem } | null {
    if (typeof itemId !== 'string') return null;
    for (const [ownerId, b] of this.baskets) {
      const item = b.items.find((i) => i.id === itemId);
      if (item) return { ownerId, item };
    }
    return null;
  }

  /** Retire un article et efface son image. */
  removeItem(memberId: string, itemId: unknown): boolean {
    const items = this.baskets.get(memberId)?.items;
    const idx = items?.findIndex((i) => i.id === itemId) ?? -1;
    if (!items || idx === -1) return false;
    const [removed] = items.splice(idx, 1);
    wipe(removed.image?.data);
    return true;
  }

  /** Octets d'images stockés (pour un joueur, ou tout le salon). */
  imageBytes(memberId?: string): number {
    let total = 0;
    for (const [id, b] of this.baskets) {
      if (memberId && id !== memberId) continue;
      for (const i of b.items) total += i.image?.data.byteLength ?? 0;
    }
    return total;
  }

  dropBasket(memberId: string): void {
    const b = this.baskets.get(memberId);
    if (!b) return;
    for (const i of b.items) wipe(i.image?.data);
    b.items.length = 0;
    this.baskets.delete(memberId);
  }

  clearBaskets(): void {
    for (const id of [...this.baskets.keys()]) this.dropBasket(id);
  }

  /** La phase d'achat peut s'arrêter dès que tous les joueurs connectés ont validé. */
  allConnectedPlayersDone(): boolean {
    let anyone = false;
    for (const [id, b] of this.baskets) {
      if (!this.members.get(id)?.connected) continue;
      anyone = true;
      if (!b.done) return false;
    }
    return anyone;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.emptyTimer) clearTimeout(this.emptyTimer);
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.emptyTimer = this.phaseTimer = null;
    for (const m of this.members.values()) if (m.graceTimer) clearTimeout(m.graceTimer);
    this.members.clear();
    this.reveal = null;
    this.voting = null;
    this.podium = null;
    this.clearBaskets(); // efface aussi (fill(0)) chaque image
  }

  electHost(): void {
    // Priorité : joueur connecté le plus ancien > membre connecté > n'importe qui.
    const sorted = [...this.members.values()].sort((a, b) => a.joinedAt - b.joinedAt);
    const next =
      sorted.find((m) => m.connected && m.role === 'player') ??
      sorted.find((m) => m.connected) ??
      sorted[0];
    this.hostId = next?.id ?? '';
  }

  private nextColor(): string {
    const used = new Set([...this.members.values()].map((m) => m.color));
    return MEMBER_COLORS.find((c) => !used.has(c)) ?? MEMBER_COLORS[this.members.size % MEMBER_COLORS.length];
  }
}
