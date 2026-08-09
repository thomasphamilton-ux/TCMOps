import { eq } from "drizzle-orm";
import type { FastifyRequest, FastifyReply } from "fastify";
import { db } from "../db";
import { users } from "../db/schema";
import type { AuthUser } from "./auth";

interface TargetScope {
  teamId: number | null;
  projectId: number | null;
}

export async function getTargetScope(userId: number): Promise<TargetScope | null> {
  const [target] = await db
    .select({ teamId: users.teamId, projectId: users.projectId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return target ?? null;
}

/**
 * True if `authUser` may reach `target` under the project/team hierarchy:
 * admin (any), manager/supervisor (same project), foreman (same team).
 * Does not apply any self-bypass or employee-blocking — callers layer that on top.
 */
export function inSameScope(authUser: AuthUser, target: TargetScope): boolean {
  if (authUser.role === "admin") return true;
  if ((authUser.role === "manager" || authUser.role === "supervisor") && authUser.projectId !== null) {
    return target.projectId === authUser.projectId;
  }
  if (authUser.role === "foreman" && authUser.teamId !== null) {
    return target.teamId === authUser.teamId;
  }
  return false;
}

/**
 * Self is always allowed (any role, including employee — e.g. clocking
 * themselves in/out or evaluating their own per diem). Otherwise: admin
 * (any), manager/supervisor (same project), foreman (same team). Employees
 * can never act on anyone but themselves.
 */
export function requireProjectScopedSelfOrRole(fieldName: string, source: "params" | "body" = "body") {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const authUser = req.authUser;
    if (!authUser) return reply.code(401).send({ error: "Unauthorized" });

    const raw =
      source === "params"
        ? (req.params as Record<string, string>)[fieldName]
        : (req.body as Record<string, unknown> | undefined)?.[fieldName];
    const targetId = Number(raw);

    if (authUser.id === targetId) return;

    const target = await getTargetScope(targetId);
    if (!target) return reply.code(404).send({ error: "User not found" });
    if (inSameScope(authUser, target)) return;

    return reply.code(403).send({ error: "Forbidden" });
  };
}

/**
 * For routes acting on a record that carries its OWN `projectId` directly
 * (teams, cost codes) rather than being owned by an employee. `resolveProjectId`
 * looks up the record's project; admin bypasses, everyone else (in practice
 * only manager reaches this, since these routes are admin/manager-only) must
 * match their own `authUser.projectId`.
 */
export function requireProjectMatch(paramName: string, resolveProjectId: (id: number) => Promise<number | null>) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const authUser = req.authUser;
    if (!authUser) return reply.code(401).send({ error: "Unauthorized" });
    if (authUser.role === "admin") return;

    const recordId = Number((req.params as Record<string, string>)[paramName]);
    const projectId = await resolveProjectId(recordId);
    if (projectId === null) return reply.code(404).send({ error: "Not found" });
    if (authUser.projectId !== null && authUser.projectId === projectId) return;

    return reply.code(403).send({ error: "Forbidden" });
  };
}

/**
 * For routes acting on a RECORD id (fraud flag, daily entry, dailyTime row,
 * attendance row) rather than a user id directly. `resolveEmployeeId` looks
 * up which employee the record belongs to; the same project/team rule then
 * applies. No self-bypass — these are leadership correction routes, already
 * gated to admin/manager/supervisor by requireRole before this preHandler runs.
 */
export function requireProjectScopedRecord(
  paramName: string,
  resolveEmployeeId: (id: number) => Promise<number | null>
) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const authUser = req.authUser;
    if (!authUser) return reply.code(401).send({ error: "Unauthorized" });
    if (authUser.role === "admin") return;

    const recordId = Number((req.params as Record<string, string>)[paramName]);
    const employeeId = await resolveEmployeeId(recordId);
    if (employeeId === null) return reply.code(404).send({ error: "Not found" });

    const target = await getTargetScope(employeeId);
    if (target && inSameScope(authUser, target)) return;

    return reply.code(403).send({ error: "Forbidden" });
  };
}
