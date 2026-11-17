import {
  GAME_LIMITS,
  LIMITS,
  type AckResult,
  type ClientToServerEvents,
  type Item,
  type Role,
  type ServerToClientEvents,
  type Session,
} from '@bg/shared';
import { MAX_IMAGE_MEMORY_BYTES, parseImage, toBytes, wipe } from './images';
import { Room, type Member } from './room';
import { validateConfig, validateItem } from './validation';

/**
 * Le "serveur" du jeu, exécuté dans l'onglet de l'hôte.
 *
 * Chaque appareil connecté (y compris l'hôte lui-même) est un `Client` : un canal par lequel
 * on peut envoyer des événements. Toutes les données de la partie vivent ici, en RAM, et
 * disparaissent avec l'onglet.
 */

export type ServerEvent = keyof ServerToClientEvents;
export type ClientEvent = keyof ClientToServerEvents;

export interface Client {
  id: string;
  send<E extends ServerEvent>(event: E, ...args: Parameters<ServerToClientEvents[E]>): void;
  /** Ferme le canal (expulsion, fermeture du salon). */
  close(): void;
}

type Payload = Record<string, unknown> | undefined;
type Ctx = { room: Room; member: Member; client: Client };

const fail = (error: string): AckResult<never> => ({ ok: false, error });

export function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/\p{C}/gu, '').replace(/\s+/g, ' ').trim();
  return name.length >= LIMITS.NAME_MIN && name.length <= LIMITS.NAME_MAX ? name : null;
}

/** Limiteur simple par client (seau à jetons) : un invité ne peut pas inonder l'hôte. */
class TokenBucket {
  private tokens: number;
  private last = Date.now();
  constructor(
    private readonly capacity = 40,
    private readonly perSecond = 15,
  ) {
    this.tokens = capacity;
  }
  take(cost = 1): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.perSecond);
    this.last = now;
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}

export class HostEngine {
  readonly room: Room;
  private readonly clients = new Map<string, { client: Client; memberId?: string; bucket: TokenBucket }>();
  private closed = false;

  /**
   * @param onClosed appelé quand le salon est détruit (pour couper le réseau).
   */
  constructor(
    code: string,
    private readonly onClosed: (reason: string) => void = () => {},
  ) {
    this.room = new Room(code);
  }

  get code(): string {
    return this.room.code;
  }

  // ─── Connexions ────────────────────────────────────────────────────────────

  addClient(client: Client): void {
    if (this.closed) return client.close();
    this.clients.set(client.id, { client, bucket: new TokenBucket() });
  }

  removeClient(clientId: string): void {
    const entry = this.clients.get(clientId);
    this.clients.delete(clientId);
    const member = entry?.memberId ? this.room.members.get(entry.memberId) : undefined;
    if (!member || member.socketId !== clientId) return;
    member.connected = false;
    member.socketId = null;
    if (member.id === this.room.hostId) return; // l'hôte qui part = fin du salon (géré par destroy)
    if (this.room.phase === 'LOBBY') {
      // Dans le lobby, on libère la place si l'invité ne revient pas vite.
      member.graceTimer = setTimeout(() => this.removeMember(member.id), 30_000);
    }
    this.checkProgress();
    this.broadcast();
  }

  /** Point d'entrée de toutes les requêtes. Renvoie la réponse (ack) éventuelle. */
  handle(clientId: string, event: string, payload: unknown): AckResult<object> | undefined {
    const entry = this.clients.get(clientId);
    if (!entry || this.closed) return fail('Connexion fermée.');
    // L'hôte est le serveur : on ne limite que les invités.
    const isHost = !!entry.memberId && entry.memberId === this.room.hostId;
    const cost = event === 'shop:add' ? 4 : 1;
    if (!isHost && !entry.bucket.take(cost)) return fail('Doucement ! Trop de requêtes, réessaie dans un instant.');
    // Le chrono est revérifié à chaque requête : un onglet hôte en arrière-plan peut retarder les timers.
    this.checkClock();
    const handler = (this.handlers as Record<string, (c: Client, p: Payload) => AckResult<object> | void>)[event];
    if (!handler) return fail('Action inconnue.');
    const p = payload && typeof payload === 'object' ? (payload as Payload) : undefined;
    return handler.call(this, entry.client, p) ?? undefined;
  }

  /** Ferme le salon : prévient tout le monde, coupe tout, efface tout. */
  destroy(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    for (const { client } of this.clients.values()) {
      client.send('room:closed', reason);
      client.close();
    }
    this.clients.clear();
    this.room.destroy(); // efface paniers, votes et images (fill(0))
    this.onClosed(reason);
  }

  // ─── Utilitaires ──────────────────────────────────────────────────────────

  private ctx(client: Client): Ctx | null {
    const memberId = this.clients.get(client.id)?.memberId;
    const member = memberId ? this.room.members.get(memberId) : undefined;
    return member && member.socketId === client.id ? { room: this.room, member, client } : null;
  }

  private hostCtx(client: Client): Ctx | null {
    const c = this.ctx(client);
    return c && c.member.id === this.room.hostId ? c : null;
  }

  broadcast(): void {
    if (this.closed) return;
    const state = this.room.publicState();
    for (const { client, memberId } of this.clients.values()) if (memberId) client.send('room:state', state);
  }

  private sendPrivate(memberId: string): void {
    const member = this.room.members.get(memberId);
    const basket = this.room.privateBasket(memberId);
    const entry = member?.socketId ? this.clients.get(member.socketId) : undefined;
    if (entry && basket) entry.client.send('me:basket', basket);
  }

  private attach(client: Client, member: Member): Session {
    if (member.graceTimer) clearTimeout(member.graceTimer);
    member.graceTimer = null;
    // Un même membre ne peut avoir qu'une connexion active (ex : deux onglets).
    if (member.socketId && member.socketId !== client.id) {
      const old = this.clients.get(member.socketId);
      if (old) {
        old.memberId = undefined;
        old.client.send('room:closed', 'Session ouverte dans un autre onglet');
        old.client.close();
      }
    }
    member.socketId = client.id;
    member.connected = true;
    const entry = this.clients.get(client.id);
    if (entry) entry.memberId = member.id;
    this.room.touch();
    return { code: this.room.code, memberId: member.id, token: member.token };
  }

  private removeMember(memberId: string): void {
    if (memberId === this.room.hostId) return;
    this.room.removeMember(memberId);
    this.checkProgress();
    this.broadcast();
  }

  private checkProgress(): void {
    this.maybeEndShopping();
    this.maybeCloseVote();
  }

  private checkClock(): void {
    if (this.room.phase === 'SHOPPING' && this.room.endsAt !== null && Date.now() >= this.room.endsAt) this.endShopping();
  }

  private totalImageBytes(): number {
    return this.room.imageBytes();
  }

  // ─── Phases ───────────────────────────────────────────────────────────────

  private startShopping(): void {
    const room = this.room;
    room.clearBaskets();
    for (const m of room.members.values()) if (m.role === 'player') room.baskets.set(m.id, { items: [], done: false });
    room.phase = 'SHOPPING';
    room.endsAt = Date.now() + room.config.durationSec * 1000;
    room.phaseTimer = setTimeout(() => this.endShopping(), room.config.durationSec * 1000);
    this.broadcast();
    for (const id of room.baskets.keys()) this.sendPrivate(id);
  }

  private maybeEndShopping(): void {
    if (this.room.phase === 'SHOPPING' && this.room.allConnectedPlayersDone()) this.endShopping();
  }

  private endShopping(): void {
    const room = this.room;
    if (this.closed || room.phase !== 'SHOPPING') return;
    if (room.phaseTimer) clearTimeout(room.phaseTimer);
    room.phaseTimer = null;
    room.endsAt = null;
    for (const b of room.baskets.values()) b.done = true;
    room.buildReveal();
    room.phase = 'REVEAL';
    this.broadcast();
    for (const id of room.baskets.keys()) this.sendPrivate(id);
  }

  private maybeCloseVote(): void {
    const v = this.room.voting;
    if (this.room.phase !== 'VOTING' || !v || v.status !== 'open') return;
    if (v.isComplete(this.room.eligibleVoters())) {
      v.close();
      this.broadcast();
    }
  }

  // ─── Gestion des requêtes ─────────────────────────────────────────────────

  private readonly handlers = {
    /** L'hôte crée son propre membre au démarrage du salon. */
    'room:create'(this: HostEngine, client: Client, p: Payload) {
      const name = sanitizeName(p?.name);
      if (!name) return fail(`Pseudo invalide (${LIMITS.NAME_MIN} à ${LIMITS.NAME_MAX} caractères).`);
      if (this.room.members.size > 0) return fail('Salon déjà créé.');
      const member = this.room.addMember(name, 'player', client.id);
      const session = this.attach(client, member);
      this.broadcast();
      return { ok: true, session };
    },

    'room:join'(this: HostEngine, client: Client, p: Payload) {
      const name = sanitizeName(p?.name);
      if (!name) return fail(`Pseudo invalide (${LIMITS.NAME_MIN} à ${LIMITS.NAME_MAX} caractères).`);
      const role: Role = p?.role === 'spectator' ? 'spectator' : 'player';
      const room = this.room;
      if (room.members.size >= 100) return fail('Salon complet.');
      if (role === 'player' && room.phase !== 'LOBBY' && room.phase !== 'CONFIG')
        return fail('La partie a déjà commencé — tu peux rejoindre en spectateur.');
      if (room.isNameTaken(name)) return fail('Ce pseudo est déjà pris dans ce salon.');
      const member = room.addMember(name, role, client.id);
      const session = this.attach(client, member);
      this.broadcast();
      return { ok: true, session };
    },

    'room:rejoin'(this: HostEngine, client: Client, p: Payload) {
      const member = this.room.findByToken(p?.token);
      if (!member) return fail('Ce salon n’existe plus.');
      const session = this.attach(client, member);
      this.broadcast();
      this.sendPrivate(member.id);
      return { ok: true, session };
    },

    'room:leave'(this: HostEngine, client: Client) {
      const c = this.ctx(client);
      if (!c) return;
      if (c.member.id === this.room.hostId) return this.destroy('L’hôte a quitté la partie.');
      const entry = this.clients.get(client.id);
      if (entry) entry.memberId = undefined;
      this.removeMember(c.member.id);
    },

    'room:kick'(this: HostEngine, client: Client, p: Payload) {
      const c = this.hostCtx(client);
      const target = typeof p?.memberId === 'string' ? this.room.members.get(p.memberId) : undefined;
      if (!c || !target || target.id === c.member.id) return;
      const entry = target.socketId ? this.clients.get(target.socketId) : undefined;
      if (entry) {
        entry.memberId = undefined;
        entry.client.send('room:kicked');
        entry.client.close();
      }
      this.removeMember(target.id);
    },

    'room:close'(this: HostEngine, client: Client) {
      if (this.hostCtx(client)) this.destroy('L’hôte a fermé le salon.');
    },

    'config:open'(this: HostEngine, client: Client) {
      if (!this.hostCtx(client) || this.room.phase !== 'LOBBY') return;
      this.room.phase = 'CONFIG';
      this.broadcast();
    },

    'config:update'(this: HostEngine, client: Client, p: Payload) {
      if (!this.hostCtx(client) || this.room.phase !== 'CONFIG') return fail('Seul l’hôte peut configurer la partie.');
      const config = validateConfig(p);
      if (typeof config === 'string') return fail(config);
      this.room.config = config;
      this.broadcast();
      return { ok: true };
    },

    'game:start'(this: HostEngine, client: Client) {
      if (!this.hostCtx(client) || this.room.phase !== 'CONFIG') return fail('Seul l’hôte peut lancer la partie.');
      if (this.room.playerCount() < LIMITS.MIN_PLAYERS) return fail(`Il faut au moins ${LIMITS.MIN_PLAYERS} joueurs.`);
      if (this.room.config.criteria.length < GAME_LIMITS.CRITERIA_MIN) return fail('Choisis au moins un critère.');
      this.startShopping();
      return { ok: true };
    },

    'shop:add'(this: HostEngine, client: Client, p: Payload) {
      const rawImage = toBytes(p?.image);
      const reply = (res: AckResult<{ item: Item }>) => {
        if (!res.ok) wipe(rawImage ?? undefined); // l'image d'un ajout refusé est effacée aussitôt
        return res;
      };
      const c = this.ctx(client);
      const basket = c && this.room.phase === 'SHOPPING' ? this.room.baskets.get(c.member.id) : undefined;
      if (!c || !basket) return reply(fail('Les achats ne sont pas ouverts.'));
      if (basket.done) return reply(fail('Tu as validé ton panier — annule « J’ai terminé » pour continuer.'));
      if (basket.items.length >= GAME_LIMITS.ITEMS_PER_PLAYER_MAX)
        return reply(fail(`Maximum ${GAME_LIMITS.ITEMS_PER_PLAYER_MAX} articles.`));

      const balance = this.room.config.budgetCents - this.room.spentCents(c.member.id);
      const item = validateItem(p, this.room.config, balance);
      if (typeof item === 'string') return reply(fail(item));

      const image = parseImage(rawImage ?? p?.image);
      if (typeof image === 'string') return reply(fail(image));
      if (image) {
        const size = image.data.byteLength;
        if (this.room.imageBytes(c.member.id) + size > GAME_LIMITS.IMAGE_QUOTA_PER_PLAYER_BYTES)
          return reply(fail('Quota d’images atteint pour ce panier.'));
        if (this.totalImageBytes() + size > MAX_IMAGE_MEMORY_BYTES)
          return reply(fail('Trop d’images dans la partie, réessaie sans image.'));
      }

      basket.items.push({ ...item, hasImage: !!image, ...(image && { image }) });
      this.room.touch();
      this.sendPrivate(c.member.id);
      this.broadcast();
      return reply({ ok: true, item: { ...item, hasImage: !!image } });
    },

    'shop:remove'(this: HostEngine, client: Client, p: Payload) {
      const c = this.ctx(client);
      const basket = c && this.room.phase === 'SHOPPING' ? this.room.baskets.get(c.member.id) : undefined;
      if (!c || !basket || basket.done) return;
      if (!this.room.removeItem(c.member.id, p?.itemId)) return;
      this.sendPrivate(c.member.id);
      this.broadcast();
    },

    'shop:done'(this: HostEngine, client: Client, p: Payload) {
      const c = this.ctx(client);
      const basket = c && this.room.phase === 'SHOPPING' ? this.room.baskets.get(c.member.id) : undefined;
      if (!c || !basket) return;
      basket.done = p?.done === true;
      this.sendPrivate(c.member.id);
      this.broadcast();
      this.maybeEndShopping();
    },

    /** Pendant les achats : son propre panier. Pendant le reveal : articles déjà montrés. Ensuite : tout. */
    'image:get'(this: HostEngine, client: Client, p: Payload) {
      const c = this.ctx(client);
      const found = c ? this.room.findItem(p?.itemId) : null;
      if (!c || !found?.item.image) return fail('Image introuvable.');
      const phase = this.room.phase;
      const visible =
        found.ownerId === c.member.id ||
        phase === 'VOTING' ||
        phase === 'PODIUM' ||
        (phase === 'REVEAL' && this.room.isRevealed(found.item.id));
      if (!visible) return fail('Image pas encore révélée.');
      // Copie : l'original peut être effacé (fill(0)) plus tard sans affecter ce qui a été envoyé.
      return { ok: true, data: found.item.image.data.slice().buffer, mime: found.item.image.mime };
    },

    'reveal:next'(this: HostEngine, client: Client) {
      if (this.hostCtx(client) && this.room.phase === 'REVEAL' && this.room.stepReveal(1)) this.broadcast();
    },

    'reveal:prev'(this: HostEngine, client: Client) {
      if (this.hostCtx(client) && this.room.phase === 'REVEAL' && this.room.stepReveal(-1)) this.broadcast();
    },

    'vote:start'(this: HostEngine, client: Client) {
      if (!this.hostCtx(client) || this.room.phase !== 'REVEAL' || !this.room.reveal) return;
      if (this.room.baskets.size < 2) this.room.finishGame();
      else this.room.startVoting();
      this.broadcast();
    },

    'vote:cast'(this: HostEngine, client: Client, p: Payload) {
      const c = this.ctx(client);
      const v = this.room.voting;
      if (!c || !v || this.room.phase !== 'VOTING') return fail('Pas de vote en cours.');
      if (!v.canVote(c.member.role, c.member.id)) return fail('Tu ne votes pas dans ce mode.');
      const err = v.cast(c.member.id, { targetId: p?.targetId, choice: p?.choice });
      if (err) return fail(err);
      this.broadcast();
      this.maybeCloseVote();
      return { ok: true };
    },

    'vote:close'(this: HostEngine, client: Client) {
      const v = this.room.voting;
      if (!this.hostCtx(client) || this.room.phase !== 'VOTING' || v?.status !== 'open') return;
      v.close();
      this.broadcast();
    },

    'vote:next'(this: HostEngine, client: Client) {
      const v = this.room.voting;
      if (!this.hostCtx(client) || !v || this.room.phase !== 'VOTING') return;
      if (v.finished) this.room.finishGame();
      else if (!v.next()) return;
      this.broadcast();
    },

    'game:replay'(this: HostEngine, client: Client) {
      if (!this.hostCtx(client) || this.room.phase !== 'PODIUM') return;
      this.room.resetForReplay();
      this.broadcast();
    },
  } satisfies Partial<Record<ClientEvent, (client: Client, p: Payload) => AckResult<object> | void>>;
}
