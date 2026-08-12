import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { costCodes, dailyEntries, dailyTime } from "../../db/schema";
import { parseExcelBase64, buildImportTemplate } from "../../lib/excel";
import { HttpError } from "../../lib/http-error";
import type { AuthUser } from "../../lib/auth";

// Attaches computed incurred/remaining hours+units to each cost code by
// summing dailyEntries (excluding denied days) — never stored, so it can't
// drift from the actual logged time.
async function withComputedTotals<T extends { id: number; budgetMinutes: number | null; budgetUnits: number | null }>(
  rows: T[]
) {
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const totals = await db
    .select({
      costCodeId: dailyEntries.costCodeId,
      minutes: sql<string>`coalesce(sum(${dailyEntries.minutes}), 0)`,
      units: sql<string>`coalesce(sum(${dailyEntries.units}), 0)`,
    })
    .from(dailyEntries)
    .innerJoin(dailyTime, eq(dailyEntries.dailyTimeId, dailyTime.id))
    .where(and(eq(dailyTime.denied, false), inArray(dailyEntries.costCodeId, ids)))
    .groupBy(dailyEntries.costCodeId);

  const totalsByCode = new Map(totals.map((t) => [t.costCodeId, t]));

  return rows.map(({ budgetMinutes, ...cc }) => {
    const t = totalsByCode.get(cc.id);
    const incurredHours = t ? Number(t.minutes) / 60 : 0;
    const incurredUnits = t ? Number(t.units) : 0;
    const budgetHours = budgetMinutes != null ? budgetMinutes / 60 : null;
    return {
      ...cc,
      budgetHours,
      budgetUnits: cc.budgetUnits,
      incurredHours,
      incurredUnits,
      remainingHours: budgetHours != null ? budgetHours - incurredHours : null,
      remainingUnits: cc.budgetUnits != null ? cc.budgetUnits - incurredUnits : null,
    };
  });
}

export const costCodesService = {
  async list(authUser: AuthUser) {
    const rows =
      authUser.role === "admin"
        ? await db.select().from(costCodes)
        : await db.select().from(costCodes).where(eq(costCodes.projectId, authUser.projectId ?? -1));
    return withComputedTotals(rows);
  },

  async create(
    data: {
      code: string;
      description: string;
      allowsUnits?: boolean;
      unitType?: string;
      projectId?: number;
      taskType?: string;
      budgetHours?: number;
      budgetUnits?: number;
    },
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
        taskType: data.taskType || null,
        budgetMinutes: data.budgetHours != null ? Math.round(data.budgetHours * 60) : null,
        budgetUnits: data.budgetUnits ?? null,
      })
      .returning();
    const [withTotals] = await withComputedTotals([created]);
    return withTotals;
  },

  async getProjectId(id: number): Promise<number | null> {
    const [costCode] = await db.select({ projectId: costCodes.projectId }).from(costCodes).where(eq(costCodes.id, id)).limit(1);
    return costCode?.projectId ?? null;
  },

  async update(
    id: number,
    data: Partial<{
      description: string;
      allowsUnits: boolean;
      unitType: string;
      active: boolean;
      taskType: string | null;
      budgetHours: number | null;
      budgetUnits: number | null;
    }>
  ) {
    const { budgetHours, ...rest } = data;
    const patch: Record<string, unknown> = { ...rest };
    if (budgetHours !== undefined) {
      patch.budgetMinutes = budgetHours == null ? null : Math.round(budgetHours * 60);
    }
    const [updated] = await db.update(costCodes).set(patch).where(eq(costCodes.id, id)).returning();
    if (!updated) throw new HttpError(404, "Cost code not found");
    const [withTotals] = await withComputedTotals([updated]);
    return withTotals;
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
      const taskType = row.taskType ?? row.TaskType ?? undefined;

      const budgetHoursRaw = row.budgetHours ?? row.BudgetHours;
      const budgetHours =
        budgetHoursRaw !== undefined && budgetHoursRaw !== "" && !Number.isNaN(Number(budgetHoursRaw))
          ? Number(budgetHoursRaw)
          : undefined;

      const budgetUnitsRaw = row.budgetUnits ?? row.BudgetUnits;
      const budgetUnits =
        budgetUnitsRaw !== undefined && budgetUnitsRaw !== "" && !Number.isNaN(Number(budgetUnitsRaw))
          ? Number(budgetUnitsRaw)
          : undefined;

      const statusRaw = String(row.status ?? row.Status ?? "").trim().toLowerCase();
      const statusValid = statusRaw === "" || statusRaw === "active" || statusRaw === "inactive";
      const active = statusRaw !== "inactive";
      if (statusRaw && !statusValid) {
        errors.push(`${code}: status "${statusRaw}" not recognized — defaulted to active.`);
      }

      if (!code || !description) {
        errors.push(`Skipped row missing code/description: ${JSON.stringify(row)}`);
        continue;
      }

      try {
        await db.insert(costCodes).values({
          code,
          description,
          allowsUnits,
          unitType,
          projectId,
          taskType: taskType || null,
          budgetMinutes: budgetHours != null ? Math.round(budgetHours * 60) : null,
          budgetUnits: budgetUnits ?? null,
          active,
        });
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
          { header: "taskType", key: "taskType", width: 18 },
          { header: "allowsUnits", key: "allowsUnits", width: 14 },
          { header: "unitType", key: "unitType", width: 14 },
          { header: "budgetHours", key: "budgetHours", width: 14 },
          { header: "budgetUnits", key: "budgetUnits", width: 14 },
          { header: "status", key: "status", width: 12 },
        ],
        rows: [
          {
            code: "FSA-01A-700",
            description: "Site Prep & Mobilization",
            taskType: "Sitework",
            allowsUnits: "false",
            unitType: "",
            budgetHours: "120",
            budgetUnits: "",
            status: "active",
          },
          {
            code: "FSA-02B-700",
            description: "Conduit Installation",
            taskType: "Electrical",
            allowsUnits: "true",
            unitType: "LF",
            budgetHours: "300",
            budgetUnits: "5000",
            status: "active",
          },
        ],
      },
      {
        sheetName: "Reference",
        columns: [{ header: "notes", key: "notes", width: 70 }],
        rows: [
          { notes: 'Code format: PREFIX-##L-000, e.g. FSA-02B-700.' },
          { notes: "The middle segment (##L, e.g. 02B) must be unique across all cost codes." },
          { notes: 'allowsUnits must be "true" or "false". Leave unitType blank when allowsUnits is false.' },
          { notes: "taskType is a free-text category (e.g. Electrical, Sitework) — optional." },
          { notes: "budgetHours/budgetUnits are the planned targets for this code — leave blank if not tracked." },
          { notes: 'status must be "active" or "inactive" — leave blank to default to active.' },
          { notes: "Incurred and remaining hours/units are not imported — they're calculated automatically from logged time." },
        ],
      }
    );
  },
};
