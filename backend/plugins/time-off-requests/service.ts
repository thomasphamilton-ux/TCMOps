import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { timeOffRequests, users } from "../../db/schema";
import type { TimeOffType, AttendanceStatus } from "../../db/schema";
import { attendanceService } from "../attendance/service";
import { HttpError } from "../../lib/http-error";
import type { AuthUser } from "../../lib/auth";

// The base turnaround entitlement (see requiresManagerApproval below) — a
// company policy constant, not derived from anything else in the schema.
const TURNAROUND_BASE_DAYS = 4;

// Pure calendar-date walk (no timezone involved — these are date-only values
// end to end, so UTC day boundaries are safe and avoid local-server-timezone
// off-by-one issues).
function eachDateInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  let cur = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cur <= last) {
    dates.push(cur.toISOString().slice(0, 10));
    cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
  }
  return dates;
}

function includesSaturdayAndSunday(start: string, end: string): boolean {
  const days = eachDateInRange(start, end).map((d) => new Date(`${d}T00:00:00Z`).getUTCDay());
  return days.includes(6) && days.includes(0);
}

// A turnaround longer than the base entitlement needs a manager's sign-off
// in addition to foreman/supervisor — see backend/db/schema.ts's
// managerApprovedBy comment and the plain-English rule this encodes: "any
// additional days off in conjunction with a turnaround must also be
// approved by a manager level employee."
function requiresManagerApproval(type: TimeOffType, startDate: string, endDate: string): boolean {
  return type === "turnaround" && eachDateInRange(startDate, endDate).length > TURNAROUND_BASE_DAYS;
}

// API responses expose hoursPerDay (the request/response unit); minutesPerDay
// stays the DB source of truth, same convention as costCodes' budgetHours.
function withHours<T extends { minutesPerDay: number }>(row: T) {
  const { minutesPerDay, ...rest } = row;
  return { ...rest, hoursPerDay: minutesPerDay / 60 };
}

// Writes an attendance record for every date in range so per-diem
// eligibility and the daily-submission coverage gate treat these days as
// accounted for (see backend/plugins/attendance and backend/plugins/per-diem
// — neither has any other way to learn about a day off besides an
// attendanceRecords row). This is also what makes "per diem paid during
// turnaround" true: attendanceRecords.set() triggers a per-diem recalc, and
// any status other than "unexcused" — turnaround included — already counts
// as excused there (see per-diem/service.ts's calculateWeek).
async function finalizeApproval(request: typeof timeOffRequests.$inferSelect, approvedBy: number) {
  const note = `Time off request #${request.id} (${request.type})${request.notes ? `: ${request.notes}` : ""}`;
  for (const date of eachDateInRange(request.startDate, request.endDate)) {
    await attendanceService.set(request.employeeId, date, request.type as AttendanceStatus, note, approvedBy);
  }
}

export const timeOffRequestsService = {
  async create(
    employeeId: number,
    data: { startDate: string; endDate: string; hoursPerDay: number; type: TimeOffType; notes?: string }
  ) {
    if (data.endDate < data.startDate) throw new HttpError(400, "End date can't be before start date");

    if (data.type === "turnaround") {
      const days = eachDateInRange(data.startDate, data.endDate).length;
      if (days < TURNAROUND_BASE_DAYS) {
        throw new HttpError(400, `Turnaround requests must be at least ${TURNAROUND_BASE_DAYS} days`);
      }
      if (!includesSaturdayAndSunday(data.startDate, data.endDate)) {
        throw new HttpError(400, "Turnaround requests must include a Saturday and a Sunday");
      }
    }

    const [employee] = await db
      .select({ projectId: users.projectId, teamId: users.teamId })
      .from(users)
      .where(eq(users.id, employeeId))
      .limit(1);

    const [created] = await db
      .insert(timeOffRequests)
      .values({
        employeeId,
        projectId: employee?.projectId ?? null,
        teamId: employee?.teamId ?? null,
        startDate: data.startDate,
        endDate: data.endDate,
        minutesPerDay: Math.round(data.hoursPerDay * 60),
        type: data.type,
        notes: data.notes || null,
      })
      .returning();
    return withHours(created);
  },

  // Same scoping shape as pay-inquiries: employee sees only their own,
  // foreman their team's, supervisor/manager their project's, admin all.
  async list(authUser: AuthUser, status?: string, projectId?: number) {
    const conditions = [];
    if (status !== undefined) conditions.push(eq(timeOffRequests.status, status as any));

    if (authUser.role === "admin") {
      if (projectId !== undefined) conditions.push(eq(timeOffRequests.projectId, projectId));
    } else if (authUser.role === "manager" || authUser.role === "supervisor") {
      conditions.push(eq(timeOffRequests.projectId, authUser.projectId ?? -1));
    } else if (authUser.role === "foreman") {
      conditions.push(eq(timeOffRequests.teamId, authUser.teamId ?? -1));
    } else {
      conditions.push(eq(timeOffRequests.employeeId, authUser.id));
    }

    const rows = await db
      .select()
      .from(timeOffRequests)
      .where(conditions.length ? and(...conditions) : undefined);
    return rows.map(withHours);
  },

  async getById(id: number) {
    const [row] = await db.select().from(timeOffRequests).where(eq(timeOffRequests.id, id)).limit(1);
    return row ?? null;
  },

  // Not `this.getById` — this is passed as a bare function reference to
  // requireProjectScopedRecord, which would lose its `this` binding.
  async getEmployeeId(id: number): Promise<number | null> {
    const [row] = await db.select({ employeeId: timeOffRequests.employeeId }).from(timeOffRequests).where(eq(timeOffRequests.id, id)).limit(1);
    return row?.employeeId ?? null;
  },

  async foremanApprove(id: number, approvedBy: number, signature: string) {
    const existing = await this.getById(id);
    if (!existing) throw new HttpError(404, "Time off request not found");
    if (existing.status !== "pending_foreman") {
      throw new HttpError(409, `Request is not awaiting foreman approval (currently ${existing.status})`);
    }
    const [updated] = await db
      .update(timeOffRequests)
      .set({
        foremanApprovedBy: approvedBy,
        foremanApprovedAt: new Date(),
        foremanSignature: signature,
        status: "pending_supervisor",
      })
      .where(eq(timeOffRequests.id, id))
      .returning();
    return withHours(updated);
  },

  // Finalizes to "approved" immediately, unless this is a turnaround request
  // that exceeds the base entitlement — those route to a manager for a third
  // sign-off instead (see requiresManagerApproval above).
  async supervisorApprove(id: number, approvedBy: number, signature: string) {
    const existing = await this.getById(id);
    if (!existing) throw new HttpError(404, "Time off request not found");
    if (existing.status !== "pending_supervisor") {
      throw new HttpError(409, `Request is not awaiting supervisor approval (currently ${existing.status})`);
    }

    const needsManager = requiresManagerApproval(existing.type as TimeOffType, existing.startDate, existing.endDate);
    const [updated] = await db
      .update(timeOffRequests)
      .set({
        supervisorApprovedBy: approvedBy,
        supervisorApprovedAt: new Date(),
        supervisorSignature: signature,
        status: needsManager ? "pending_manager" : "approved",
      })
      .where(eq(timeOffRequests.id, id))
      .returning();

    if (!needsManager) await finalizeApproval(updated, approvedBy);

    return withHours(updated);
  },

  // Only reachable when the request is sitting in pending_manager — see
  // supervisorApprove above.
  async managerApprove(id: number, approvedBy: number, signature: string) {
    const existing = await this.getById(id);
    if (!existing) throw new HttpError(404, "Time off request not found");
    if (existing.status !== "pending_manager") {
      throw new HttpError(409, `Request is not awaiting manager approval (currently ${existing.status})`);
    }
    const [updated] = await db
      .update(timeOffRequests)
      .set({
        managerApprovedBy: approvedBy,
        managerApprovedAt: new Date(),
        managerSignature: signature,
        status: "approved",
      })
      .where(eq(timeOffRequests.id, id))
      .returning();

    await finalizeApproval(updated, approvedBy);

    return withHours(updated);
  },

  async deny(id: number, deniedBy: number, reason: string) {
    const existing = await this.getById(id);
    if (!existing) throw new HttpError(404, "Time off request not found");
    if (existing.status === "approved" || existing.status === "denied") {
      throw new HttpError(409, `Request is already ${existing.status}`);
    }
    const [updated] = await db
      .update(timeOffRequests)
      .set({ status: "denied", deniedBy, deniedAt: new Date(), denialReason: reason })
      .where(eq(timeOffRequests.id, id))
      .returning();
    return withHours(updated);
  },

  async markSentToPayroll(id: number) {
    await db
      .update(timeOffRequests)
      .set({ sentToPayrollAt: new Date() })
      .where(and(eq(timeOffRequests.id, id), isNull(timeOffRequests.sentToPayrollAt)));
  },
};
