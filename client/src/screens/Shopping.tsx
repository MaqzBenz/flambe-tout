import { useRef, useState, type FormEvent } from 'react';
import {
  GAME_LIMITS,
  formatEuros,
  parseEuroInput,
  type Item,
  type PrivateBasket,
  type PublicRoomState,
} from '@bg/shared';
import { actions } from '../net/session';
import { useGame } from '../store';
import { dropImage, putImage, useItemImage } from '../lib/imageCache';
import { ImagePicker, ItemThumb, type PickedImage } from '../components/ImagePicker';
import { Barcode, Button, Field, Input, Monogram, Sheet, Stamp, TextArea } from '../components/ui';
import { Timer } from '../components/Timer';

export function Shopping({ room, meId }: { room: PublicRoomState; meId: string }) {
  const basket = useGame((s) => s.basket);
  const me = room.members.find((m) => m.id === meId);
  const isPlayer = me?.role === 'player';
  const budget = room.config.budgetCents;
  const spent = basket?.spentCents ?? 0;
  const balance = budget - spent;

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-6 px-4 pb-10">
      <header className="sticky top-0 z-10 -mx-4 border-b-2 border-ink bg-paper/95 px-4 pt-3 pb-3 backdrop-blur-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Timer endsAt={room.endsAt} />
          <div className="hidden text-center sm:block">
            <div className="display text-3xl">Le magasin est ouvert</div>
            <div className="kicker">Caisse {room.code}</div>
          </div>
          {isPlayer && (
            <div className="text-right">
              <span className="kicker">Solde disponible</span>
              <div className={`font-mono text-3xl leading-none font-bold sm:text-4xl ${balance === 0 ? 'text-ok' : ''}`}>
                {formatEuros(balance)}
              </div>
            </div>
          )}
        </div>
        {isPlayer && <SpendGauge spent={spent} budget={budget} />}
      </header>

      {isPlayer && basket ? (
        <div className="grid items-start gap-8 lg:grid-cols-[1fr_380px]">
          <OrderForm balance={balance} requireUrl={room.config.requireUrl} disabled={basket.done} />
          <div className="flex flex-col gap-6 lg:sticky lg:top-36">
            <LiveReceipt basket={basket} budget={budget} code={room.code} name={me?.name ?? ''} />
            <Others room={room} meId={meId} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <Sheet className="p-6 text-center">
            <p className="display text-4xl">Les clients font leurs emplettes</p>
            <p className="mt-2 font-mono text-sm text-ink-soft">Les paniers resteront secrets jusqu’à la fermeture.</p>
          </Sheet>
          <Others room={room} meId={meId} />
        </div>
      )}
    </main>
  );
}

/** Jauge graduée façon règle. */
function SpendGauge({ spent, budget }: { spent: number; budget: number }) {
  const pct = Math.min(100, (spent / budget) * 100);
  return (
    <div className="relative mt-3 h-3 border border-ink bg-sheet" aria-hidden>
      <div className="h-full bg-ink transition-[width] duration-500" style={{ width: `${pct}%` }} />
      <div className="pointer-events-none absolute inset-0 flex justify-between px-px">
        {Array.from({ length: 11 }, (_, i) => (
          <span key={i} className={`w-px bg-rule ${i % 5 === 0 ? 'h-full' : 'h-1/2'}`} />
        ))}
      </div>
    </div>
  );
}

function OrderForm({ balance, requireUrl, disabled }: { balance: number; requireUrl: boolean; disabled: boolean }) {
  const [name, setName] = useState('');
  const [priceText, setPriceText] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState<PickedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const price = priceText.trim() ? parseEuroInput(priceText) : null;
  const tooExpensive = price !== null && price > balance;
  const canSubmit =
    !disabled && !busy && name.trim() && price !== null && !tooExpensive && (!requireUrl || url.trim()) && balance > 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || price === null) return;
    setBusy(true);
    const res = await actions.addItem({
      name,
      priceCents: price,
      url: url.trim() || undefined,
      description: description.trim() || undefined,
      image: image ? await image.blob.arrayBuffer() : undefined,
    });
    setBusy(false);
    if ('error' in res) return setError(res.error);
    setError(null);
    if (image) {
      putImage(res.item.id, image.blob); // copie locale, pas besoin de la redemander
      URL.revokeObjectURL(image.url);
    }
    setName('');
    setPriceText('');
    setUrl('');
    setDescription('');
    setImage(null);
    nameRef.current?.focus();
  }

  return (
    <Sheet className={`p-5 sm:p-7 ${disabled ? 'opacity-55' : ''}`}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <div className="flex items-baseline justify-between border-b-2 border-ink pb-1">
          <h2 className="display text-4xl">Bon d’achat</h2>
          <span className="kicker">à remplir lisiblement</span>
        </div>

        <Field label="Désignation de l’article *">
          <Input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={GAME_LIMITS.ITEM_NAME_MAX}
            placeholder="Un château gonflable en or massif"
            disabled={disabled}
            autoFocus
            className="text-xl"
          />
        </Field>

        <Field
          label="Prix TTC *"
          hint={
            priceText.trim() ? (
              <span className={price === null || tooExpensive ? 'text-tag' : ''}>
                {price === null ? 'prix illisible' : tooExpensive ? `trop cher — il te reste ${formatEuros(balance)}` : `= ${formatEuros(price)}`}
              </span>
            ) : (
              'formats acceptés : 250 000 · 1,5M · 2 milliards'
            )
          }
        >
          <div className="flex items-end gap-3">
            <Input
              value={priceText}
              onChange={(e) => setPriceText(e.target.value)}
              placeholder="0,00 €"
              inputMode="decimal"
              disabled={disabled}
              className="font-mono text-2xl"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={disabled || balance === 0}
              onClick={() => setPriceText(String(balance / 100).replace('.', ','))}
            >
              Tout le reste
            </Button>
          </div>
        </Field>

        <Field label={requireUrl ? 'Lien source *' : 'Lien source (facultatif)'}>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            maxLength={GAME_LIMITS.ITEM_URL_MAX}
            placeholder="https://"
            inputMode="url"
            disabled={disabled}
            className="font-mono text-base"
          />
        </Field>

        <Field label="Justification (lue à voix haute lors de la vente)">
          <TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={GAME_LIMITS.ITEM_DESCRIPTION_MAX}
            rows={3}
            placeholder="Parce que je le vaux bien."
            disabled={disabled}
          />
        </Field>

        <ImagePicker value={image} onChange={setImage} disabled={disabled || busy} />

        {error && <p className="font-mono text-sm font-bold text-tag">{error}</p>}
        <Button type="submit" size="lg" disabled={!canSubmit}>
          {busy ? 'Passage en caisse…' : balance === 0 ? 'Plus un centime' : 'Passer en caisse'}
        </Button>
      </form>
    </Sheet>
  );
}

function LiveReceipt({ basket, budget, code, name }: { basket: PrivateBasket; budget: number; code: string; name: string }) {
  return (
    <div className="relative">
      <div className="receipt px-5 text-sm">
        <div className="text-center">
          <div className="font-bold tracking-[0.3em]">FLAMBE TOUT</div>
          <div className="text-xs text-ink-soft">caisse {code} — client : {name}</div>
        </div>
        <hr className="perf my-3" />
        {basket.items.length === 0 ? (
          <p className="py-6 text-center text-ink-soft">— ticket vide —</p>
        ) : (
          <ul className="flex max-h-[42vh] flex-col gap-2 overflow-y-auto pr-1">
            {basket.items.map((item) => (
              <ReceiptLine key={item.id} item={item} removable={!basket.done} />
            ))}
          </ul>
        )}
        <hr className="perf my-3" />
        <div className="leader">
          <span>ARTICLES</span>
          <span>{basket.items.length}</span>
        </div>
        <div className="leader text-base font-bold">
          <span>TOTAL</span>
          <span>{formatEuros(basket.spentCents)}</span>
        </div>
        <div className="leader">
          <span>RESTE</span>
          <span>{formatEuros(budget - basket.spentCents)}</span>
        </div>
        <Barcode value={code + name} height={34} className="mt-4 w-full text-ink" />
        <p className="mt-1 text-center text-xs text-ink-soft">merci de votre visite</p>
      </div>
      {basket.done && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Stamp color="stamp" rotate={-12} className="bg-sheet/40 text-4xl">
            Validé
          </Stamp>
        </div>
      )}
      <Button
        variant={basket.done ? 'outline' : 'tag'}
        className="mt-4 w-full"
        onClick={() => actions.setDone(!basket.done)}
      >
        {basket.done ? 'Rouvrir mon ticket' : 'J’ai terminé'}
      </Button>
    </div>
  );
}

function ReceiptLine({ item, removable }: { item: Item; removable: boolean }) {
  const img = useItemImage(item.id, item.hasImage);
  return (
    <li className="animate-print flex items-start gap-2">
      {item.hasImage && <ItemThumb url={img} size={30} />}
      <div className="min-w-0 flex-1">
        <div className="leader">
          <span className="truncate">{item.name}</span>
          <span className="shrink-0">{formatEuros(item.priceCents)}</span>
        </div>
        {removable && (
          <button
            onClick={() => {
              actions.removeItem(item.id);
              dropImage(item.id);
            }}
            className="cursor-pointer text-xs text-ink-soft underline hover:text-tag"
          >
            annuler la ligne
          </button>
        )}
      </div>
    </li>
  );
}

function Others({ room, meId }: { room: PublicRoomState; meId: string }) {
  const players = room.members.filter((m) => m.role === 'player' && m.id !== meId);
  if (players.length === 0) return null;
  return (
    <section>
      <h3 className="kicker border-b border-ink pb-1">Aux autres caisses</h3>
      <ul>
        {players.map((m) => {
          const p = room.progress[m.id];
          return (
            <li key={m.id} className={`flex items-center gap-2 border-b border-rule py-2 ${m.connected ? '' : 'opacity-45'}`}>
              <Monogram name={m.name} color={m.color} size={24} />
              <span className="min-w-0 flex-1 truncate font-semibold">{m.name}</span>
              <span className="font-mono text-xs">{p?.items ?? 0} art.</span>
              <span className={`w-20 text-right font-mono text-xs uppercase ${p?.done ? 'font-bold text-ok' : 'text-ink-soft'}`}>
                {p?.done ? 'terminé' : 'en cours'}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
