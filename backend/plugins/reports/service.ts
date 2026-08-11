import { and, eq, gte, isNotNull, isNull, lte } from "drizzle-orm";
import { db } from "../../db";
import { dailyTime, perDiem, projects, users } from "../../db/schema";
import type { AuthUser } from "../../lib/auth";

/**
 * Returns the projectId to scope a report to, or undefined for "no filter"
 * (admin viewing every project at once). Non-admin roles are always confined
 * to their own project regardless of what's requested. Admin may optionally
 * pass `projectId` to narrow the (otherwise global) view to one project.
 *
 * This scopes dailyTime/perDiem rows by their own *snapshotted* projectId
 * (see the comment on dailyTime.projectId in db/schema.ts) — never by the
 * employee's current projectId. Scoping via the employee's live record would
 * mean moving someone to a new project silently rewrites which project's
 * reports their past work shows up under; scoping by the snapshot keeps a
 * project's history exactly as it was at the time, for audit purposes.
 */
function projectScope(authUser: AuthUser, projectId?: number): number | undefined {
  if (authUser.role === "admin") return projectId;
  return authUser.projectId ?? -1;
}

interface TeamTotals {
  team: string;
  hours: number;
  units: number;
  perDiemCents: number;
}

export interface ExportRow {
  team: string;
  employeeId: number;
  employee: string;
  date: string;
  costCode: string;
  description: string;
  hours: number;
  units: number;
  perDiemCents: number;
}

async function rollup(start: string, end: string, scopeProjectId: number | undefined) {
  // Denied days are excluded from every total here — the underlying entries
  // stay on the record (see EmployeeDetail's Daily Log) but don't count
  // toward reports, dashboard, or exports.
  const days = await db.query.dailyTime.findMany({
    where: (dt, { and, eq: eqCol, gte, lte }) =>
      and(
        gte(dt.date, start),
        lte(dt.date, end),
        eqCol(dt.denied, false),
        scopeProjectId !== undefined ? eqCol(dt.projectId, scopeProjectId) : undefined
      ),
    with: { entries: true, team: true },
  });

  const perDiemRows = await db.query.perDiem.findMany({
    where: (p, { and, eq: eqCol, gte, lte }) =>
      and(
        gte(p.date, start),
        lte(p.date, end),
        eqCol(p.eligible, true),
        scopeProjectId !== undefined ? eqCol(p.projectId, scopeProjectId) : undefined
      ),
    with: { team: true },
  });

  const grouped = new Map<string, TeamTotals>();

  const getTotals = (teamName: string) => {
    let totals = grouped.get(teamName);
    if (!totals) {
      totals = { team: teamName, hours: 0, units: 0, perDiemCents: 0 };
      grouped.set(teamName, totals);
    }
    return totals;
  };

  for (const day of days) {
    const teamName = day.team?.name ?? "Unassigned";
    const totals = getTotals(teamName);
    for (const entry of day.entries) {
      totals.hours += entry.minutes / 60;
      totals.units += entry.units ?? 0;
    }
  }

  for (const row of perDiemRows) {
    const teamName = row.team?.name ?? "Unassigned";
    getTotals(teamName).perDiemCents += row.amount;
  }

  return { start, end, teams: Array.from(grouped.values()) };
}

/**
 * Flat, export-ready rows: one per (employee, date, cost code), sorted by
 * team then employee then date, with that day's per-diem repeated on each
 * of its rows. A time clerk can drop this straight into a pivot table.
 */
async function detailRows(start: string, end: string, scopeProjectId: number | undefined): Promise<ExportRow[]> {
  const days = await db.query.dailyTime.findMany({
    where: (dt, { and, eq: eqCol, gte, lte }) =>
      and(
        gte(dt.date, start),
        lte(dt.date, end),
        eqCol(dt.denied, false),
        scopeProjectId !== undefined ? eqCol(dt.projectId, scopeProjectId) : undefined
      ),
    with: { entries: { with: { costCode: true } }, employee: true, team: true },
    orderBy: (dt, { asc }) => [asc(dt.date)],
  });

  // Not filtered by scopeProjectId — every row below is only ever looked up
  // by an (employeeId, date) pair that's already in `days`, which is the
  // project-scoped set. Re-filtering here on perDiem's own snapshot risks
  // missing a match if its snapshot timing ever drifts a beat from
  // dailyTime's (e.g. a project move landing between the two), so simplest
  // and safest is to just fetch by date range and let the lookup do the work.
  const perDiemRows = await db.select().from(perDiem).where(and(gte(perDiem.date, start), lte(perDiem.date, end)));
  const perDiemByEmployeeDate = new Map(perDiemRows.map((p) => [`${p.employeeId}:${p.date}`, p]));

  const rows: ExportRow[] = [];
  for (const day of days) {
    const teamName = day.team?.name ?? "Unassigned";
    const employeeName = day.employee?.name ?? `Employee #${day.employeeId}`;
    const perDiemCents = perDiemByEmployeeDate.get(`${day.employeeId}:${day.date}`)?.eligible
      ? perDiemByEmployeeDate.get(`${day.employeeId}:${day.date}`)!.amount
      : 0;

    if (day.entries.length === 0) {
      if (perDiemCents === 0) continue;
      rows.push({
        team: teamName,
        employeeId: day.employeeId,
        employee: employeeName,
        date: day.date,
        costCode: "—",
        description: "(no cost code entries)",
        hours: 0,
        units: 0,
        perDiemCents,
      });
      continue;
    }

    for (const entry of day.entries) {
      rows.push({
        team: teamName,
        employeeId: day.employeeId,
        employee: employeeName,
        date: day.date,
        costCode: entry.costCode.code,
        description: entry.costCode.description,
        hours: entry.minutes / 60,
        units: entry.units ?? 0,
        perDiemCents,
      });
    }
  }

  rows.sort((a, b) =>
    a.team !== b.team
      ? a.team.localeCompare(b.team)
      : a.employee !== b.employee
        ? a.employee.localeCompare(b.employee)
        : a.date.localeCompare(b.date)
  );

  return rows;
}

interface RosterTeamSummary {
  team: string;
  registered: number;
  clockedIn: number;
}

interface RosterProjectSummary {
  projectId: number;
  projectName: string;
  registered: number;
  clockedIn: number;
  teams: RosterTeamSummary[];
}

// Live snapshot, not date-ranged like the rollups above — always "right now",
// one row per job the caller can see (every project for admin, just their
// own for everyone else), each expandable to a per-team breakdown.
async function rosterSummary(authUser: AuthUser): Promise<RosterProjectSummary[]> {
  const visibleProjects =
    authUser.role === "admin"
      ? await db.select({ id: projects.id, name: projects.name }).from(projects)
      : authUser.projectId !== null
        ? await db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.id, authUser.projectId))
        : [];
  if (visibleProjects.length === 0) return [];

  const projectIds = visibleProjects.map((p) => p.id);
  // Archived accounts are excluded — they're not part of the active roster.
  const roster = await db.query.users.findMany({
    where: (u, { and: andCol, eq: eqCol, inArray: inArr }) =>
      andCol(inArr(u.projectId, projectIds), eqCol(u.archived, false)),
    with: { team: true },
  });

  const today = new Date().toISOString().slice(0, 10);
  const clockedInRows = await db
    .select({ employeeId: dailyTime.employeeId })
    .from(dailyTime)
    .where(and(eq(dailyTime.date, today), isNotNull(dailyTime.clockIn), isNull(dailyTime.clockOut)));
  const clockedInIds = new Set(clockedInRows.map((r) => r.employeeId));

  const summaries = new Map<number, RosterProjectSummary>(
    visibleProjects.map((p) => [p.id, { projectId: p.id, projectName: p.name, registered: 0, clockedIn: 0, teams: [] }])
  );
  const teamsByProject = new Map<number, Map<string, RosterTeamSummary>>();

  for (const person of roster) {
    if (person.projectId === null) continue;
    const summary = summaries.get(person.projectId);
    if (!summary) continue;
    const clockedIn = clockedInIds.has(person.id);

    summary.registered += 1;
    if (clockedIn) summary.clockedIn += 1;

    const teamName = person.team?.name ?? "Unassigned";
    if (!teamsByProject.has(person.projectId)) teamsByProject.set(person.projectId, new Map());
    const teamMap = teamsByProject.get(person.projectId)!;
    const teamSummary = teamMap.get(teamName) ?? { team: teamName, registered: 0, clockedIn: 0 };
    teamSummary.registered += 1;
    if (clockedIn) teamSummary.clockedIn += 1;
    teamMap.set(teamName, teamSummary);
  }

  for (const [projectId, teamMap] of teamsByProject) {
    summaries.get(projectId)!.teams = Array.from(teamMap.values()).sort((a, b) => a.team.localeCompare(b.team));
  }

  return Array.from(summaries.values()).sort((a, b) => a.projectName.localeCompare(b.projectName));
}

export const reportsService = {
  async daily(date: string, authUser: AuthUser, projectId?: number) {
    return rollup(date, date, projectScope(authUser, projectId));
  },

  async weekly(start: string, end: string, authUser: AuthUser, projectId?: number) {
    return rollup(start, end, projectScope(authUser, projectId));
  },

  async detailRows(start: string, end: string, authUser: AuthUser, projectId?: number) {
    return detailRows(start, end, projectScope(authUser, projectId));
  },

  async rosterSummary(authUser: AuthUser) {
    return rosterSummary(authUser);
  },
};
