import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { users, teams, attendanceRecords, dailySubmissions } from "../../db/schema";
import type { AuthUser } from "../../lib/auth";
import { HttpError } from "../../lib/http-error";

export interface CoverageIssue {
  employeeId: number;
  employeeName: string;
  issue: "not_clocked_out" | "uncoded_hours" | "missing_attendance";
  detail: string;
}

async function getTeamProjectId(teamId: number): Promise<number | null> {
  const [row] = await db.select({ projectId: teams.projectId }).from(teams).where(eq(teams.id, teamId)).limit(1);
  return row?.projectId ?? null;
}

/** Foreman: only their own team. Manager/supervisor: any team in their project. Admin: any team. */
async function assertCanActOnTeam(authUser: AuthUser, teamId: number) {
  if (authUser.role === "admin") return;
  if (authUser.role === "foreman") {
    if (authUser.teamId === teamId) return;
    throw new HttpError(403, "Forbidden");
  }
  if (authUser.role === "manager" || authUser.role === "supervisor") {
    const projectId = await getTeamProjectId(teamId);
    if (authUser.projectId !== null && authUser.projectId === projectId) return;
    throw new HttpError(403, "Forbidden");
  }
  throw new HttpError(403, "Forbidden");
}

export const dailySubmissionsService = {
  assertCanActOnTeam,

  /**
   * Per active team member: flag anyone still clocked in (day isn't over
   * yet), anyone whose cost-coded hours don't cover what they worked, or
   * anyone with no clock time at all and no attendance/exemption code for
   * the day. Used both as a submission gate and as a standalone preview.
   */
  async getCoverageIssues(teamId: number, date: string): Promise<CoverageIssue[]> {
    const members = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.teamId, teamId), eq(users.active, true)));
    if (members.length === 0) return [];
    const memberIds = members.map((m) => m.id);

    const dailyRows = await db.query.dailyTime.findMany({
      where: (dt, { and: andCol, eq: eqCol, inArray: inArr }) => andCol(eqCol(dt.date, date), inArr(dt.employeeId, memberIds)),
      with: { entries: true },
    });
    const dailyByEmployee = new Map(dailyRows.map((d) => [d.employeeId, d]));

    const attendanceRows = await db
      .select({ employeeId: attendanceRecords.employeeId })
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.date, date), inArray(attendanceRecords.employeeId, memberIds)));
    const attendedIds = new Set(attendanceRows.map((a) => a.employeeId));

    const issues: CoverageIssue[] = [];
    for (const member of members) {
      const day = dailyByEmployee.get(member.id);

      if (!day) {
        if (!attendedIds.has(member.id)) {
          issues.push({
            employeeId: member.id,
            employeeName: member.name,
            issue: "missing_attendance",
            detail: "No clock time and no attendance/exemption code recorded.",
          });
        }
        continue;
      }

      if (!day.clockOut) {
        issues.push({
          employeeId: member.id,
          employeeName: member.name,
          issue: "not_clocked_out",
          detail: "Still clocked in — no clock-out recorded yet.",
        });
        continue;
      }

      const codedMinutes = day.entries.reduce((sum, e) => sum + e.minutes, 0);
      const workedMinutes = day.workedMinutes ?? 0;
      if (codedMinutes < workedMinutes) {
        issues.push({
          employeeId: member.id,
          employeeName: member.name,
          issue: "uncoded_hours",
          detail: `Worked ${(workedMinutes / 60).toFixed(2)}h, only ${(codedMinutes / 60).toFixed(2)}h coded to cost codes.`,
        });
      }
    }

    return issues;
  },

  async submit(teamId: number, date: string, authUser: AuthUser) {
    await assertCanActOnTeam(authUser, teamId);

    const issues = await this.getCoverageIssues(teamId, date);
    if (issues.length > 0) {
      throw new HttpError(
        409,
        `Cannot submit — ${issues.length} team member(s) have uncovered hours or a missing attendance code.`
      );
    }

    const [saved] = await db
      .insert(dailySubmissions)
      .values({ teamId, date, submittedBy: authUser.id })
      .onConflictDoUpdate({
        target: [dailySubmissions.teamId, dailySubmissions.date],
        set: { submittedBy: authUser.id, submittedAt: new Date(), approvedBy: null, approvedAt: null },
      })
      .returning();
    return saved;
  },

  async approve(id: number, authUser: AuthUser) {
    const [existing] = await db.select().from(dailySubmissions).where(eq(dailySubmissions.id, id)).limit(1);
    if (!existing) throw new HttpError(404, "Submission not found");
    await assertCanActOnTeam(authUser, existing.teamId);

    const [updated] = await db
      .update(dailySubmissions)
      .set({ approvedBy: authUser.id, approvedAt: new Date() })
      .where(eq(dailySubmissions.id, id))
      .returning();
    return updated;
  },

  async getStatus(teamId: number, date: string, authUser: AuthUser) {
    await assertCanActOnTeam(authUser, teamId);
    const [row] = await db
      .select()
      .from(dailySubmissions)
      .where(and(eq(dailySubmissions.teamId, teamId), eq(dailySubmissions.date, date)))
      .limit(1);
    return row ?? null;
  },

  async listPending(authUser: AuthUser, projectId?: number) {
    if (authUser.role === "admin") {
      const rows =
        projectId === undefined
          ? await db
              .select({ submission: dailySubmissions, teamName: teams.name })
              .from(dailySubmissions)
              .innerJoin(teams, eq(dailySubmissions.teamId, teams.id))
          : await db
              .select({ submission: dailySubmissions, teamName: teams.name })
              .from(dailySubmissions)
              .innerJoin(teams, eq(dailySubmissions.teamId, teams.id))
              .where(eq(teams.projectId, projectId));
      return rows.filter((r) => r.submission.approvedAt === null).map((r) => ({ ...r.submission, teamName: r.teamName }));
    }

    const rows = await db
      .select({ submission: dailySubmissions, teamName: teams.name })
      .from(dailySubmissions)
      .innerJoin(teams, eq(dailySubmissions.teamId, teams.id))
      .where(eq(teams.projectId, authUser.projectId ?? -1));
    return rows.filter((r) => r.submission.approvedAt === null).map((r) => ({ ...r.submission, teamName: r.teamName }));
  },
};
