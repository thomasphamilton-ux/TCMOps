import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { fraudFlags, dailyTime, users, projects } from "../../db/schema";
import type { FraudResolutionReason } from "../../db/schema";
import { fraudEngine } from "./engine";
import { distanceMeters } from "../../lib/geo";
import type { AuthUser } from "../../lib/auth";
import { HttpError } from "../../lib/http-error";

export const fraudService = {
  async list(resolved: boolean | undefined, authUser: AuthUser, projectId?: number) {
    if (authUser.role === "admin") {
      if (projectId === undefined) {
        const rows = await db.select().from(fraudFlags);
        return typeof resolved === "boolean" ? rows.filter((r) => r.resolved === resolved) : rows;
      }
      const rows = await db
        .select({ flag: fraudFlags })
        .from(fraudFlags)
        .innerJoin(users, eq(fraudFlags.employeeId, users.id))
        .where(eq(users.projectId, projectId));
      const flags = rows.map((r) => r.flag);
      return typeof resolved === "boolean" ? flags.filter((f) => f.resolved === resolved) : flags;
    }

    const rows = await db
      .select({ flag: fraudFlags })
      .from(fraudFlags)
      .innerJoin(users, eq(fraudFlags.employeeId, users.id))
      .where(eq(users.projectId, authUser.projectId ?? -1));
    const flags = rows.map((r) => r.flag);
    return typeof resolved === "boolean" ? flags.filter((f) => f.resolved === resolved) : flags;
  },

  async getEmployeeId(id: number): Promise<number | null> {
    const [row] = await db.select({ employeeId: fraudFlags.employeeId }).from(fraudFlags).where(eq(fraudFlags.id, id)).limit(1);
    return row?.employeeId ?? null;
  },

  async getFlags(employeeId: number) {
    return db.select().from(fraudFlags).where(eq(fraudFlags.employeeId, employeeId));
  },

  async resolve(
    id: number,
    resolvedBy: number,
    reason: FraudResolutionReason,
    notes?: string,
    denyHours?: boolean
  ) {
    // Resolving closes the case either way, so it also lifts any cost-coding lock.
    const [updated] = await db
      .update(fraudFlags)
      .set({
        resolved: true,
        underInvestigation: false,
        resolutionReason: reason,
        resolutionNotes: notes ?? null,
        resolvedBy,
        resolvedAt: new Date(),
      })
      .where(eq(fraudFlags.id, id))
      .returning();
    if (!updated) throw new HttpError(404, "Fraud flag not found");

    if (denyHours) {
      // Hours stay on the record for audit — just excluded from totals (see
      // reports/service.ts and productivity/service.ts).
      await db
        .update(dailyTime)
        .set({ denied: true, deniedReason: notes || reason, deniedBy: resolvedBy, deniedAt: new Date() })
        .where(and(eq(dailyTime.employeeId, updated.employeeId), eq(dailyTime.date, updated.date)));
    }

    return updated;
  },

  async investigate(id: number) {
    const [updated] = await db
      .update(fraudFlags)
      .set({ underInvestigation: true })
      .where(eq(fraudFlags.id, id))
      .returning();
    if (!updated) throw new HttpError(404, "Fraud flag not found");
    return updated;
  },

  /** Whether cost-code hours should be locked for this employee+date. */
  async isUnderInvestigation(employeeId: number, date: string): Promise<boolean> {
    const [row] = await db
      .select({ id: fraudFlags.id })
      .from(fraudFlags)
      .where(
        and(
          eq(fraudFlags.employeeId, employeeId),
          eq(fraudFlags.date, date),
          eq(fraudFlags.underInvestigation, true),
          eq(fraudFlags.resolved, false)
        )
      )
      .limit(1);
    return !!row;
  },

  /**
   * Optional per-project geofence check: never blocks the clock in/out, only
   * flags it (same "allow but flag" pattern as facial mismatch). Skips
   * silently if the device didn't supply coordinates or the project has no
   * geofence configured.
   */
  async evaluateGeofence(employeeId: number, date: string, lat?: number, lng?: number) {
    if (lat === undefined || lng === undefined) return;

    const [employee] = await db.select({ projectId: users.projectId }).from(users).where(eq(users.id, employeeId)).limit(1);
    if (!employee?.projectId) return;

    const [project] = await db
      .select({ lat: projects.geofenceLat, lng: projects.geofenceLng, radiusM: projects.geofenceRadiusM })
      .from(projects)
      .where(eq(projects.id, employee.projectId))
      .limit(1);
    if (project?.lat == null || project?.lng == null || project?.radiusM == null) return;

    const distance = distanceMeters(lat, lng, project.lat, project.lng);
    if (distance <= project.radiusM) return;

    await db.insert(fraudFlags).values({
      employeeId,
      date,
      type: "geo_mismatch",
      severity: 2,
      details: `${Math.round(distance)}m outside the ${project.radiusM}m project geofence`,
    });
  },

  async evaluateDaily(employeeId: number, date: string) {
    const [record] = await db
      .select()
      .from(dailyTime)
      .where(and(eq(dailyTime.employeeId, employeeId), eq(dailyTime.date, date)))
      .limit(1);

    if (!record) return;

    const flag = fraudEngine.evaluate(record);
    if (flag) {
      await db.insert(fraudFlags).values({ employeeId, date, ...flag });
    }
  },
};
