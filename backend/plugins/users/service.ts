import { eq } from "drizzle-orm";
import { db } from "../../db";
import { users, teams, ROLES } from "../../db/schema";
import type { Role } from "../../db/schema";
import { hashPin } from "../../lib/auth";
import type { AuthUser } from "../../lib/auth";
import { parseExcelBase64, buildImportTemplate } from "../../lib/excel";
import { HttpError } from "../../lib/http-error";

function omitPin<T extends { pinHash: string }>(user: T) {
  const { pinHash, ...safe } = user;
  return safe;
}

export const usersService = {
  async list(authUser: AuthUser) {
    const rows =
      authUser.role === "admin"
        ? await db.select().from(users)
        : await db.select().from(users).where(eq(users.projectId, authUser.projectId ?? -1));
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
    }>,
    authUser: AuthUser
  ) {
    const { pin, projectId, ...rest } = data;
    const patch: Record<string, unknown> = { ...rest };
    if (pin) patch.pinHash = await hashPin(pin);
    // Only admin may move a user between projects — manager is confined to their own.
    if (authUser.role === "admin" && projectId !== undefined) patch.projectId = projectId;

    const [updated] = await db.update(users).set(patch).where(eq(users.id, id)).returning();
    if (!updated) throw new HttpError(404, "User not found");
    return omitPin(updated);
  },

  async importExcel(base64: string, authUser: AuthUser) {
    const rows = await parseExcelBase64(base64);
    const created: string[] = [];
    const errors: string[] = [];

    const allTeams =
      authUser.role === "admin"
        ? await db.select().from(teams)
        : await db.select().from(teams).where(eq(teams.projectId, authUser.projectId ?? -1));
    const teamByName = new Map(allTeams.map((t) => [t.name.trim().toLowerCase(), t]));

    for (const row of rows) {
      const name = row.name ?? row.Name;
      const phone = row.phone ?? row.Phone;
      const role = (row.role ?? row.Role ?? "employee") as Role;
      const pin = row.pin ?? row.Pin ?? "0000";
      const teamName = row.team ?? row.Team;

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

      try {
        const pinHash = await hashPin(String(pin));
        await db.insert(users).values({ name, phone, pinHash, role, teamId, projectId: rowProjectId });
        created.push(phone);
      } catch (err) {
        errors.push(`Failed to import ${phone}: ${(err as Error).message}`);
      }
    }

    return { imported: created.length, created, errors };
  },

  async buildImportTemplate(authUser: AuthUser) {
    const allTeams =
      authUser.role === "admin"
        ? await db.select().from(teams)
        : await db.select().from(teams).where(eq(teams.projectId, authUser.projectId ?? -1));

    return buildImportTemplate(
      {
        sheetName: "Users",
        columns: [
          { header: "name", key: "name", width: 24 },
          { header: "phone", key: "phone", width: 18 },
          { header: "pin", key: "pin", width: 10 },
          { header: "role", key: "role", width: 14 },
          { header: "team", key: "team", width: 20 },
        ],
        rows: [
          { name: "Jane Doe", phone: "5555551234", pin: "1234", role: "employee", team: allTeams[0]?.name ?? "" },
        ],
      },
      {
        sheetName: "Reference",
        columns: [
          { header: "valid roles", key: "role", width: 16 },
          { header: "current teams", key: "team", width: 20 },
        ],
        rows: Array.from({ length: Math.max(ROLES.length, allTeams.length) }, (_, i) => ({
          role: ROLES[i] ?? "",
          team: allTeams[i]?.name ?? "",
        })),
      }
    );
  },
};
