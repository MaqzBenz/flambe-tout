import Peer, { type DataConnection, type PeerError } from 'peerjs';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, type AckResult } from '@bg/shared';
import { HostEngine, type ClientEvent, type ServerEvent } from '../engine/host';
import { randomInt } from '../engine/random';

/**
 * Réseau pair-à-pair.
 *
 * L'hôte ouvre un "pair" PeerJS dont l'identifiant dérive du code du salon ; les invités s'y
 * connectent directement en WebRTC (chiffré DTLS). Le serveur public PeerJS ne sert qu'à
 * mettre les navigateurs en relation : aucune donnée de partie n'y transite.
 */

const PEER_PREFIX = 'flambe-tout-v1-';

type Wire =
  | { t: 'req'; id: number; e: ClientEvent; p?: unknown }
  | { t: 'res'; id: number; r: AckResult<object> }
  | { t: 'evt'; e: ServerEvent; a: unknown[] };

export type EventSink = (event: ServerEvent, args: unknown[]) => void;

export interface Net {
  readonly isHost: boolean;
  request<T = object>(event: ClientEvent, payload?: unknown, timeoutMs?: number): Promise<AckResult<T>>;
  /** Envoi sans attendre de réponse. */
  emit(event: ClientEvent, payload?: unknown): void;
  close(): void;
}

const fail = (error: string): AckResult<never> => ({ ok: false, error });

function newCode(): string {
  return Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]).join('');
}

function openPeer(id?: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 });
    const timer = setTimeout(() => {
      peer.destroy();
      reject(new Error('timeout'));
    }, 15_000);
    peer.once('open', () => {
      clearTimeout(timer);
      resolve(peer);
    });
    peer.once('error', (err: PeerError<string>) => {
      clearTimeout(timer);
      peer.destroy();
      reject(err);
    });
  });
}

const networkError = (err: unknown) =>
  (err as PeerError<string>)?.type === 'network' || (err as Error)?.message === 'timeout'
    ? 'Impossible de joindre le service de mise en relation. Vérifie ta connexion.'
    : 'Erreur réseau, réessaie.';

// ─── Hôte ─────────────────────────────────────────────────────────────────────

/** Crée le salon : ce navigateur devient le serveur de la partie. */
export async function hostRoom(sink: EventSink, onClosed: (reason: string) => void): Promise<{ net: Net; code: string }> {
  let peer: Peer | null = null;
  let code = '';
  for (let attempt = 0; attempt < 5 && !peer; attempt++) {
    code = newCode();
    try {
      peer = await openPeer(PEER_PREFIX + code);
    } catch (err) {
      if ((err as PeerError<string>)?.type !== 'unavailable-id') throw new Error(networkError(err));
    }
  }
  if (!peer) throw new Error('Impossible de créer un salon, réessaie.');
  const hostPeer = peer;

  const engine = new HostEngine(code, (reason) => {
    setTimeout(() => hostPeer.destroy(), 300); // laisse partir les derniers messages
    onClosed(reason);
  });

  // L'hôte est lui-même un client du moteur, sans passer par le réseau.
  engine.addClient({ id: 'local', send: (e, ...a) => sink(e, a), close: () => {} });

  hostPeer.on('connection', (conn: DataConnection) => {
    const id = conn.connectionId;
    conn.on('open', () => {
      engine.addClient({
        id,
        send: (e, ...a) => {
          if (conn.open) conn.send({ t: 'evt', e, a } satisfies Wire);
        },
        close: () => setTimeout(() => conn.close(), 300),
      });
    });
    conn.on('data', (raw) => {
      const msg = raw as Wire;
      if (!msg || msg.t !== 'req' || typeof msg.e !== 'string') return;
      const r = engine.handle(id, msg.e, msg.p) ?? { ok: true };
      if (typeof msg.id === 'number' && msg.id > 0 && conn.open) conn.send({ t: 'res', id: msg.id, r } satisfies Wire);
    });
    conn.on('close', () => engine.removeClient(id));
    conn.on('error', () => engine.removeClient(id));
  });
  // Perte du serveur de mise en relation : les connexions établies continuent ; on se ré-annonce.
  hostPeer.on('disconnected', () => {
    if (!hostPeer.destroyed) hostPeer.reconnect();
  });

  const net: Net = {
    isHost: true,
    request: async <T,>(event: ClientEvent, payload?: unknown) =>
      (engine.handle('local', event, payload) ?? { ok: true }) as AckResult<T>,
    emit: (event, payload) => void engine.handle('local', event, payload),
    close: () => engine.destroy('L’hôte a fermé le salon.'),
  };
  return { net, code };
}

// ─── Invité ───────────────────────────────────────────────────────────────────

/** Se connecte au navigateur de l'hôte. */
export async function joinHost(code: string, sink: EventSink, onLost: () => void): Promise<Net> {
  let peer: Peer;
  try {
    peer = await openPeer();
  } catch (err) {
    throw new Error(networkError(err));
  }

  const conn = await new Promise<DataConnection>((resolve, reject) => {
    const c = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'binary' });
    const timer = setTimeout(() => reject(new Error('Aucun salon avec ce code (ou l’hôte est injoignable).')), 12_000);
    c.once('open', () => {
      clearTimeout(timer);
      resolve(c);
    });
    peer.once('error', (err: PeerError<string>) => {
      clearTimeout(timer);
      reject(new Error(err.type === 'peer-unavailable' ? 'Aucun salon avec ce code.' : networkError(err)));
    });
  }).catch((err) => {
    peer.destroy();
    throw err;
  });

  let nextId = 1;
  const pending = new Map<number, (r: AckResult<object>) => void>();
  let closedByUs = false;

  conn.on('data', (raw) => {
    const msg = raw as Wire;
    if (msg?.t === 'res') {
      pending.get(msg.id)?.(msg.r);
      pending.delete(msg.id);
    } else if (msg?.t === 'evt') sink(msg.e, msg.a ?? []);
  });
  const lost = () => {
    for (const resolve of pending.values()) resolve(fail('Connexion perdue.'));
    pending.clear();
    if (!closedByUs) onLost();
    closedByUs = true;
    peer.destroy();
  };
  conn.on('close', lost);
  conn.on('error', lost);
  peer.on('error', (err: PeerError<string>) => {
    if (err.type !== 'peer-unavailable') lost();
  });

  return {
    isHost: false,
    request: <T,>(event: ClientEvent, payload?: unknown, timeoutMs = 10_000) =>
      new Promise<AckResult<T>>((resolve) => {
        if (!conn.open) return resolve(fail('Connexion perdue.'));
        const id = nextId++;
        const timer = setTimeout(() => {
          pending.delete(id);
          resolve(fail('L’hôte ne répond pas, réessaie.'));
        }, timeoutMs);
        pending.set(id, (r) => {
          clearTimeout(timer);
          resolve(r as AckResult<T>);
        });
        conn.send({ t: 'req', id, e: event, p: payload } satisfies Wire);
      }),
    emit: (event, payload) => {
      if (conn.open) conn.send({ t: 'req', id: 0, e: event, p: payload } satisfies Wire);
    },
    close: () => {
      closedByUs = true;
      conn.close();
      setTimeout(() => peer.destroy(), 200);
    },
  };
}
