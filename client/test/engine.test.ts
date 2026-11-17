import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrivateBasket, PublicRoomState } from '@bg/shared';
import { HostEngine, type Client } from '../src/engine/host';

/** Faux appareil : enregistre ce que l'hôte lui envoie. */
class FakeClient implements Client {
  state: PublicRoomState | null = null;
  basket: PrivateBasket | null = null;
  closedReason: string | null = null;
  kicked = false;
  closed = false;
  memberId = '';
  constructor(
    readonly id: string,
    private readonly engine: HostEngine,
  ) {}
  send(event: string, ...args: unknown[]) {
    if (event === 'room:state') this.state = args[0] as PublicRoomState;
    if (event === 'me:basket') this.basket = args[0] as PrivateBasket;
    if (event === 'room:closed') this.closedReason = args[0] as string;
    if (event === 'room:kicked') this.kicked = true;
  }
  close() {
    this.closed = true;
  }
  req(event: string, payload?: unknown) {
    return this.engine.handle(this.id, event, payload) as { ok: boolean; error?: string; [k: string]: unknown };
  }
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const CRITERIA = [{ id: 'weird' }, { id: 'waste' }, { id: 'c-kitsch', label: 'Le plus kitsch', emoji: '' }];

function setup(players: string[], spectators: string[] = [], bonuses = { closestToZero: true, mostItems: true, biggestPurchase: true }) {
  const engine = new HostEngine('TEST');
  const c: Record<string, FakeClient> = {};
  const add = (name: string, role: 'player' | 'spectator', first: boolean) => {
    const client = new FakeClient(`c-${name}`, engine);
    engine.addClient(client);
    const res = client.req(first ? 'room:create' : 'room:join', { name, role });
    expect(res.ok, res.error).toBe(true);
    client.memberId = (res.session as { memberId: string }).memberId;
    c[name] = client;
  };
  players.forEach((p, i) => add(p, 'player', i === 0));
  spectators.forEach((s) => add(s, 'spectator', false));
  const host = c[players[0]];
  host.req('config:open');
  expect(host.req('config:update', { budgetCents: 100_000, durationSec: 600, criteria: CRITERIA, bonuses }).ok).toBe(true);
  expect(host.req('game:start').ok).toBe(true);
  return { engine, c, host };
}

function shopAndReveal(g: ReturnType<typeof setup>, spend: Record<string, number[]>) {
  for (const [name, prices] of Object.entries(spend)) {
    for (const p of prices) expect(g.c[name].req('shop:add', { name: `${name}-${p}`, priceCents: p }).ok).toBe(true);
  }
  for (const name of Object.keys(spend)) g.c[name].req('shop:done', { done: true });
  for (let i = 0; i < 30; i++) g.host.req('reveal:next');
  g.host.req('vote:start');
}

afterEach(() => vi.useRealTimers());

describe('lobby', () => {
  it('refuse les pseudos en double et les actions d’hôte des invités', () => {
    const g = setup(['Alice', 'Bob']);
    const extra = new FakeClient('x', g.engine);
    g.engine.addClient(extra);
    expect(extra.req('room:join', { name: 'alice', role: 'spectator' }).error).toMatch(/déjà pris/);
    expect(g.c.Bob.req('config:update', {}).ok).toBe(false);
  });

  it('expulse un membre et lui ferme la connexion', () => {
    const g = setup(['Alice', 'Bob', 'Chloé']);
    g.host.req('room:kick', { memberId: g.c.Bob.memberId });
    expect(g.c.Bob.kicked && g.c.Bob.closed).toBe(true);
    expect(g.host.state!.members.map((m) => m.name)).toEqual(['Alice', 'Chloé']);
  });
});

describe('achats', () => {
  it('garde les paniers privés et applique le budget', () => {
    const g = setup(['Alice', 'Bob']);
    expect(g.c.Alice.req('shop:add', { name: 'Yacht', priceCents: 100_001 }).error).toMatch(/Pas assez/);
    expect(g.c.Alice.req('shop:add', { name: 'x', priceCents: -5 }).ok).toBe(false);
    expect(g.c.Alice.req('shop:add', { name: 'x', priceCents: 1, url: 'javascript:alert(1)' }).error).toMatch(/Lien/);
    expect(g.c.Alice.req('shop:add', { name: 'Lama', priceCents: 40_000 }).ok).toBe(true);
    expect(g.c.Alice.basket!.spentCents).toBe(40_000);
    // Bob ne voit que le nombre d'articles d'Alice, jamais le contenu.
    expect(JSON.stringify(g.c.Bob.state)).not.toContain('Lama');
    expect(g.c.Bob.state!.progress[g.c.Alice.memberId].items).toBe(1);
  });

  it('termine la phase quand tout le monde a fini, ou à la fin du chrono', () => {
    vi.useFakeTimers();
    const g = setup(['Alice', 'Bob']);
    g.c.Alice.req('shop:done', { done: true });
    expect(g.host.state!.phase).toBe('SHOPPING');
    vi.advanceTimersByTime(600_000);
    expect(g.host.state!.phase).toBe('REVEAL');
  });

  it('refuse les fausses images et efface celles d’un article retiré', () => {
    const g = setup(['Alice', 'Bob']);
    expect(g.c.Alice.req('shop:add', { name: 'x', priceCents: 1, image: new TextEncoder().encode('<script>') }).error).toMatch(/Format/);
    const img = PNG.slice();
    const res = g.c.Alice.req('shop:add', { name: 'Photo', priceCents: 1, image: img });
    const itemId = (res.item as { id: string }).id;
    expect(g.c.Bob.req('image:get', { itemId }).error).toMatch(/pas encore révélée/);
    expect(g.c.Alice.req('image:get', { itemId }).ok).toBe(true);
    g.c.Alice.req('shop:remove', { itemId });
    expect(img.every((b) => b === 0)).toBe(true);
  });
});

describe('reveal', () => {
  it('alterne les joueurs et ne dévoile les images qu’une fois le lot montré', () => {
    const g = setup(['Alice', 'Bob']);
    const a1 = (g.c.Alice.req('shop:add', { name: 'a1', priceCents: 1, image: PNG.slice() }).item as { id: string }).id;
    g.c.Alice.req('shop:add', { name: 'a2', priceCents: 1 });
    g.c.Bob.req('shop:add', { name: 'b1', priceCents: 1 });
    g.c.Alice.req('shop:done', { done: true });
    g.c.Bob.req('shop:done', { done: true });
    expect(g.host.state!.reveal!.total).toBe(3);
    expect(g.c.Bob.req('image:get', { itemId: a1 }).ok).toBe(false);
    g.c.Bob.req('reveal:next'); // un invité ne pilote pas
    expect(g.host.state!.reveal!.index).toBe(-1);
    for (let i = 0; i < 3; i++) g.host.req('reveal:next');
    const owners = g.host.state!.reveal!.revealed.map((i) => i.name[0]);
    expect(owners[0]).not.toBe(owners[1]); // alternance
    expect(g.c.Bob.req('image:get', { itemId: a1 }).ok).toBe(true);
  });
});

describe('votes', () => {
  it('mode standard : anonyme, pas pour soi, égalité partagée', () => {
    const g = setup(['Alice', 'Bob', 'Chloé']);
    shopAndReveal(g, { Alice: [50_000, 50_000], Bob: [10_000], Chloé: [90_000, 5_000, 5_000] });
    const { Alice, Bob, Chloé } = g.c;
    expect(g.host.state!.vote!.mode).toBe('standard');
    expect(Alice.req('vote:cast', { targetId: Alice.memberId }).error).toMatch(/soi-même/);
    expect(Alice.req('vote:cast', { targetId: Bob.memberId }).ok).toBe(true);
    expect(Alice.req('vote:cast', { targetId: Chloé.memberId }).error).toMatch(/déjà voté/);

    // Anonymat : le moteur ne garde aucun lien votant → choix.
    const voting = g.engine.room.voting as unknown as { voters: Set<string>; tally: Map<string, number> };
    expect([...voting.tally.entries()]).toEqual([[Bob.memberId, 1]]);
    expect(voting.voters.has(Alice.memberId)).toBe(true);

    Bob.req('vote:cast', { targetId: Chloé.memberId });
    Chloé.req('vote:cast', { targetId: Bob.memberId });
    expect(g.host.state!.vote!.result!.winners).toEqual([Bob.memberId]);

    g.host.req('vote:next');
    Alice.req('vote:cast', { targetId: Bob.memberId });
    Bob.req('vote:cast', { targetId: Chloé.memberId });
    Chloé.req('vote:cast', { targetId: Alice.memberId });
    expect(g.host.state!.vote!.result!.pointsEach).toBeCloseTo(1 / 3);

    g.host.req('vote:next');
    g.host.req('vote:close');
    g.host.req('vote:next');
    const podium = g.host.state!.podium!;
    expect(g.host.state!.phase).toBe('PODIUM');
    // Chloé : ⅓ (égalité) + ½ (plus proche de 0, ex æquo avec Alice) + 1 (plus d'articles) + 1 (plus gros achat)
    expect(podium[0].name).toBe('Chloé');
    expect(podium[0].points).toBeCloseTo(1 / 3 + 0.5 + 1 + 1);
  });

  it('mode duel : revendique ou concède + bonus fair-play', () => {
    const g = setup(['Alice', 'Bob'], [], { closestToZero: false, mostItems: false, biggestPurchase: false });
    shopAndReveal(g, { Alice: [1], Bob: [1] });
    const { Alice, Bob } = g.c;
    expect(g.host.state!.vote!.mode).toBe('duel');
    Alice.req('vote:cast', { choice: 'claim' });
    Bob.req('vote:cast', { choice: 'concede' });
    expect(g.host.state!.vote!.result!.duel!.outcome).toBe('claim');
    g.host.req('vote:next');
    Alice.req('vote:cast', { choice: 'concede' });
    Bob.req('vote:cast', { choice: 'concede' });
    expect(g.host.state!.vote!.result!.pointsEach).toBe(0.5);
    g.host.req('vote:next');
    Alice.req('vote:cast', { choice: 'claim' });
    Bob.req('vote:cast', { choice: 'claim' });
    expect(g.host.state!.vote!.result!.winners).toEqual([]);
    g.host.req('vote:next');
    const byName = Object.fromEntries(g.host.state!.podium!.map((e) => [e.name, e.points]));
    expect(byName).toEqual({ Alice: 1.5, Bob: 1.5 }); // Bob : ½ + fair-play
  });

  it('mode jury : seuls les spectateurs votent', () => {
    const g = setup(['Alice', 'Bob'], ['Zoé']);
    shopAndReveal(g, { Alice: [1], Bob: [1] });
    expect(g.host.state!.vote!.mode).toBe('jury');
    expect(g.c.Alice.req('vote:cast', { targetId: g.c.Bob.memberId }).error).toMatch(/ne votes pas/);
    g.c.Zoé.req('vote:cast', { targetId: g.c.Bob.memberId });
    expect(g.host.state!.vote!.result!.winners).toEqual([g.c.Bob.memberId]);
  });
});

describe('fin de partie', () => {
  it('rejouer efface la manche ; fermer efface tout', () => {
    const g = setup(['Alice', 'Bob']);
    const img = PNG.slice();
    g.c.Alice.req('shop:add', { name: 'x', priceCents: 1, image: img });
    g.c.Alice.req('shop:done', { done: true });
    shopAndReveal(g, { Bob: [1] });
    for (let i = 0; i < 3; i++) {
      g.host.req('vote:close');
      g.host.req('vote:next');
    }
    expect(g.host.state!.phase).toBe('PODIUM');
    g.host.req('game:replay');
    expect(g.host.state!.phase).toBe('CONFIG');
    expect(g.host.state!.reveal).toBeNull();
    expect(img.every((b) => b === 0)).toBe(true);

    g.host.req('room:close');
    expect(g.c.Bob.closedReason).toMatch(/fermé/);
    expect(g.engine.room.members.size).toBe(0);
  });

  it('limite le débit d’un client trop bavard', () => {
    const g = setup(['Alice', 'Bob']);
    const results = Array.from({ length: 100 }, () => g.c.Bob.req('shop:done', { done: false }));
    expect(results.some((r) => r?.error?.includes('Doucement'))).toBe(true);
  });
});
