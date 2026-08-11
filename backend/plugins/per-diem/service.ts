import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { perDiem, dailyTime, users, attendanceRecords } from "../../db/schema";
import { perDiemEngine } from "./engine";

const MIN_WORKED_MINUTES = 5 * 60;

/** Monday of the calendar week containing `dateStr` ("YYYY-MM-DD" in, out). */
function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const diffFromMonday = (d.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  d.setUTCDate(d.getUTCDate() - diffFromMonday);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export const perDiemService = {
  async list(employeeId: number) {
    return db.select().from(perDiem).where(eq(perDiem.employeeId, employeeId));
  },

  /** The 7 (possibly synthetic/unsaved) per-diem rows for a Mon-Sun week, in date order. */
  async getWeek(employeeId: number, weekStartRaw: string) {
    const weekStart = mondayOf(weekStartRaw);
    const dates = weekDates(weekStart);
    const rows = await db
      .select()
      .from(perDiem)
      .where(and(eq(perDiem.employeeId, employeeId), inArray(perDiem.date, dates)));
    const byDate = new Map(rows.map((r) => [r.date, r]));
    return dates.map(
      (date) =>
        byDate.get(date) ?? {
          id: null,
          employeeId,
          date,
          eligible: false,
          reason: null,
          amount: 0,
          manualOverride: false,
          overrideBy: null,
          overrideAt: null,
        }
    );
  },

  /**
   * Automatic weekly per diem, Monday-Sunday:
   *  - a day is "OK" if the employee worked 5+ hours, or has any attendance
   *    status other than "unexcused" (vacation/bereavement/turnaround/excused/
   *    other all count as excused for this purpose).
   *  - if EVERY day that has activity at all (a clock record or an attendance
   *    record — blank weekends with nothing logged don't count either way) is
   *    OK, the whole week gets the "full week" bonus: all 7 days paid.
   *  - otherwise each day is paid independently based on its own OK-ness.
   *  - days a supervisor has manually overridden are left untouched.
   * No-op (but still returns existing overrides) if the employee has no
   * per-diem rate configured.
   */
  async calculateWeek(employeeId: number, weekStartRaw: string) {
    const weekStart = mondayOf(weekStartRaw);
    const dates = weekDates(weekStart);

    const [employee] = await db
      .select({ rateCents: users.perDiemRateCents })
      .from(users)
      .where(eq(users.id, employeeId))
      .limit(1);
    const rateCents = employee?.rateCents ?? 0;
    if (!employee || rateCents <= 0) return this.getWeek(employeeId, weekStart);

    const dailyRows = await db
      .select()
      .from(dailyTime)
      .where(and(eq(dailyTime.employeeId, employeeId), inArray(dailyTime.date, dates)));
    const dailyByDate = new Map(dailyRows.map((d) => [d.date, d]));

    const attendanceRows = await db
      .select()
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.employeeId, employeeId), inArray(attendanceRecords.date, dates)));
    const attendanceByDate = new Map(attendanceRows.map((a) => [a.date, a]));

    const existingRows = await db
      .select()
      .from(perDiem)
      .where(and(eq(perDiem.employeeId, employeeId), inArray(perDiem.date, dates)));
    const existingByDate = new Map(existingRows.map((p) => [p.date, p]));

    const calcs = dates.map((date) => {
      const day = dailyByDate.get(date);
      const attendance = attendanceByDate.get(date);
      const workedMinutes = day?.workedMinutes ?? 0;
      const hasActivity = !!day || !!attendance;
      const excused = !!attendance && attendance.status !== "unexcused";
      const ok = workedMinutes >= MIN_WORKED_MINUTES || excused;
      return { date, hasActivity, ok };
    });

    const activeDays = calcs.filter((c) => c.hasActivity);
    const fullWeekBonus = activeDays.length > 0 && activeDays.every((c) => c.ok);

    for (const calc of calcs) {
      if (existingByDate.get(calc.date)?.manualOverride) continue;

      const eligible = fullWeekBonus || calc.ok;
      const reason = fullWeekBonus
        ? "Full week worked/excused — per diem paid for all 7 days"
        : calc.ok
          ? "Worked 5+ hours or excused"
          : "Worked less than 5 hours and not excused";
      const amount = eligible ? rateCents : 0;

      await db
        .insert(perDiem)
        .values({ employeeId, date: calc.date, eligible, reason, amount })
        .onConflictDoUpdate({ target: [perDiem.employeeId, perDiem.date], set: { eligible, reason, amount } });
    }

    return this.getWeek(employeeId, weekStart);
  },

  async recalculateWeekContaining(employeeId: number, date: string) {
    await this.calculateWeek(employeeId, mondayOf(date));
  },

  /** Supervisor-or-above forces a specific day to pay or not pay, overriding automatic calculation. */
  async setOverride(employeeId: number, date: string, eligible: boolean, overrideBy: number) {
    const [employee] = await db
      .select({ rateCents: users.perDiemRateCents })
      .from(users)
      .where(eq(users.id, employeeId))
      .limit(1);
    const amount = eligible ? employee?.rateCents ?? 0 : 0;
    const patch = {
      eligible,
      amount,
      reason: "Manually set",
      manualOverride: true,
      overrideBy,
      overrideAt: new Date(),
    };
    const [saved] = await db
      .insert(perDiem)
      .values({ employeeId, date, ...patch })
      .onConflictDoUpdate({ target: [perDiem.employeeId, perDiem.date], set: patch })
      .returning();
    return saved;
  },

  /** Reverts a day back to automatic calculation. */
  async clearOverride(employeeId: number, date: string) {
    await db
      .update(perDiem)
      .set({ manualOverride: false, overrideBy: null, overrideAt: null })
      .where(and(eq(perDiem.employeeId, employeeId), eq(perDiem.date, date)));
    await this.recalculateWeekContaining(employeeId, date);
  },

  async evaluate(employeeId: number, date: string, miles: number, stayedOvernight: boolean) {
    const [record] = await db
      .select()
      .from(dailyTime)
      .where(and(eq(dailyTime.employeeId, employeeId), eq(dailyTime.date, date)))
      .limit(1);

    const hours =
      record?.clockIn && record?.clockOut
        ? (record.clockOut.getTime() - record.clockIn.getTime()) / 3_600_000
        : 0;

    const result = perDiemEngine.evaluate({ miles, hours, stayedOvernight });

    const [saved] = await db
      .insert(perDiem)
      .values({ employeeId, date, eligible: result.eligible, reason: result.reason, amount: result.amount })
      .onConflictDoUpdate({
        target: [perDiem.employeeId, perDiem.date],
        set: { eligible: result.eligible, reason: result.reason, amount: result.amount },
      })
      .returning();

    return saved;
  },
};
