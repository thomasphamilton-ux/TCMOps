import { eq } from "drizzle-orm";
import { db } from "../../db";
import { projects } from "../../db/schema";
import type { AuthUser } from "../../lib/auth";
import { HttpError } from "../../lib/http-error";

interface GeofenceInput {
  geofenceLat?: number | null;
  geofenceLng?: number | null;
  geofenceRadiusM?: number | null;
}

/** A geofence is all-or-nothing: either all three fields are set, or all three are cleared. */
function normalizeGeofence(data: GeofenceInput) {
  const { geofenceLat, geofenceLng, geofenceRadiusM } = data;
  const touched = geofenceLat !== undefined || geofenceLng !== undefined || geofenceRadiusM !== undefined;
  if (!touched) return {};

  const allCleared = geofenceLat === null && geofenceLng === null && geofenceRadiusM === null;
  const allSet = geofenceLat != null && geofenceLng != null && geofenceRadiusM != null;
  if (!allCleared && !allSet) {
    throw new HttpError(400, "geofenceLat, geofenceLng, and geofenceRadiusM must be set together or all left empty");
  }
  return { geofenceLat: geofenceLat ?? null, geofenceLng: geofenceLng ?? null, geofenceRadiusM: geofenceRadiusM ?? null };
}

export const projectsService = {
  // Non-admin roles only ever have one project (their own), so list() just
  // returns that single project — keeps the frontend's "fetch /projects" call
  // uniform across roles instead of branching on admin vs not.
  async list(authUser: AuthUser) {
    if (authUser.role === "admin") return db.select().from(projects);
    if (authUser.projectId === null) return [];
    return db.select().from(projects).where(eq(projects.id, authUser.projectId));
  },

  async getById(id: number, authUser: AuthUser) {
    if (authUser.role !== "admin" && authUser.projectId !== id) {
      throw new HttpError(403, "Forbidden");
    }
    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!project) throw new HttpError(404, "Project not found");
    return project;
  },

  async create(data: { code: string; name: string; active?: boolean } & GeofenceInput) {
    const [created] = await db
      .insert(projects)
      .values({ code: data.code, name: data.name, active: data.active ?? true, ...normalizeGeofence(data) })
      .returning();
    return created;
  },

  async update(id: number, data: Partial<{ code: string; name: string; active: boolean } & GeofenceInput>) {
    const { geofenceLat, geofenceLng, geofenceRadiusM, ...rest } = data;
    const patch = { ...rest, ...normalizeGeofence({ geofenceLat, geofenceLng, geofenceRadiusM }) };
    const [updated] = await db.update(projects).set(patch).where(eq(projects.id, id)).returning();
    if (!updated) throw new HttpError(404, "Project not found");
    return updated;
  },
};
