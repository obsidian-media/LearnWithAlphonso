const DAY: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
const TIME: Intl.DateTimeFormatOptions = {
  ...DAY,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

/** "2 Mar 2026". One format for every date the console shows, whatever the browser's locale. */
export function formatDay(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { ...DAY, timeZone });
}

/** "14 Nov 2026, 10:41". */
export function formatDateTime(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleString("en-GB", { ...TIME, timeZone });
}
