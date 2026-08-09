import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { perDiem, dailyTime } from "../../db/schema";
import { perDiemEngine } from "./engine";

export const perDiemService = {
  async list(employeeId: number) {
    return db.select().from(perDiem).where(eq(perDiem.employeeId, employeeId));
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
