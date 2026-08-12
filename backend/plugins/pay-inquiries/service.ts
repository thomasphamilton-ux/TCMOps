import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { payInquiries, users } from "../../db/schema";
import { HttpError } from "../../lib/http-error";
import type { AuthUser } from "../../lib/auth";

export const payInquiriesService = {
  async create(employeeId: number, data: { subject: string; message: string }) {
    const [employee] = await db
      .select({ projectId: users.projectId, teamId: users.teamId })
      .from(users)
      .where(eq(users.id, employeeId))
      .limit(1);

    const [created] = await db
      .insert(payInquiries)
      .values({
        employeeId,
        projectId: employee?.projectId ?? null,
        teamId: employee?.teamId ?? null,
        subject: data.subject,
        message: data.message,
      })
      .returning();
    return created;
  },

  // Scoped by the inquiry's own snapshotted projectId/teamId (see db/schema.ts),
  // not the employee's current one — same rationale as fraudFlags. Unlike
  // fraud's list (leadership-only), an employee can always see their own
  // inquiries regardless of role.
  async list(authUser: AuthUser, resolved?: boolean, projectId?: number) {
    const conditions = [];
    if (resolved !== undefined) conditions.push(eq(payInquiries.resolved, resolved));

    if (authUser.role === "admin") {
      if (projectId !== undefined) conditions.push(eq(payInquiries.projectId, projectId));
    } else if (authUser.role === "manager" || authUser.role === "supervisor") {
      conditions.push(eq(payInquiries.projectId, authUser.projectId ?? -1));
    } else if (authUser.role === "foreman") {
      conditions.push(eq(payInquiries.teamId, authUser.teamId ?? -1));
    } else {
      conditions.push(eq(payInquiries.employeeId, authUser.id));
    }

    return db
      .select()
      .from(payInquiries)
      .where(conditions.length ? and(...conditions) : undefined);
  },

  async getEmployeeId(id: number): Promise<number | null> {
    const [row] = await db.select({ employeeId: payInquiries.employeeId }).from(payInquiries).where(eq(payInquiries.id, id)).limit(1);
    return row?.employeeId ?? null;
  },

  async resolve(id: number, resolvedBy: number, response: string) {
    const [updated] = await db
      .update(payInquiries)
      .set({ resolved: true, response, resolvedBy, resolvedAt: new Date() })
      .where(eq(payInquiries.id, id))
      .returning();
    if (!updated) throw new HttpError(404, "Pay inquiry not found");
    return updated;
  },
};
