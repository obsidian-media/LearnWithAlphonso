/**
 * Small, pure date helpers for the rehearsal screens. A "day" is a YYYY-MM-DD string on the learner's own calendar.
 * English month and day names are fixed tables (the app's own UI is English and the three platforms print the same).
 */
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const DAY_MS = 86_400_000;
const utc = (day: string) => Date.parse(`${day}T00:00:00Z`);

/** The device's own calendar day: the local fields of `now`, never the UTC date. */
export function localToday(now: Date = new Date()): string {
  return iso(now.getFullYear(), now.getMonth(), now.getDate());
}

/** `day` plus `n` days (calendar days, no clock: safe across daylight saving). */
export function addDaysTo(day: string, n: number): string {
  return new Date(utc(day) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `today` to `day` (negative once it has passed). */
export function daysToGo(day: string, today: string): number {
  return Math.round((utc(day) - utc(today)) / DAY_MS);
}

export function daysToGoText(day: string, today: string): string {
  const n = daysToGo(day, today);
  if (n === 0) return "Today";
  if (n === 1) return "1 day to go";
  if (n > 1) return `${n} days to go`;
  if (n === -1) return "It was yesterday";
  return `${-n} days ago`;
}

const parts = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return { y, m: m - 1, d, w: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
};

/** "Tue 1 Dec". */
export function shortDay(day: string): string {
  const { m, d, w } = parts(day);
  return `${DAYS[w].slice(0, 3)} ${d} ${MONTHS[m].slice(0, 3)}`;
}

/** "Wednesday 2 December". */
export function longDay(day: string): string {
  const { m, d, w } = parts(day);
  return `${DAYS[w]} ${d} ${MONTHS[m]}`;
}

export const monthTitle = (year: number, month: number) => `${MONTHS[month]} ${year}`;

export function addMonths(
  year: number,
  month: number,
  by: number,
): { year: number; month: number } {
  const total = year * 12 + month + by;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/** The weeks of a month, Monday first; a cell outside the month is null. */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const lead = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: count }, (_, i) => iso(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
