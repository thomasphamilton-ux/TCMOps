import { eq } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { db } from "../../db";
import { users, projects, teams, timeOffRequests } from "../../db/schema";

type TimeOffRequestRow = typeof timeOffRequests.$inferSelect;

async function nameOf(userId: number | null): Promise<string> {
  if (userId === null) return "—";
  const [row] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.name ?? `User #${userId}`;
}

// Renders a signature data URL ("data:image/png;base64,...") into the
// document, or a plain "Not signed" line if one isn't present.
function drawSignature(doc: PDFKit.PDFDocument, label: string, name: string, at: Date | null, dataUrl: string | null) {
  doc.fontSize(11).text(label, { underline: true });
  doc.moveDown(0.2);
  if (dataUrl) {
    const base64 = dataUrl.split(",")[1] ?? dataUrl;
    const imageTop = doc.y;
    doc.image(Buffer.from(base64, "base64"), { width: 200, height: 60 });
    // pdfkit doesn't reliably auto-advance the cursor past an inline image,
    // so pin it explicitly — otherwise the next signature block can render
    // on top of (and visually swallow) this one.
    doc.y = imageTop + 60 + 5;
  } else {
    doc.fontSize(10).text("Not signed");
  }
  doc.fontSize(10).text(`${name}${at ? `  —  ${at.toISOString().slice(0, 19).replace("T", " ")} UTC` : ""}`);
  doc.moveDown(1);
}

export async function timeOffPdfBuilder(request: TimeOffRequestRow): Promise<Buffer> {
  const [employeeName, projectName, teamName, foremanName, supervisorName, managerName] = await Promise.all([
    nameOf(request.employeeId),
    request.projectId !== null
      ? db.select({ name: projects.name }).from(projects).where(eq(projects.id, request.projectId)).limit(1).then((r) => r[0]?.name ?? "—")
      : Promise.resolve("—"),
    request.teamId !== null
      ? db.select({ name: teams.name }).from(teams).where(eq(teams.id, request.teamId)).limit(1).then((r) => r[0]?.name ?? "—")
      : Promise.resolve("—"),
    nameOf(request.foremanApprovedBy),
    nameOf(request.supervisorApprovedBy),
    nameOf(request.managerApprovedBy),
  ]);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text("TCM Time Off Request", { align: "center" });
    doc.fontSize(11).text("Approved — for payroll processing", { align: "center" });
    doc.moveDown(1.5);

    doc.fontSize(12).text(`Employee: ${employeeName}`);
    doc.text(`Project: ${projectName}    Team: ${teamName}`);
    doc.moveDown(0.5);

    const hoursPerDay = request.minutesPerDay / 60;
    const days =
      (new Date(`${request.endDate}T00:00:00Z`).getTime() - new Date(`${request.startDate}T00:00:00Z`).getTime()) /
        (24 * 60 * 60 * 1000) +
      1;

    doc.text(`Dates: ${request.startDate} to ${request.endDate} (${days} day${days === 1 ? "" : "s"})`);
    doc.text(`Type: ${request.type}`);
    doc.text(`Hours per day: ${hoursPerDay.toFixed(2)}    Total hours: ${(hoursPerDay * days).toFixed(2)}`);
    if (request.notes) doc.text(`Notes: ${request.notes}`);
    doc.moveDown(1.5);

    drawSignature(doc, "Foreman Approval", foremanName, request.foremanApprovedAt, request.foremanSignature);
    drawSignature(doc, "Supervisor Approval", supervisorName, request.supervisorApprovedAt, request.supervisorSignature);
    if (request.managerApprovedBy !== null) {
      drawSignature(doc, "Manager Approval (turnaround exceeds base entitlement)", managerName, request.managerApprovedAt, request.managerSignature);
    }

    doc.end();
  });
}
