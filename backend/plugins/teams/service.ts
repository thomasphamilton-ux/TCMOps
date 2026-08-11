import { eq } from "drizzle-orm";
import { db } from "../../db";
import { teams } from "../../db/schema";
import { HttpError } from "../../lib/http-error";
import type { AuthUser } from "../../lib/auth";

export const teamsService = {
  async list(authUser: AuthUser) {
    if (authUser.role === "admin") return db.select().from(teams);
    return db.select().from(teams).where(eq(teams.projectId, authUser.projectId ?? -1));
  },

  async getById(id: number) {
    const [team] = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
    if (!team) throw new HttpError(404, "Team not found");
    return team;
  },

  async create(
    data: { name: string; foremanId?: number; projectId?: number; shiftStart?: string | null },
    authUser: AuthUser
  ) {
    const projectId = authUser.role === "admin" ? data.projectId ?? null : authUser.projectId;
    const [created] = await db
      .insert(teams)
      .values({ name: data.name, foremanId: data.foremanId ?? null, projectId, shiftStart: data.shiftStart ?? null })
      .returning();
    return created;
  },

  async getProjectId(id: number): Promise<number | null> {
    const [team] = await db.select({ projectId: teams.projectId }).from(teams).where(eq(teams.id, id)).limit(1);
    return team?.projectId ?? null;
  },

  async update(
    id: number,
    data: Partial<{
      name: string;
      foremanId: number | null;
      projectId: number | null;
      shiftStart: string | null;
      active: boolean;
    }>,
    authUser: AuthUser
  ) {
    const { projectId, ...rest } = data;
    const patch: Record<string, unknown> = { ...rest };
    // Only admin may move a team between projects — manager is confined to their own.
    if (authUser.role === "admin" && projectId !== undefined) patch.projectId = projectId;

    const [updated] = await db.update(teams).set(patch).where(eq(teams.id, id)).returning();
    if (!updated) throw new HttpError(404, "Team not found");
    return updated;
  },
};
