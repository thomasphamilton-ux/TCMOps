import { db } from "../../db";

export const productivityService = {
  async getTotals(employeeId: number, start: string, end: string) {
    // Denied days are excluded — see reports/service.ts for the same rule.
    const rows = await db.query.dailyTime.findMany({
      where: (dt, { and, eq, gte, lte }) =>
        and(eq(dt.employeeId, employeeId), gte(dt.date, start), lte(dt.date, end), eq(dt.denied, false)),
      with: { entries: { with: { costCode: true } } },
    });

    const totals = new Map<
      number,
      { costCodeId: number; code: string; description: string; minutes: number; units: number }
    >();

    for (const day of rows) {
      for (const entry of day.entries) {
        const key = entry.costCodeId;
        const existing = totals.get(key) ?? {
          costCodeId: key,
          code: entry.costCode.code,
          description: entry.costCode.description,
          minutes: 0,
          units: 0,
        };
        existing.minutes += entry.minutes;
        existing.units += entry.units ?? 0;
        totals.set(key, existing);
      }
    }

    const breakdown = Array.from(totals.values()).map((t) => ({ ...t, hours: t.minutes / 60 }));
    const totalMinutes = breakdown.reduce((sum, t) => sum + t.minutes, 0);

    return { employeeId, start, end, totalHours: totalMinutes / 60, breakdown };
  },
};
