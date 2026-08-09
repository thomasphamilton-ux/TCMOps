import { eq } from "drizzle-orm";
import { db } from "../../db";
import { costCodes } from "../../db/schema";
import { parseExcelBase64, buildImportTemplate } from "../../lib/excel";
import { HttpError } from "../../lib/http-error";
import type { AuthUser } from "../../lib/auth";

export const costCodesService = {
  async list(authUser: AuthUser) {
    if (authUser.role === "admin") return db.select().from(costCodes);
    return db.select().from(costCodes).where(eq(costCodes.projectId, authUser.projectId ?? -1));
  },

  async create(
    data: { code: string; description: string; allowsUnits?: boolean; unitType?: string; projectId?: number },
    authUser: AuthUser
  ) {
    const projectId = authUser.role === "admin" ? data.projectId ?? null : authUser.projectId;
    const [created] = await db
      .insert(costCodes)
      .values({
        code: data.code,
        description: data.description,
        allowsUnits: data.allowsUnits ?? false,
        unitType: data.unitType ?? null,
        projectId,
      })
      .returning();
    return created;
  },

  async getProjectId(id: number): Promise<number | null> {
    const [costCode] = await db.select({ projectId: costCodes.projectId }).from(costCodes).where(eq(costCodes.id, id)).limit(1);
    return costCode?.projectId ?? null;
  },

  async update(
    id: number,
    data: Partial<{ description: string; allowsUnits: boolean; unitType: string; active: boolean }>
  ) {
    const [updated] = await db.update(costCodes).set(data).where(eq(costCodes.id, id)).returning();
    if (!updated) throw new HttpError(404, "Cost code not found");
    return updated;
  },

  async importExcel(base64: string, authUser: AuthUser) {
    const rows = await parseExcelBase64(base64);
    const created: string[] = [];
    const errors: string[] = [];
    const projectId = authUser.role === "admin" ? null : authUser.projectId;

    for (const row of rows) {
      const code = row.code ?? row.Code;
      const description = row.description ?? row.Description;
      const allowsUnits = String(row.allowsUnits ?? row.AllowsUnits ?? "").toLowerCase() === "true";
      const unitType = row.unitType ?? row.UnitType ?? undefined;

      if (!code || !description) {
        errors.push(`Skipped row missing code/description: ${JSON.stringify(row)}`);
        continue;
      }

      try {
        await db.insert(costCodes).values({ code, description, allowsUnits, unitType, projectId });
        created.push(code);
      } catch (err) {
        errors.push(`Failed to import ${code}: ${(err as Error).message}`);
      }
    }

    return { imported: created.length, created, errors };
  },

  async buildImportTemplate() {
    return buildImportTemplate(
      {
        sheetName: "Cost Codes",
        columns: [
          { header: "code", key: "code", width: 20 },
          { header: "description", key: "description", width: 30 },
          { header: "allowsUnits", key: "allowsUnits", width: 14 },
          { header: "unitType", key: "unitType", width: 14 },
        ],
        rows: [
          { code: "FSA-01A-700", description: "Site Prep & Mobilization", allowsUnits: "false", unitType: "" },
          { code: "FSA-02B-700", description: "Conduit Installation", allowsUnits: "true", unitType: "LF" },
        ],
      },
      {
        sheetName: "Reference",
        columns: [{ header: "notes", key: "notes", width: 70 }],
        rows: [
          { notes: 'Code format: PREFIX-##L-000, e.g. FSA-02B-700.' },
          { notes: "The middle segment (##L, e.g. 02B) must be unique across all cost codes." },
          { notes: 'allowsUnits must be "true" or "false". Leave unitType blank when allowsUnits is false.' },
        ],
      }
    );
  },
};
