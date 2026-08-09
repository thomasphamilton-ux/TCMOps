import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { ExportRow } from "../reports/service";
import { groupByTeamAndEmployee, sumRows } from "./group-rows";

export function pdfBuilder(type: string, start: string, end: string, rows: ExportRow[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const filename = `${type}-${start}-to-${end}-${Date.now()}.pdf`;
    const filePath = path.join(__dirname, "../../uploads/exports", filename);
    const doc = new PDFDocument({ margin: 40 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.fontSize(18).text(`TCM ${type} report`, { align: "center" });
    doc.fontSize(11).text(`${start} - ${end}`, { align: "center" });
    doc.moveDown(1.5);

    const teams = groupByTeamAndEmployee(rows);

    for (const [teamName, employees] of teams) {
      doc.fontSize(15).text(teamName, { underline: true });
      doc.moveDown(0.3);

      let teamHours = 0;
      let teamPerDiemCents = 0;

      for (const { employee, rows: empRows } of employees.values()) {
        doc.fontSize(12).text(employee, { indent: 10 });

        for (const r of empRows) {
          doc
            .fontSize(10)
            .text(`  ${r.date}  ${r.costCode}  ${r.description}  —  ${r.hours.toFixed(2)}h  ${r.units} units`, {
              indent: 20,
            });
        }

        const empTotals = sumRows(empRows);
        doc
          .fontSize(10)
          .text(`  Subtotal: ${empTotals.hours.toFixed(2)}h, $${(empTotals.perDiemCents / 100).toFixed(2)} per diem`, {
            indent: 20,
          });
        doc.moveDown(0.4);

        teamHours += empTotals.hours;
        teamPerDiemCents += empTotals.perDiemCents;
      }

      doc
        .fontSize(11)
        .text(`Team total: ${teamHours.toFixed(2)}h, $${(teamPerDiemCents / 100).toFixed(2)} per diem`, {
          indent: 10,
        });
      doc.moveDown(1);
    }

    if (teams.size === 0) {
      doc.fontSize(12).text("No time entries in this range.");
    }

    doc.end();
    stream.on("finish", () => resolve(`/files/exports/${filename}`));
    stream.on("error", reject);
  });
}
