import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../../db";
import { perDiem, users } from "../../db/schema";
import type { AuthUser } from "../../lib/auth";

/**
 * Returns the employee ids to scope a report to, or null for "no filter"
 * (admin viewing all projects at once). Non-admin roles are always confined
 * to their own project regardless of what's requested. Admin may optionally
 * pass `projectId` to narrow the (otherwise global) view to one project.
 */
async function projectEmployeeIds(authUser: AuthUser, projectId?: number): Promise<number[] | null> {
  if (authUser.role === "admin") {
    if (projectId === undefined) return null;
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.projectId, projectId));
    return rows.map((r) => r.id);
  }
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.projectId, authUser.projectId ?? -1));
  return rows.map((r) => r.id);
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

async function rollup(start: string, end: string, employeeIds: number[] | null) {
  if (employeeIds !== null && employeeIds.length === 0) return { start, end, teams: [] };

  const days = await db.query.dailyTime.findMany({
    where: (dt, { and, gte, lte, inArray: inArr }) =>
      and(gte(dt.date, start), lte(dt.date, end), employeeIds ? inArr(dt.employeeId, employeeIds) : undefined),
    with: { entries: true, employee: { with: { team: true } } },
  });

  const perDiemRows = await db
    .select()
    .from(perDiem)
    .where(
      and(
        gte(perDiem.date, start),
        lte(perDiem.date, end),
        eq(perDiem.eligible, true),
        employeeIds ? inArray(perDiem.employeeId, employeeIds) : undefined
      )
    );

  const teamByEmployee = new Map<number, string>();
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
    const teamName = day.employee?.team?.name ?? "Unassigned";
    teamByEmployee.set(day.employeeId, teamName);
    const totals = getTotals(teamName);
    for (const entry of day.entries) {
      totals.hours += entry.minutes / 60;
      totals.units += entry.units ?? 0;
    }
  }

  for (const row of perDiemRows) {
    const teamName = teamByEmployee.get(row.employeeId) ?? "Unassigned";
    getTotals(teamName).perDiemCents += row.amount;
  }

  return { start, end, teams: Array.from(grouped.values()) };
}

/**
 * Flat, export-ready rows: one per (employee, date, cost code), sorted by
 * team then employee then date, with that day's per-diem repeated on each
 * of its rows. A time clerk can drop this straight into a pivot table.
 */
async function detailRows(start: string, end: string, employeeIds: number[] | null): Promise<ExportRow[]> {
  if (employeeIds !== null && employeeIds.length === 0) return [];

  const days = await db.query.dailyTime.findMany({
    where: (dt, { and, gte, lte, inArray: inArr }) =>
      and(gte(dt.date, start), lte(dt.date, end), employeeIds ? inArr(dt.employeeId, employeeIds) : undefined),
    with: { entries: { with: { costCode: true } }, employee: { with: { team: true } } },
    orderBy: (dt, { asc }) => [asc(dt.date)],
  });

  const perDiemRows = await db
    .select()
    .from(perDiem)
    .where(
      and(gte(perDiem.date, start), lte(perDiem.date, end), employeeIds ? inArray(perDiem.employeeId, employeeIds) : undefined)
    );
  const perDiemByEmployeeDate = new Map(perDiemRows.map((p) => [`${p.employeeId}:${p.date}`, p]));

  const rows: ExportRow[] = [];
  for (const day of days) {
    const teamName = day.employee?.team?.name ?? "Unassigned";
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

export const reportsService = {
  async daily(date: string, authUser: AuthUser, projectId?: number) {
    return rollup(date, date, await projectEmployeeIds(authUser, projectId));
  },

  async weekly(start: string, end: string, authUser: AuthUser, projectId?: number) {
    return rollup(start, end, await projectEmployeeIds(authUser, projectId));
  },

  async detailRows(start: string, end: string, authUser: AuthUser, projectId?: number) {
    return detailRows(start, end, await projectEmployeeIds(authUser, projectId));
  },
};
