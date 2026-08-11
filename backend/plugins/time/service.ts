import { and, eq, desc, gte, lte, isNotNull } from "drizzle-orm";
import { db } from "../../db";
import { dailyTime, dailyEntries, clockEvents, timeEditLog, users, fraudFlags, teams, lunchExceptions } from "../../db/schema";
import { fraudService } from "../fraud/service";
import { perDiemService } from "../per-diem/service";
import type { AuthUser } from "../../lib/auth";
import { HttpError } from "../../lib/http-error";
import {
  roundToNearest15,
  parseTimeOfDay,
  shiftStartOn,
  formatTimeOfDay,
  EARLY_GRACE_MINUTES,
  LUNCH_MINUTES,
} from "../../lib/timeclock";

async function logEdit(
  employeeId: number,
  date: string,
  field: string,
  oldValue: unknown,
  newValue: unknown,
  editedBy: number,
  reason?: string
) {
  if (String(oldValue ?? "") === String(newValue ?? "")) return; // no actual change, nothing to log
  await db.insert(timeEditLog).values({
    employeeId,
    date,
    field,
    oldValue: oldValue === null || oldValue === undefined ? null : String(oldValue),
    newValue: newValue === null || newValue === undefined ? null : String(newValue),
    reason: reason ?? null,
    editedBy,
  });
}

/**
 * Minutes since midnight for the employee's team's configured shift start, or
 * null if the early-grace/floor rules don't apply at all — no shift start
 * configured, or the employee is exempt. Foremen, supervisors, and everyone
 * above them aren't held to shift constraints; individual rank-and-file
 * workers can also be marked exempt via users.shiftExempt.
 */
async function getShiftStartMinutes(employeeId: number): Promise<number | null> {
  const [employee] = await db
    .select({ teamId: users.teamId, role: users.role, shiftExempt: users.shiftExempt })
    .from(users)
    .where(eq(users.id, employeeId))
    .limit(1);
  if (!employee) return null;
  if (employee.role !== "employee") return null;
  if (employee.shiftExempt) return null;
  if (!employee.teamId) return null;

  const [team] = await db.select({ shiftStart: teams.shiftStart }).from(teams).where(eq(teams.id, employee.teamId)).limit(1);
  if (!team?.shiftStart) return null;

  return parseTimeOfDay(team.shiftStart);
}

async function getOrCreateDailyTime(employeeId: number, date: string, createdBy: number) {
  const [existing] = await db
    .select()
    .from(dailyTime)
    .where(and(eq(dailyTime.employeeId, employeeId), eq(dailyTime.date, date)))
    .limit(1);
  if (existing) return existing;

  // Snapshotted once, here, at creation — see the comment on dailyTime.projectId
  // in db/schema.ts for why this must never be re-derived from the employee's
  // (possibly since-changed) current project/team.
  const [employee] = await db
    .select({ projectId: users.projectId, teamId: users.teamId })
    .from(users)
    .where(eq(users.id, employeeId))
    .limit(1);

  const [created] = await db
    .insert(dailyTime)
    .values({ employeeId, date, createdBy, projectId: employee?.projectId ?? null, teamId: employee?.teamId ?? null })
    .returning();
  return created;
}

export const CLOCK_OUT_ATTESTATION =
  "By my signature I attest to the fact that I have not been injured or involved in any job-related incidents today";

async function getLastEvent(dailyTimeId: number) {
  const [last] = await db
    .select()
    .from(clockEvents)
    .where(eq(clockEvents.dailyTimeId, dailyTimeId))
    .orderBy(desc(clockEvents.id))
    .limit(1);
  return last ?? null;
}

export const timeService = {
  async getEmployeeIdForEntry(entryId: number): Promise<number | null> {
    const [row] = await db
      .select({ employeeId: dailyTime.employeeId })
      .from(dailyEntries)
      .innerJoin(dailyTime, eq(dailyEntries.dailyTimeId, dailyTime.id))
      .where(eq(dailyEntries.id, entryId))
      .limit(1);
    return row?.employeeId ?? null;
  },

  async getEmployeeIdForDailyTime(dailyTimeId: number): Promise<number | null> {
    const [row] = await db.select({ employeeId: dailyTime.employeeId }).from(dailyTime).where(eq(dailyTime.id, dailyTimeId)).limit(1);
    return row?.employeeId ?? null;
  },

  async clockIn(employeeId: number, timestamp: string, actorId: number, image?: string, lat?: number, lng?: number) {
    const date = timestamp.slice(0, 10);
    const rawTime = new Date(timestamp);
    const record = await getOrCreateDailyTime(employeeId, date, actorId);

    const last = await getLastEvent(record.id);
    if (last?.type === "in") throw new HttpError(409, "Already clocked in");

    // The early-grace window and shift-start floor only apply to the first
    // clock-in of the day — a return from a mid-day break isn't a shift start.
    let effectiveClockIn = roundToNearest15(rawTime);
    if (record.clockIn === null) {
      const shiftStartMinutes = await getShiftStartMinutes(employeeId);
      if (shiftStartMinutes !== null) {
        const shiftStartDate = shiftStartOn(rawTime, shiftStartMinutes);
        const earliestAllowed = new Date(shiftStartDate.getTime() - EARLY_GRACE_MINUTES * 60_000);
        if (rawTime < earliestAllowed) {
          throw new HttpError(
            400,
            `Clock-in is not allowed more than ${EARLY_GRACE_MINUTES} minutes before shift start (${formatTimeOfDay(shiftStartMinutes)}).`
          );
        }
        // Time doesn't start until shift start, even if the rounded punch is earlier.
        if (effectiveClockIn < shiftStartDate) effectiveClockIn = shiftStartDate;
      }
    }

    await db.insert(clockEvents).values({
      dailyTimeId: record.id,
      type: "in",
      timestamp: rawTime,
      image: image ?? null,
      lat: lat ?? null,
      lng: lng ?? null,
      createdBy: actorId,
    });

    const [updated] = await db
      .update(dailyTime)
      .set({
        clockIn: record.clockIn ?? effectiveClockIn, // first clock-in of the day
        updatedBy: actorId,
        updatedAt: new Date(),
      })
      .where(eq(dailyTime.id, record.id))
      .returning();

    await fraudService.evaluateGeofence(employeeId, date, lat, lng);
    return updated;
  },

  async clockOut(
    employeeId: number,
    timestamp: string,
    actorId: number,
    image?: string,
    signature?: string,
    lat?: number,
    lng?: number
  ) {
    if (!signature) throw new HttpError(400, "A signature is required to clock out");

    const date = timestamp.slice(0, 10);
    const [record] = await db
      .select()
      .from(dailyTime)
      .where(and(eq(dailyTime.employeeId, employeeId), eq(dailyTime.date, date)))
      .limit(1);

    if (!record) throw new HttpError(400, "Not clocked in");

    const last = await getLastEvent(record.id);
    if (last?.type !== "in") throw new HttpError(400, "Not clocked in");

    const rawTime = new Date(timestamp);

    await db.insert(clockEvents).values({
      dailyTimeId: record.id,
      type: "out",
      timestamp: rawTime,
      image: image ?? null,
      signature,
      attestationText: CLOCK_OUT_ATTESTATION,
      lat: lat ?? null,
      lng: lng ?? null,
      createdBy: actorId,
    });

    await db
      .update(dailyTime)
      .set({ clockOut: roundToNearest15(rawTime), updatedBy: actorId, updatedAt: new Date() }) // last clock-out of the day
      .where(eq(dailyTime.id, record.id));

    await fraudService.evaluateDaily(employeeId, date);
    await fraudService.evaluateGeofence(employeeId, date, lat, lng);
    return this.recomputeWorkedMinutes(employeeId, date);
  },

  /**
   * (clockOut - clockIn) minus the 30-minute lunch deduction, unless an
   * approved lunch exception exists for this employee+date. Called after
   * clock-out, after a manual correction, and after a lunch exception is
   * approved (which can happen after the fact).
   */
  async recomputeWorkedMinutes(employeeId: number, date: string) {
    const [record] = await db
      .select()
      .from(dailyTime)
      .where(and(eq(dailyTime.employeeId, employeeId), eq(dailyTime.date, date)))
      .limit(1);
    if (!record) return null;
    if (!record.clockIn || !record.clockOut) return record;

    const [exception] = await db
      .select({ approved: lunchExceptions.approved })
      .from(lunchExceptions)
      .where(and(eq(lunchExceptions.employeeId, employeeId), eq(lunchExceptions.date, date)))
      .limit(1);
    const lunchExempt = exception?.approved === true;

    let minutes = Math.round((record.clockOut.getTime() - record.clockIn.getTime()) / 60_000);
    if (!lunchExempt) minutes -= LUNCH_MINUTES;
    minutes = Math.max(0, minutes);

    const [updated] = await db.update(dailyTime).set({ workedMinutes: minutes }).where(eq(dailyTime.id, record.id)).returning();
    await perDiemService.recalculateWeekContaining(employeeId, date);
    return updated;
  },

  async saveDaily(
    employeeId: number,
    date: string,
    entries: { costCodeId: number; hours: number; units?: number; notes?: string }[],
    actorId: number
  ) {
    if (await fraudService.isUnderInvestigation(employeeId, date)) {
      throw new HttpError(409, "This day is under investigation — cost-code hours cannot be allocated until it's resolved.");
    }

    const record = await getOrCreateDailyTime(employeeId, date, actorId);

    // Whole-day replace keeps the client simple: send the full entry list, we reconcile it.
    await db.delete(dailyEntries).where(eq(dailyEntries.dailyTimeId, record.id));

    if (entries.length > 0) {
      await db.insert(dailyEntries).values(
        entries.map((e) => ({
          dailyTimeId: record.id,
          costCodeId: e.costCodeId,
          minutes: Math.round(e.hours * 60),
          units: e.units ?? null,
          notes: e.notes ?? null,
        }))
      );
    }

    await db
      .update(dailyTime)
      .set({ updatedBy: actorId, updatedAt: new Date() })
      .where(eq(dailyTime.id, record.id));

    return this.getDaily(employeeId, date, date);
  },

  /** Corrects the official clock-in/out record for a day. Does not touch the underlying clock_events punch log. */
  async correctDaily(
    dailyTimeId: number,
    patch: { clockIn?: string | null; clockOut?: string | null },
    editedBy: number,
    reason?: string
  ) {
    const [record] = await db.select().from(dailyTime).where(eq(dailyTime.id, dailyTimeId)).limit(1);
    if (!record) throw new HttpError(404, "Daily time record not found");

    // Rounded the same way a live punch would be, so a manual correction stays
    // consistent with the nearest-15-minute rule instead of allowing an
    // arbitrary override.
    const roundedClockIn = patch.clockIn ? roundToNearest15(new Date(patch.clockIn)) : null;
    const roundedClockOut = patch.clockOut ? roundToNearest15(new Date(patch.clockOut)) : null;

    if ("clockIn" in patch) {
      await logEdit(
        record.employeeId,
        record.date,
        "clockIn",
        record.clockIn?.toISOString() ?? null,
        roundedClockIn?.toISOString() ?? null,
        editedBy,
        reason
      );
    }
    if ("clockOut" in patch) {
      await logEdit(
        record.employeeId,
        record.date,
        "clockOut",
        record.clockOut?.toISOString() ?? null,
        roundedClockOut?.toISOString() ?? null,
        editedBy,
        reason
      );
    }

    const dbPatch: Record<string, unknown> = { updatedBy: editedBy, updatedAt: new Date() };
    if ("clockIn" in patch) dbPatch.clockIn = roundedClockIn;
    if ("clockOut" in patch) dbPatch.clockOut = roundedClockOut;

    await db.update(dailyTime).set(dbPatch).where(eq(dailyTime.id, dailyTimeId));

    await fraudService.evaluateDaily(record.employeeId, record.date);
    return this.recomputeWorkedMinutes(record.employeeId, record.date);
  },

  async updateEntry(
    id: number,
    data: Partial<{ costCodeId: number; hours: number; units: number; notes: string }>,
    editedBy: number,
    reason?: string
  ) {
    const [existing] = await db
      .select({ entry: dailyEntries, employeeId: dailyTime.employeeId, date: dailyTime.date })
      .from(dailyEntries)
      .innerJoin(dailyTime, eq(dailyEntries.dailyTimeId, dailyTime.id))
      .where(eq(dailyEntries.id, id))
      .limit(1);
    if (!existing) throw new HttpError(404, "Entry not found");
    if (await fraudService.isUnderInvestigation(existing.employeeId, existing.date)) {
      throw new HttpError(409, "This day is under investigation — cost-code hours cannot be edited until it's resolved.");
    }

    const patch: Record<string, unknown> = {};
    if (data.costCodeId !== undefined) patch.costCodeId = data.costCodeId;
    if (data.hours !== undefined) patch.minutes = Math.round(data.hours * 60);
    if (data.units !== undefined) patch.units = data.units;
    if (data.notes !== undefined) patch.notes = data.notes;

    if (data.costCodeId !== undefined) {
      await logEdit(existing.employeeId, existing.date, "entry.costCodeId", existing.entry.costCodeId, data.costCodeId, editedBy, reason);
    }
    if (data.hours !== undefined) {
      await logEdit(existing.employeeId, existing.date, "entry.hours", existing.entry.minutes / 60, data.hours, editedBy, reason);
    }
    if (data.units !== undefined) {
      await logEdit(existing.employeeId, existing.date, "entry.units", existing.entry.units, data.units, editedBy, reason);
    }
    if (data.notes !== undefined) {
      await logEdit(existing.employeeId, existing.date, "entry.notes", existing.entry.notes, data.notes, editedBy, reason);
    }

    const [updated] = await db.update(dailyEntries).set(patch).where(eq(dailyEntries.id, id)).returning();
    await fraudService.evaluateDaily(existing.employeeId, existing.date);
    return updated;
  },

  async deleteEntry(id: number, editedBy: number, reason?: string) {
    const [existing] = await db
      .select({ entry: dailyEntries, employeeId: dailyTime.employeeId, date: dailyTime.date })
      .from(dailyEntries)
      .innerJoin(dailyTime, eq(dailyEntries.dailyTimeId, dailyTime.id))
      .where(eq(dailyEntries.id, id))
      .limit(1);
    if (!existing) throw new HttpError(404, "Entry not found");
    if (await fraudService.isUnderInvestigation(existing.employeeId, existing.date)) {
      throw new HttpError(409, "This day is under investigation — cost-code hours cannot be edited until it's resolved.");
    }

    await logEdit(
      existing.employeeId,
      existing.date,
      "entry.removed",
      `costCodeId ${existing.entry.costCodeId}, ${existing.entry.minutes / 60}h`,
      null,
      editedBy,
      reason
    );

    await db.delete(dailyEntries).where(eq(dailyEntries.id, id));
    await fraudService.evaluateDaily(existing.employeeId, existing.date);
    return { deleted: true };
  },

  async getEditLog(employeeId: number, start?: string, end?: string) {
    return db.query.timeEditLog.findMany({
      where: (t, { and, eq, gte, lte }) =>
        and(eq(t.employeeId, employeeId), start ? gte(t.date, start) : undefined, end ? lte(t.date, end) : undefined),
      with: { editor: { columns: { id: true, name: true } } },
      orderBy: (t, { desc }) => [desc(t.editedAt)],
    });
  },

  async getDaily(employeeId: number, start: string, end: string) {
    const rows = await db.query.dailyTime.findMany({
      where: (dt, { and, eq, gte, lte }) =>
        and(eq(dt.employeeId, employeeId), gte(dt.date, start), lte(dt.date, end)),
      with: {
        entries: { with: { costCode: true } },
        clockEvents: { orderBy: (ce, { asc }) => [asc(ce.id)] },
      },
      orderBy: (dt, { asc }) => [asc(dt.date)],
    });

    const investigatedDates = await db
      .select({ date: fraudFlags.date })
      .from(fraudFlags)
      .where(
        and(
          eq(fraudFlags.employeeId, employeeId),
          gte(fraudFlags.date, start),
          lte(fraudFlags.date, end),
          eq(fraudFlags.underInvestigation, true),
          eq(fraudFlags.resolved, false)
        )
      );
    const investigatedSet = new Set(investigatedDates.map((d) => d.date));

    return rows.map((r) => ({
      ...r,
      entries: r.entries.map((e) => ({ ...e, hours: e.minutes / 60 })),
      underInvestigation: investigatedSet.has(r.date),
    }));
  },

  /**
   * Clock-in/out punches worth showing on the Map page — RULE: a punch inside
   * its project's geofence is just logged (clockEvents.lat/lng), nothing more.
   * Only punches tied to an open geo_mismatch flag (possible fraud) surface
   * here, so the map is a review queue, not a general location tracker.
   * Project-scoped like reports: admin sees everything (optionally narrowed
   * to one project), everyone else is confined to their own project. Scoped
   * by dailyTime's own snapshotted projectId (see db/schema.ts), not the
   * employee's current one, so a punch stays under the project it actually
   * happened at even after the employee is later reassigned.
   */
  async getLocations(start: string, end: string, authUser: AuthUser, projectId?: number) {
    const conditions = [gte(dailyTime.date, start), lte(dailyTime.date, end), isNotNull(clockEvents.lat), isNotNull(clockEvents.lng)];

    if (authUser.role === "admin") {
      if (projectId !== undefined) conditions.push(eq(dailyTime.projectId, projectId));
    } else {
      conditions.push(eq(dailyTime.projectId, authUser.projectId ?? -1));
    }

    const rows = await db
      .select({
        id: clockEvents.id,
        type: clockEvents.type,
        timestamp: clockEvents.timestamp,
        date: dailyTime.date,
        lat: clockEvents.lat,
        lng: clockEvents.lng,
        employeeId: users.id,
        employeeName: users.name,
      })
      .from(clockEvents)
      .innerJoin(dailyTime, eq(clockEvents.dailyTimeId, dailyTime.id))
      .innerJoin(users, eq(dailyTime.employeeId, users.id))
      .where(and(...conditions))
      .orderBy(desc(clockEvents.timestamp));

    const openFlags = await db
      .select({ employeeId: fraudFlags.employeeId, date: fraudFlags.date })
      .from(fraudFlags)
      .where(and(eq(fraudFlags.type, "geo_mismatch"), eq(fraudFlags.resolved, false)));
    const flaggedKeys = new Set(openFlags.map((f) => `${f.employeeId}:${f.date}`));

    return rows.filter((r) => flaggedKeys.has(`${r.employeeId}:${r.date}`));
  },
};
