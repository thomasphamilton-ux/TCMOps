import { eq } from "drizzle-orm";
import { db } from "../../db";
import { exportsTable, users } from "../../db/schema";
import { excelBuilder } from "./excel";
import { pdfBuilder } from "./pdf";
import { emailSender } from "./email";
import { reportsService } from "../reports/service";
import type { AuthUser } from "../../lib/auth";

export const exportsService = {
  async generate(
    type: "daily" | "weekly",
    startDate: string,
    endDate: string,
    authUser: AuthUser,
    notifyEmail?: string
  ) {
    const requestedBy = authUser.id;
    const rows = await reportsService.detailRows(startDate, type === "daily" ? startDate : endDate, authUser);

    const excelUrl = await excelBuilder(type, startDate, endDate, rows);
    const pdfUrl = await pdfBuilder(type, startDate, endDate, rows);

    await emailSender(
      notifyEmail,
      `TCM ${type} export ready`,
      `Your ${type} export for ${startDate} to ${endDate} is ready: ${excelUrl}`
    );

    const [saved] = await db
      .insert(exportsTable)
      .values({ type, startDate, endDate, excelUrl, pdfUrl, requestedBy })
      .returning();

    return saved;
  },

  async list(authUser: AuthUser) {
    if (authUser.role === "admin") return db.select().from(exportsTable);

    const rows = await db
      .select({ export: exportsTable })
      .from(exportsTable)
      .innerJoin(users, eq(exportsTable.requestedBy, users.id))
      .where(eq(users.projectId, authUser.projectId ?? -1));
    return rows.map((r) => r.export);
  },
};
