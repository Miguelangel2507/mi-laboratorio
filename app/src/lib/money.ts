/**
 * Interpreta "12,50", "12.50", "1.234,56" y "1.000" (mil, como se escribe en español).
 * Con `dotThousands: false` el punto es siempre decimal (para CSV de otras fuentes).
 */
export function parseDecimal(input: string, opts: { dotThousands?: boolean } = {}): number | null {
  const { dotThousands = true } = opts;
  let s = input.trim().replace(/\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (dotThousands && /^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^-?\d*\.?\d+$/.test(s)) return null;
  return Number(s);
}

/** Céntimos redondeados "half up" sin pasar por coma flotante (1,005 a 101). */
export function toCents(input: string, opts?: { dotThousands?: boolean }): number | null {
  const n = parseDecimal(input, opts);
  if (n === null) return null;
  const neg = n < 0;
  const [int, frac = ''] = Math.abs(n).toFixed(10).replace(/0+$/, '').split('.');
  const cents = Number(int) * 100 + Number((frac + '00').slice(0, 2)) + (Number(frac[2] ?? 0) >= 5 ? 1 : 0);
  return neg ? -cents : cents;
}

export function formatMoney(cents: number, currency: string, locale = 'es-ES'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}
