// Tout l'argent est manipulé en centimes entiers (pas d'erreurs d'arrondi des flottants).

const fmtCache = new Map<string, Intl.NumberFormat>();
function fmt(decimals: number, compact: boolean): Intl.NumberFormat {
  const key = `${decimals}-${compact}`;
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: compact ? 0 : decimals,
      maximumFractionDigits: compact ? 1 : decimals,
      notation: compact ? 'compact' : 'standard',
    });
    fmtCache.set(key, f);
  }
  return f;
}

/** 150000000 -> "1 500 000 €" ; 12345 -> "123,45 €". */
export function formatEuros(cents: number): string {
  return fmt(cents % 100 === 0 ? 0 : 2, false).format(cents / 100);
}

/** 150000000 -> "1,5 M €" */
export function formatEurosCompact(cents: number): string {
  return Math.abs(cents) < 1_000_000 ? formatEuros(cents) : fmt(0, true).format(cents / 100);
}

const MULTIPLIERS: [RegExp, number][] = [
  [/(md|mds|milliards?|b|bn)$/, 1e9],
  [/(m|millions?)$/, 1e6],
  [/(k|mille)$/, 1e3],
];

/**
 * Parse une saisie libre en centimes : "1 500 000", "1,5M", "2.5 k", "3 milliards", "49,99 €".
 * Renvoie null si la saisie est invalide.
 */
export function parseEuroInput(raw: string): number | null {
  let s = raw.toLowerCase().replace(/[\s  €]/g, '').replace(/eur(os?)?$/, '');
  if (!s) return null;

  let mult = 1;
  for (const [re, m] of MULTIPLIERS) {
    if (re.test(s)) {
      s = s.replace(re, '');
      mult = m;
      break;
    }
  }

  // Séparateurs : plusieurs occurrences du même = milliers ; sinon la virgule est décimale.
  const commas = (s.match(/,/g) ?? []).length;
  const dots = (s.match(/\./g) ?? []).length;
  if (commas && dots) {
    // "1.234,56" ou "1,234.56" : le dernier séparateur est le décimal.
    const decimalSep = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    s = s.split(thousandSep).join('').replace(decimalSep, '.');
  } else if (commas > 1) s = s.replace(/,/g, '');
  else if (dots > 1) s = s.replace(/\./g, '');
  else if (commas === 1) s = s.replace(',', '.');
  else if (dots === 1 && mult === 1 && /^\d{1,3}\.\d{3}$/.test(s)) s = s.replace('.', ''); // "1.500" = 1500

  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const cents = Math.round(Number(s) * mult * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}
