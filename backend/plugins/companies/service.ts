import { eq } from "drizzle-orm";
import { db } from "../../db";
import { companies } from "../../db/schema";
import { HttpError } from "../../lib/http-error";

export const companiesService = {
  async list() {
    return db.select().from(companies);
  },

  async getById(id: number) {
    const [company] = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
    if (!company) throw new HttpError(404, "Company not found");
    return company;
  },

  async create(data: { code: string; name: string; active?: boolean }) {
    const [created] = await db
      .insert(companies)
      .values({ code: data.code, name: data.name, active: data.active ?? true })
      .returning();
    return created;
  },

  async update(id: number, data: Partial<{ code: string; name: string; active: boolean }>) {
    const [updated] = await db.update(companies).set(data).where(eq(companies.id, id)).returning();
    if (!updated) throw new HttpError(404, "Company not found");
    return updated;
  },
};
