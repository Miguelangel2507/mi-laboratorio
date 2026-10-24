export interface Reminder {
  id: string; text: string; hour: number;
  /** Día del mes (1–31). En meses cortos se avisa el último día. */
  day?: number;
  /** Día de la semana, 0 = domingo. */
  weekday?: number;
  /** Ruta de la app que se abre al tocar el aviso (empieza por #/). */
  url?: string;
}

export interface LocalTime { date: string; day: number; hour: number; weekday: number; lastDay: number }

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Fecha y hora en la zona horaria del usuario (respeta el cambio de hora de verano). */
export function localTime(now: Date, tz: string): LocalTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const y = Number(get('year')), m = Number(get('month')), day = Number(get('day'));
  return {
    date: `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    day, hour: Number(get('hour')) % 24, weekday: WEEKDAYS[get('weekday')],
    lastDay: new Date(Date.UTC(y, m, 0)).getUTCDate(),
  };
}

export function dueReminders(now: Date, tz: string, reminders: Reminder[]): { due: Reminder[]; local: LocalTime } {
  const local = localTime(now, tz);
  const due = reminders.filter((r) => r.hour === local.hour &&
    (r.day !== undefined ? Math.min(r.day, local.lastDay) === local.day : r.weekday === local.weekday));
  return { due, local };
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length > 64) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

/** Limpia lo que llega del cliente: solo textos cortos y horarios válidos; nada más se guarda. */
export function sanitizeReminders(x: unknown): Reminder[] | null {
  if (!Array.isArray(x) || x.length > 10) return null;
  const out: Reminder[] = [];
  for (const r of x) {
    if (!r || typeof r !== 'object') return null;
    const { id, text, hour, day, weekday, url } = r as Record<string, unknown>;
    if (typeof id !== 'string' || !/^[\w-]{1,32}$/.test(id)) return null;
    if (typeof text !== 'string' || text.length === 0 || text.length > 140) return null;
    if (!Number.isInteger(hour) || (hour as number) < 0 || (hour as number) > 23) return null;
    const hasDay = day !== undefined, hasWeek = weekday !== undefined;
    if (hasDay === hasWeek) return null; // exactamente uno de los dos
    if (hasDay && (!Number.isInteger(day) || (day as number) < 1 || (day as number) > 31)) return null;
    if (hasWeek && (!Number.isInteger(weekday) || (weekday as number) < 0 || (weekday as number) > 6)) return null;
    if (url !== undefined && (typeof url !== 'string' || !/^#\/[\w/-]{0,60}$/.test(url))) return null;
    out.push({ id, text, hour: hour as number, ...(hasDay ? { day: day as number } : { weekday: weekday as number }), ...(url ? { url: url as string } : {}) });
  }
  return out;
}
