import fs from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import type { ExportRow } from "../reports/service";
import { groupByTeamAndEmployee, sumRows } from "./group-rows";

export async function excelBuilder(type: string, start: string, end: string, rows: ExportRow[]): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Report");

  sheet.columns = [
    { header: "Team", key: "team", width: 20 },
    { header: "Employee", key: "employee", width: 22 },
    { header: "Date", key: "date", width: 14 },
    { header: "Cost Code", key: "costCode", width: 18 },
    { header: "Description", key: "description", width: 28 },
    { header: "Hours", key: "hours", width: 10 },
    { header: "Units", key: "units", width: 10 },
    { header: "Per Diem ($)", key: "perDiem", width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };

  const teams = groupByTeamAndEmployee(rows);

  for (const [teamName, employees] of teams) {
    let teamHours = 0;
    let teamUnits = 0;
    let teamPerDiemCents = 0;

    for (const { employee, rows: empRows } of employees.values()) {
      for (const r of empRows) {
        sheet.addRow({
          team: r.team,
          employee: r.employee,
          date: r.date,
          costCode: r.costCode,
          description: r.description,
          hours: Number(r.hours.toFixed(2)),
          units: r.units,
          perDiem: (r.perDiemCents / 100).toFixed(2),
        });
      }

      const empTotals = sumRows(empRows);
      sheet.addRow({
        employee: `${employee} Subtotal`,
        hours: Number(empTotals.hours.toFixed(2)),
        units: empTotals.units,
        perDiem: (empTotals.perDiemCents / 100).toFixed(2),
      }).font = { italic: true };

      // Accumulate from each employee's own totals — summing the raw rows
      // together first would re-run date dedup across different employees
      // and undercount per diem whenever their dates overlap.
      teamHours += empTotals.hours;
      teamUnits += empTotals.units;
      teamPerDiemCents += empTotals.perDiemCents;
    }

    const totalRow = sheet.addRow({
      team: `${teamName} Total`,
      hours: Number(teamHours.toFixed(2)),
      units: teamUnits,
      perDiem: (teamPerDiemCents / 100).toFixed(2),
    });
    totalRow.font = { bold: true };
    totalRow.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
    });

    sheet.addRow({});
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `${type}-${start}-to-${end}-${Date.now()}.xlsx`;
  await fs.writeFile(path.join(__dirname, "../../uploads/exports", filename), Buffer.from(buffer));
  return `/files/exports/${filename}`;
}
