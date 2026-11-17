import type {
  AckResult,
  DuelChoice,
  GameConfig,
  Item,
  ItemInput,
  PrivateBasket,
  PublicRoomState,
  Role,
  Session,
} from '@bg/shared';
import { loadSession, resetSession, setSession, useGame } from '../store';
import { hostRoom, joinHost, type EventSink, type Net } from './transport';

/** Connexion active (hôte ou invité). */
let net: Net | null = null;

const sink: EventSink = (event, args) => {
  switch (event) {
    case 'room:state': {
      const room = args[0] as PublicRoomState;
      const fresh = room.phase === 'LOBBY' || room.phase === 'CONFIG';
      useGame.setState((s) => ({ room, clockOffset: room.serverNow - Date.now(), basket: fresh ? null : s.basket }));
      break;
    }
    case 'me:basket':
      useGame.setState({ basket: args[0] as PrivateBasket });
      break;
    case 'room:kicked':
      drop('L’hôte t’a retiré du salon.');
      break;
    case 'room:closed':
      drop(String(args[0] ?? 'Salon fermé.'));
      break;
  }
};

function drop(notice: string) {
  const n = net;
  net = null;
  if (n && !n.isHost) n.close();
  resetSession(notice);
}

/** Invité : connexion perdue → on tente de revenir quelques fois avant d'abandonner. */
async function onGuestLost() {
  const session = useGame.getState().session;
  net = null;
  if (!session) return;
  useGame.setState({ connected: false });
  for (let attempt = 0; attempt < 4; attempt++) {
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    if (useGame.getState().session?.token !== session.token) return; // l'utilisateur est parti entre-temps
    if (await rejoin(session)) return;
  }
  resetSession('Connexion à l’hôte perdue. Le salon a peut-être été fermé.');
}

async function rejoin(session: Session): Promise<boolean> {
  try {
    const n = await joinHost(session.code, sink, onGuestLost);
    const res = await n.request<{ session: Session }>('room:rejoin', { code: session.code, token: session.token });
    if (!res.ok) {
      n.close();
      resetSession(res.error);
      return true;
    }
    net = n;
    setSession({ ...res.session, isHost: false });
    return true;
  } catch {
    return false;
  }
}

/** Au chargement de la page : reprise de session éventuelle. */
export function resumeSession(): void {
  const saved = loadSession();
  if (!saved) return;
  if (saved.isHost) {
    // L'hôte EST le serveur : en rechargeant sa page, il a effacé la partie (c'est voulu, rien n'est stocké).
    resetSession('Le salon a été fermé : la page de l’hôte a été rechargée, et la partie avec.');
    return;
  }
  useGame.setState({ session: saved, connected: false });
  rejoin(saved).then((ok) => {
    if (!ok) resetSession('Impossible de rejoindre le salon. Il a peut-être été fermé.');
  });
}

const request = <T = object>(event: Parameters<Net['request']>[0], payload?: unknown, timeoutMs?: number) =>
  net ? net.request<T>(event, payload, timeoutMs) : Promise.resolve<AckResult<T>>({ ok: false, error: 'Pas connecté.' });
const emit = (event: Parameters<Net['emit']>[0], payload?: unknown) => net?.emit(event, payload);
const errorOf = (r: AckResult<object>) => (r.ok ? null : r.error);

export const actions = {
  /** Renvoie un message d'erreur, ou null. */
  async createRoom(name: string): Promise<string | null> {
    try {
      const { net: n } = await hostRoom(sink, () => {
        if (net === n) drop('Salon fermé.');
      });
      const res = await n.request<{ session: Session }>('room:create', { name });
      if (!res.ok) {
        n.close();
        return res.error;
      }
      net = n;
      setSession({ ...res.session, isHost: true });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Erreur réseau.';
    }
  },

  async joinRoom(code: string, name: string, role: Role): Promise<string | null> {
    try {
      const n = await joinHost(code, sink, onGuestLost);
      const res = await n.request<{ session: Session }>('room:join', { code, name, role });
      if (!res.ok) {
        n.close();
        return res.error;
      }
      net = n;
      setSession({ ...res.session, isHost: false });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Erreur réseau.';
    }
  },

  leaveRoom() {
    const n = net;
    net = null;
    n?.emit('room:leave');
    if (n?.isHost) n.close();
    else setTimeout(() => n?.close(), 200);
    resetSession();
  },
  kick: (memberId: string) => emit('room:kick', { memberId }),
  closeRoom: () => emit('room:close'),

  openConfig: () => emit('config:open'),
  updateConfig: async (config: GameConfig) => errorOf(await request('config:update', config)),
  startGame: async () => errorOf(await request('game:start')),

  /** Délai large : l'envoi d'une image peut prendre du temps en 4G. */
  async addItem(item: ItemInput): Promise<{ item: Item } | { error: string }> {
    const r = await request<{ item: Item }>('shop:add', item, 30_000);
    return r.ok ? { item: r.item } : { error: r.error };
  },
  removeItem: (itemId: string) => emit('shop:remove', { itemId }),
  setDone: (done: boolean) => emit('shop:done', { done }),

  revealNext: () => emit('reveal:next'),
  revealPrev: () => emit('reveal:prev'),

  startVoting: () => emit('vote:start'),
  voteCast: async (p: { targetId?: string; choice?: DuelChoice }) => errorOf(await request('vote:cast', p)),
  voteClose: () => emit('vote:close'),
  voteNext: () => emit('vote:next'),
  replay: () => emit('game:replay'),

  getImage: (itemId: string) => request<{ data: ArrayBuffer; mime: string }>('image:get', { itemId }, 20_000),
};

// L'hôte qui ferme ou recharge son onglet efface la partie : on le prévient.
window.addEventListener('beforeunload', (e) => {
  if (net?.isHost && useGame.getState().room) e.preventDefault();
});
