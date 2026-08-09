import { and, eq, desc } from "drizzle-orm";
import { db } from "../../db";
import { lunchExceptions, users } from "../../db/schema";
import type { AuthUser } from "../../lib/auth";
import { HttpError } from "../../lib/http-error";
import { timeService } from "../time/service";

export const lunchExceptionsService = {
  /** Logging re-logs (and resets approval) if this employee+date already has one — matches the attendance "one record per day" pattern. */
  async log(employeeId: number, date: string, reason: string, loggedBy: number) {
    const [created] = await db
      .insert(lunchExceptions)
      .values({ employeeId, date, reason, loggedBy })
      .onConflictDoUpdate({
        target: [lunchExceptions.employeeId, lunchExceptions.date],
        set: { reason, loggedBy, loggedAt: new Date(), approved: false, approvedBy: null, approvedAt: null },
      })
      .returning();
    return created;
  },

  async getEmployeeId(id: number): Promise<number | null> {
    const [row] = await db.select({ employeeId: lunchExceptions.employeeId }).from(lunchExceptions).where(eq(lunchExceptions.id, id)).limit(1);
    return row?.employeeId ?? null;
  },

  async approve(id: number, approvedBy: number) {
    const [updated] = await db
      .update(lunchExceptions)
      .set({ approved: true, approvedBy, approvedAt: new Date() })
      .where(eq(lunchExceptions.id, id))
      .returning();
    if (!updated) throw new HttpError(404, "Lunch exception not found");

    // The 30-minute deduction may already have been applied at clock-out —
    // recompute now that it's waived (approval commonly happens after the fact).
    await timeService.recomputeWorkedMinutes(updated.employeeId, updated.date);
    return updated;
  },

  /** Pending review queue — project-scoped like fraud's open-flags list. */
  async listPending(authUser: AuthUser, projectId?: number) {
    if (authUser.role === "admin") {
      if (projectId === undefined) {
        return db.select().from(lunchExceptions).where(eq(lunchExceptions.approved, false));
      }
      const rows = await db
        .select({ exception: lunchExceptions })
        .from(lunchExceptions)
        .innerJoin(users, eq(lunchExceptions.employeeId, users.id))
        .where(and(eq(lunchExceptions.approved, false), eq(users.projectId, projectId)));
      return rows.map((r) => r.exception);
    }

    const rows = await db
      .select({ exception: lunchExceptions })
      .from(lunchExceptions)
      .innerJoin(users, eq(lunchExceptions.employeeId, users.id))
      .where(and(eq(lunchExceptions.approved, false), eq(users.projectId, authUser.projectId ?? -1)));
    return rows.map((r) => r.exception);
  },

  async getForEmployee(employeeId: number) {
    return db.select().from(lunchExceptions).where(eq(lunchExceptions.employeeId, employeeId)).orderBy(desc(lunchExceptions.date));
  },
};
