import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { attendanceRecords, users } from "../../db/schema";
import type { AttendanceStatus } from "../../db/schema";
import type { AuthUser } from "../../lib/auth";
import { HttpError } from "../../lib/http-error";

export const attendanceService = {
  async getEmployeeId(id: number): Promise<number | null> {
    const [row] = await db.select({ employeeId: attendanceRecords.employeeId }).from(attendanceRecords).where(eq(attendanceRecords.id, id)).limit(1);
    return row?.employeeId ?? null;
  },

  async set(employeeId: number, date: string, status: AttendanceStatus, notes: string | undefined, recordedBy: number) {
    const [saved] = await db
      .insert(attendanceRecords)
      .values({ employeeId, date, status, notes: notes ?? null, recordedBy })
      .onConflictDoUpdate({
        target: [attendanceRecords.employeeId, attendanceRecords.date],
        set: { status, notes: notes ?? null, recordedBy, updatedAt: new Date() },
      })
      .returning();
    return saved;
  },

  async list(employeeId: number, start?: string, end?: string) {
    return db.query.attendanceRecords.findMany({
      where: (a, { and, eq, gte, lte }) =>
        and(eq(a.employeeId, employeeId), start ? gte(a.date, start) : undefined, end ? lte(a.date, end) : undefined),
      with: { recorder: { columns: { id: true, name: true } } },
      orderBy: (a, { asc }) => [asc(a.date)],
    });
  },

  async listForDate(date: string, authUser: AuthUser) {
    if (authUser.role === "admin") {
      return db.query.attendanceRecords.findMany({
        where: eq(attendanceRecords.date, date),
        with: { employee: { columns: { id: true, name: true, teamId: true } } },
      });
    }

    const rows = await db
      .select({ record: attendanceRecords, employee: { id: users.id, name: users.name, teamId: users.teamId } })
      .from(attendanceRecords)
      .innerJoin(users, eq(attendanceRecords.employeeId, users.id))
      .where(and(eq(attendanceRecords.date, date), eq(users.projectId, authUser.projectId ?? -1)));

    return rows.map((r) => ({ ...r.record, employee: r.employee }));
  },

  async remove(id: number) {
    const [deleted] = await db.delete(attendanceRecords).where(eq(attendanceRecords.id, id)).returning();
    if (!deleted) throw new HttpError(404, "Attendance record not found");
    return { deleted: true };
  },
};
