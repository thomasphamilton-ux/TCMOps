import { and, eq, ilike, or } from "drizzle-orm";
import { db } from "../../db";
import { users, teams, costCodes, projects, ROLES, EMPLOYMENT_TYPES } from "../../db/schema";
import type { Role, EmploymentType } from "../../db/schema";
import { hashPin } from "../../lib/auth";
import type { AuthUser } from "../../lib/auth";
import { parseExcelBase64, buildImportTemplate, buildExcelWorkbook } from "../../lib/excel";
import { HttpError } from "../../lib/http-error";

// Strips the PIN hash and the raw facial template (a large base64 image blob,
// and sensitive biometric data) from anything sent to the client — callers
// that need to know enrollment status get the boolean instead. Also surfaces
// the per diem rate in dollars (the API's unit) instead of the stored cents.
function omitPin<
  T extends {
    pinHash: string;
    facialTemplate: string | null;
    perDiemRateCents: number | null;
    ptoBalanceMinutes: number | null;
  }
>(user: T) {
  const { pinHash, facialTemplate, perDiemRateCents, ptoBalanceMinutes, ...safe } = user;
  return {
    ...safe,
    facialEnrolled: facialTemplate !== null,
    perDiemRate: perDiemRateCents !== null ? perDiemRateCents / 100 : null,
    ptoBalanceHours: ptoBalanceMinutes !== null ? ptoBalanceMinutes / 60 : null,
  };
}

export const usersService = {
  // No `search` — everyday rosters and pickers, archived people stay hidden.
  // With `search` — a deliberate lookup, so it matches name/phone across
  // archived people too (that's the whole point of archiving over deleting).
  async list(authUser: AuthUser, search?: string) {
    const scope = authUser.role === "admin" ? undefined : eq(users.projectId, authUser.projectId ?? -1);
    const trimmed = search?.trim();
    const filter = trimmed
      ? or(ilike(users.name, `%${trimmed}%`), ilike(users.phone, `%${trimmed}%`), ilike(users.eid, `%${trimmed}%`))
      : eq(users.archived, false);
    const where = scope ? and(scope, filter) : filter;

    const rows = await db.select().from(users).where(where);
    return rows.map(omitPin);
  },

  async getById(id: number) {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!user) throw new HttpError(404, "User not found");
    return omitPin(user);
  },

  async create(
    data: {
      name: string;
      phone: string;
      pin: string;
      role: Role;
      teamId?: number;
      projectId?: number;
      shiftExempt?: boolean;
      classification?: string;
      perDiemRate?: number;
      defaultCostCodeId?: number;
      eid?: string;
      language?: string;
      employmentType?: EmploymentType;
      contractCompany?: string;
      ptoBalanceHours?: number;
    },
    authUser: AuthUser
  ) {
    const pinHash = await hashPin(data.pin);
    const projectId = authUser.role === "admin" ? data.projectId ?? null : authUser.projectId;
    const [created] = await db
      .insert(users)
      .values({
        name: data.name,
        phone: data.phone,
        pinHash,
        role: data.role,
        teamId: data.teamId ?? null,
        projectId,
        shiftExempt: data.shiftExempt ?? false,
        classification: data.classification || null,
        perDiemRateCents: data.perDiemRate != null ? Math.round(data.perDiemRate * 100) : null,
        defaultCostCodeId: data.defaultCostCodeId ?? null,
        eid: data.eid || null,
        language: data.language || null,
        employmentType: data.employmentType ?? "full_time",
        // A contract company only means something for a contract worker —
        // dropped otherwise so switching someone back to full-time later
        // doesn't leave a stale, misleading value sitting on the record.
        contractCompany: data.employmentType === "contract" ? data.contractCompany || null : null,
        ptoBalanceMinutes: data.ptoBalanceHours != null ? Math.round(data.ptoBalanceHours * 60) : null,
      })
      .returning();
    return omitPin(created);
  },

  async update(
    id: number,
    data: Partial<{
      name: string;
      role: Role;
      teamId: number | null;
      projectId: number | null;
      active: boolean;
      pin: string;
      shiftExempt: boolean;
      classification: string | null;
      perDiemRate: number | null;
      language: string | null;
      defaultCostCodeId: number | null;
      archived: boolean;
      eid: string | null;
      employmentType: EmploymentType;
      contractCompany: string | null;
      ptoBalanceHours: number | null;
    }>,
    authUser: AuthUser
  ) {
    const { pin, projectId, perDiemRate, archived, employmentType, contractCompany, ptoBalanceHours, ...rest } = data;
    const patch: Record<string, unknown> = { ...rest };
    if (pin) patch.pinHash = await hashPin(pin);
    // Only admin may move a user between projects — manager is confined to their own.
    if (authUser.role === "admin" && projectId !== undefined) patch.projectId = projectId;
    if (perDiemRate !== undefined) patch.perDiemRateCents = perDiemRate != null ? Math.round(perDiemRate * 100) : null;
    if (ptoBalanceHours !== undefined) {
      patch.ptoBalanceMinutes = ptoBalanceHours != null ? Math.round(ptoBalanceHours * 60) : null;
    }
    if (employmentType !== undefined) {
      patch.employmentType = employmentType;
      // Same rule as create() — a contract company is meaningless once
      // they're not a contract worker, so don't let a stale value linger.
      patch.contractCompany = employmentType === "contract" ? contractCompany || null : null;
    } else if (contractCompany !== undefined) {
      patch.contractCompany = contractCompany;
    }
    if (archived !== undefined) {
      patch.archived = archived;
      if (archived) {
        // Can't log in while archived — un-archiving deliberately doesn't
        // restore this on its own, so re-granting access is a separate step.
        patch.active = false;
        patch.archivedAt = new Date();
        patch.archivedBy = authUser.id;
      } else {
        patch.archivedAt = null;
        patch.archivedBy = null;
      }
    }

    const [updated] = await db.update(users).set(patch).where(eq(users.id, id)).returning();
    if (!updated) throw new HttpError(404, "User not found");
    return omitPin(updated);
  },

  async resetFacialTemplate(id: number) {
    const [updated] = await db.update(users).set({ facialTemplate: null }).where(eq(users.id, id)).returning();
    if (!updated) throw new HttpError(404, "User not found");
    return omitPin(updated);
  },

  // True/yes/1 (any case) reads as true; everything else (including blank) as false.
  parseBoolean(raw: unknown): boolean {
    return ["true", "yes", "1"].includes(String(raw ?? "").trim().toLowerCase());
  },

  async importExcel(base64: string, authUser: AuthUser) {
    const rows = await parseExcelBase64(base64);
    const created: string[] = [];
    const errors: string[] = [];

    const [allTeams, allCostCodes] = await Promise.all([
      authUser.role === "admin" ? db.select().from(teams) : db.select().from(teams).where(eq(teams.projectId, authUser.projectId ?? -1)),
      authUser.role === "admin"
        ? db.select().from(costCodes)
        : db.select().from(costCodes).where(eq(costCodes.projectId, authUser.projectId ?? -1)),
    ]);
    const teamByName = new Map(allTeams.map((t) => [t.name.trim().toLowerCase(), t]));
    const costCodeByCode = new Map(allCostCodes.map((c) => [c.code.trim().toLowerCase(), c]));

    for (const row of rows) {
      const name = row.name ?? row.Name;
      const phone = row.phone ?? row.Phone;
      const role = (row.role ?? row.Role ?? "employee") as Role;
      const pin = row.pin ?? row.Pin ?? "0000";
      const teamName = row.team ?? row.Team;
      const costCodeStr = row.defaultCostCode ?? row.DefaultCostCode;
      const employmentTypeRaw = String(row.employmentType ?? row.EmploymentType ?? "").trim().toLowerCase();

      if (!name || !phone) {
        errors.push(`Skipped row missing name/phone: ${JSON.stringify(row)}`);
        continue;
      }

      let teamId: number | null = null;
      let rowProjectId = authUser.role === "admin" ? null : authUser.projectId;
      if (teamName) {
        const match = teamByName.get(String(teamName).trim().toLowerCase());
        if (match) {
          teamId = match.id;
          if (authUser.role === "admin") rowProjectId = match.projectId;
        } else {
          errors.push(`${phone}: team "${teamName}" not found — created without a team.`);
        }
      }

      let defaultCostCodeId: number | null = null;
      if (costCodeStr) {
        const match = costCodeByCode.get(String(costCodeStr).trim().toLowerCase());
        if (match) defaultCostCodeId = match.id;
        else errors.push(`${phone}: cost code "${costCodeStr}" not found — left unset.`);
      }

      const employmentTypeValid = (EMPLOYMENT_TYPES as readonly string[]).includes(employmentTypeRaw);
      const employmentType: EmploymentType = employmentTypeValid ? (employmentTypeRaw as EmploymentType) : "full_time";
      if (employmentTypeRaw && !employmentTypeValid) {
        errors.push(`${phone}: employment type "${employmentTypeRaw}" not recognized — defaulted to full_time.`);
      }
      const contractCompanyRaw = row.contractCompany ?? row.ContractCompany;

      const perDiemRateRaw = row.perDiemRate ?? row.PerDiemRate;
      const perDiemRateCents = perDiemRateRaw && !Number.isNaN(Number(perDiemRateRaw)) ? Math.round(Number(perDiemRateRaw) * 100) : null;

      try {
        const pinHash = await hashPin(String(pin));
        await db.insert(users).values({
          name,
          phone,
          pinHash,
          role,
          teamId,
          projectId: rowProjectId,
          classification: (row.classification ?? row.Classification) || null,
          eid: (row.eid ?? row.EID) || null,
          language: (row.language ?? row.Language) || null,
          shiftExempt: this.parseBoolean(row.shiftExempt ?? row.ShiftExempt),
          defaultCostCodeId,
          perDiemRateCents,
          employmentType,
          contractCompany: employmentType === "contract" ? (contractCompanyRaw || null) : null,
        });
        created.push(phone);
      } catch (err) {
        errors.push(`Failed to import ${phone}: ${(err as Error).message}`);
      }
    }

    return { imported: created.length, created, errors };
  },

  async buildImportTemplate(authUser: AuthUser) {
    const [allTeams, allCostCodes] = await Promise.all([
      authUser.role === "admin" ? db.select().from(teams) : db.select().from(teams).where(eq(teams.projectId, authUser.projectId ?? -1)),
      authUser.role === "admin"
        ? db.select().from(costCodes)
        : db.select().from(costCodes).where(eq(costCodes.projectId, authUser.projectId ?? -1)),
    ]);

    return buildImportTemplate(
      {
        sheetName: "Users",
        columns: [
          { header: "name", key: "name", width: 24 },
          { header: "phone", key: "phone", width: 18 },
          { header: "pin", key: "pin", width: 10 },
          { header: "role", key: "role", width: 14 },
          { header: "team", key: "team", width: 20 },
          { header: "classification", key: "classification", width: 18 },
          { header: "eid", key: "eid", width: 14 },
          { header: "defaultCostCode", key: "defaultCostCode", width: 18 },
          { header: "perDiemRate", key: "perDiemRate", width: 14 },
          { header: "language", key: "language", width: 10 },
          { header: "shiftExempt", key: "shiftExempt", width: 12 },
          { header: "employmentType", key: "employmentType", width: 16 },
          { header: "contractCompany", key: "contractCompany", width: 24 },
        ],
        rows: [
          {
            name: "Jane Doe",
            phone: "5555551234",
            pin: "1234",
            role: "employee",
            team: allTeams[0]?.name ?? "",
            classification: "Journeyman",
            eid: "",
            defaultCostCode: allCostCodes[0]?.code ?? "",
            perDiemRate: "",
            language: "en",
            shiftExempt: "false",
            employmentType: "full_time",
            contractCompany: "",
          },
        ],
      },
      {
        sheetName: "Reference",
        columns: [
          { header: "valid roles", key: "role", width: 16 },
          { header: "current teams", key: "team", width: 20 },
          { header: "current cost codes", key: "costCode", width: 20 },
          { header: "valid employment types", key: "employmentType", width: 20 },
        ],
        rows: Array.from(
          { length: Math.max(ROLES.length, allTeams.length, allCostCodes.length, EMPLOYMENT_TYPES.length) },
          (_, i) => ({
            role: ROLES[i] ?? "",
            team: allTeams[i]?.name ?? "",
            costCode: allCostCodes[i]?.code ?? "",
            employmentType: EMPLOYMENT_TYPES[i] ?? "",
          })
        ),
      }
    );
  },

  // Full data dump for backup/reporting — deliberately includes archived
  // users (unlike list()'s default roster view), since the whole point of an
  // export is to have everything, not just who's currently active.
  async exportExcel(authUser: AuthUser) {
    const rows =
      authUser.role === "admin"
        ? await db.select().from(users)
        : await db.select().from(users).where(eq(users.projectId, authUser.projectId ?? -1));

    const [allTeams, allProjects, allCostCodes] = await Promise.all([
      db.select().from(teams),
      db.select().from(projects),
      db.select().from(costCodes),
    ]);
    const teamName = new Map(allTeams.map((t) => [t.id, t.name]));
    const projectName = new Map(allProjects.map((p) => [p.id, p.name]));
    const costCodeLabel = new Map(allCostCodes.map((c) => [c.id, c.code]));

    return buildExcelWorkbook(
      "Users",
      [
        { header: "ID", key: "id", width: 8 },
        { header: "Name", key: "name", width: 24 },
        { header: "Phone", key: "phone", width: 16 },
        { header: "EID", key: "eid", width: 14 },
        { header: "Role", key: "role", width: 12 },
        { header: "Classification", key: "classification", width: 18 },
        { header: "Project", key: "project", width: 20 },
        { header: "Team", key: "team", width: 18 },
        { header: "Default Cost Code", key: "defaultCostCode", width: 18 },
        { header: "Per Diem Rate", key: "perDiemRate", width: 14 },
        { header: "Language", key: "language", width: 10 },
        { header: "Shift Exempt", key: "shiftExempt", width: 12 },
        { header: "Employment Type", key: "employmentType", width: 16 },
        { header: "Contract Company", key: "contractCompany", width: 24 },
        { header: "Status", key: "status", width: 10 },
        { header: "Archived", key: "archived", width: 10 },
        { header: "Created", key: "createdAt", width: 14 },
      ],
      rows.map((u) => ({
        id: u.id,
        name: u.name,
        phone: u.phone,
        eid: u.eid ?? "",
        role: u.role,
        classification: u.classification ?? "",
        project: u.projectId ? projectName.get(u.projectId) ?? "" : "",
        team: u.teamId ? teamName.get(u.teamId) ?? "" : "",
        defaultCostCode: u.defaultCostCodeId ? costCodeLabel.get(u.defaultCostCodeId) ?? "" : "",
        perDiemRate: u.perDiemRateCents != null ? u.perDiemRateCents / 100 : "",
        language: u.language ?? "",
        shiftExempt: u.shiftExempt ? "Yes" : "No",
        employmentType: u.employmentType === "contract" ? "Contract" : "Full Time",
        contractCompany: u.contractCompany ?? "",
        status: u.active ? "Active" : "Inactive",
        archived: u.archived ? "Yes" : "No",
        createdAt: u.createdAt.toISOString().slice(0, 10),
      }))
    );
  },
};
