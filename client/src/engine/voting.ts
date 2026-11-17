import type {
  Criterion,
  CriterionResult,
  DuelChoice,
  Role,
  VoteMode,
  VoteState,
} from '@bg/shared';

/**
 * Moteur de vote.
 *
 * Anonymat par construction (modes standard/jury) : on ne stocke que
 *  - l'ensemble des votants (pour empêcher le double vote),
 *  - un compteur de voix par candidat.
 * Le lien « qui a voté pour qui » n'existe à aucun moment en mémoire.
 *
 * En duel, les deux choix sont nécessaires pour calculer l'issue et sont révélés
 * simultanément : c'est le principe même de la mécanique.
 */
export class Voting {
  index = 0;
  status: 'open' | 'result' = 'open';
  readonly results: CriterionResult[] = [];
  /** Nombre de concessions par duelliste (bonus fair-play). */
  readonly concessions = new Map<string, number>();

  private voters = new Set<string>();
  private tally = new Map<string, number>();
  private duelChoices = new Map<string, DuelChoice>();

  constructor(
    readonly mode: VoteMode,
    readonly criteria: Criterion[],
    /** Les candidats (joueurs ayant un panier). */
    public candidates: string[],
  ) {}

  static modeFor(playerCount: number, spectatorCount: number): VoteMode {
    if (playerCount >= 3) return 'standard';
    return spectatorCount > 0 ? 'jury' : 'duel';
  }

  get criterion(): Criterion {
    return this.criteria[this.index];
  }

  canVote(role: Role, memberId: string): boolean {
    switch (this.mode) {
      case 'standard':
        return true; // joueurs et spectateurs
      case 'jury':
        return role === 'spectator';
      case 'duel':
        return this.candidates.includes(memberId);
    }
  }

  /** Enregistre un vote. Renvoie un message d'erreur, ou null. */
  cast(voterId: string, p: { targetId?: unknown; choice?: unknown }): string | null {
    if (this.status !== 'open') return 'Le vote est clos.';
    if (this.voters.has(voterId)) return 'Tu as déjà voté pour ce critère.';

    if (this.mode === 'duel') {
      if (p.choice !== 'claim' && p.choice !== 'concede') return 'Choix invalide.';
      this.duelChoices.set(voterId, p.choice);
    } else {
      const target = typeof p.targetId === 'string' ? p.targetId : '';
      if (!this.candidates.includes(target)) return 'Joueur invalide.';
      if (target === voterId) return 'Impossible de voter pour soi-même !';
      this.tally.set(target, (this.tally.get(target) ?? 0) + 1);
    }
    this.voters.add(voterId);
    return null;
  }

  isComplete(eligibleConnected: string[]): boolean {
    return eligibleConnected.length > 0 && eligibleConnected.every((id) => this.voters.has(id));
  }

  /** Clôt le vote du critère courant et calcule le résultat. */
  close(): void {
    if (this.status !== 'open') return;
    this.results.push(this.mode === 'duel' ? this.resolveDuel() : this.resolveTally());
    this.status = 'result';
    // On oublie tout ce qui concerne ce tour.
    this.voters.clear();
    this.tally.clear();
    this.duelChoices.clear();
  }

  /** Passe au critère suivant. Renvoie false s'il n'y en a plus. */
  next(): boolean {
    if (this.status !== 'result' || this.index >= this.criteria.length - 1) return false;
    this.index++;
    this.status = 'open';
    return true;
  }

  get finished(): boolean {
    return this.status === 'result' && this.index >= this.criteria.length - 1;
  }

  /** Un joueur quitte la partie : il n'est plus candidat. */
  removeCandidate(id: string): void {
    this.candidates = this.candidates.filter((c) => c !== id);
    this.tally.delete(id);
    this.duelChoices.delete(id);
  }

  publicState(eligible: string[]): VoteState {
    return {
      mode: this.mode,
      index: this.index,
      total: this.criteria.length,
      criterion: this.criterion,
      status: this.status,
      candidates: this.candidates,
      eligible,
      voted: eligible.filter((id) => this.voters.has(id)),
      result: this.status === 'result' ? this.results[this.results.length - 1] : null,
    };
  }

  private resolveTally(): CriterionResult {
    const tally = this.candidates.map((memberId) => ({ memberId, votes: this.tally.get(memberId) ?? 0 }));
    const max = Math.max(0, ...tally.map((t) => t.votes));
    const winners = max > 0 ? tally.filter((t) => t.votes === max).map((t) => t.memberId) : [];
    return {
      criterion: this.criterion,
      winners,
      pointsEach: winners.length ? 1 / winners.length : 0,
      tally: tally.sort((a, b) => b.votes - a.votes),
    };
  }

  private resolveDuel(): CriterionResult {
    // Un duelliste qui n'a pas choisi à temps est considéré comme concédant.
    const choices: Record<string, DuelChoice> = {};
    for (const id of this.candidates) choices[id] = this.duelChoices.get(id) ?? 'concede';
    for (const [id, c] of Object.entries(choices)) {
      if (c === 'concede') this.concessions.set(id, (this.concessions.get(id) ?? 0) + 1);
    }
    const claimers = this.candidates.filter((id) => choices[id] === 'claim');
    const base = { criterion: this.criterion, tally: [] };
    if (claimers.length === 1) return { ...base, winners: claimers, pointsEach: 1, duel: { choices, outcome: 'claim' } };
    if (claimers.length === 0)
      return { ...base, winners: [...this.candidates], pointsEach: 0.5, duel: { choices, outcome: 'both-concede' } };
    return { ...base, winners: [], pointsEach: 0, duel: { choices, outcome: 'both-claim' } };
  }
}
