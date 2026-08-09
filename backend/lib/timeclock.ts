// Timeclock rounding/scheduling rules. Timestamps are compared using the
// server's local wall-clock time (Date getters), same single-timezone
// assumption already made elsewhere in this app (e.g. the frontend's
// "local calendar date" helpers) — there is no per-project/team timezone
// setting, so a shift start of "07:00" means 7am wherever this server runs.

export const ROUND_MINUTES = 15;
export const LUNCH_MINUTES = 30;
export const EARLY_GRACE_MINUTES = 10;

const ROUND_MS = ROUND_MINUTES * 60_000;

/** Rounds a timestamp to the nearest 15 minutes (standard midpoint rounding). */
export function roundToNearest15(value: Date): Date {
  return new Date(Math.round(value.getTime() / ROUND_MS) * ROUND_MS);
}

/** Parses a Postgres "HH:MM:SS" time-of-day string into minutes since midnight. */
export function parseTimeOfDay(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

/** Anchors a minutes-since-midnight time-of-day onto the same calendar day as `reference`. */
export function shiftStartOn(reference: Date, shiftStartMinutes: number): Date {
  const d = new Date(reference);
  d.setHours(Math.floor(shiftStartMinutes / 60), shiftStartMinutes % 60, 0, 0);
  return d;
}

/** "HH:MM" formatting for error messages, from minutes since midnight. */
export function formatTimeOfDay(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}
