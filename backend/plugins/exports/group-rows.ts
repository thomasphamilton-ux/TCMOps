import type { ExportRow } from "../reports/service";

export function groupByTeamAndEmployee(rows: ExportRow[]) {
  const teams = new Map<string, Map<number, { employee: string; rows: ExportRow[] }>>();
  for (const row of rows) {
    if (!teams.has(row.team)) teams.set(row.team, new Map());
    const employees = teams.get(row.team)!;
    if (!employees.has(row.employeeId)) employees.set(row.employeeId, { employee: row.employee, rows: [] });
    employees.get(row.employeeId)!.rows.push(row);
  }
  return teams;
}

/** Per-diem is repeated on every cost-code row of the same day, so only count it once per date. */
export function sumRows(rows: ExportRow[]) {
  let hours = 0;
  let units = 0;
  let perDiemCents = 0;
  const seenDates = new Set<string>();
  for (const r of rows) {
    hours += r.hours;
    units += r.units;
    if (!seenDates.has(r.date)) {
      seenDates.add(r.date);
      perDiemCents += r.perDiemCents;
    }
  }
  return { hours, units, perDiemCents };
}
