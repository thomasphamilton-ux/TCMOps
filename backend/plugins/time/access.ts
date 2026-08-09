import type { FastifyRequest, FastifyReply } from "fastify";
import { getTargetScope, inSameScope } from "../../lib/project-scope";

/**
 * Daily cost-code entry access — RULE: standard employees never allocate or
 * change cost-code time, not even their own. They may only clock in/out
 * (see /time/clock-in, /time/clock-out) and view their own hours/per diem
 * (GET routes, unaffected by this check). Allocating codes is exclusively a
 * leadership action: admin (any), manager/supervisor (own project), or a
 * foreman entering for someone on their own team. Distinct from the
 * manager/supervisor/admin-only correction endpoints (updateEntry/deleteEntry/correctDaily).
 */
export function requireTimeEntryAccess(fieldName: string) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as Record<string, unknown> | undefined;
    const targetId = Number(body?.[fieldName]);
    const authUser = req.authUser;
    if (!authUser) return reply.code(401).send({ error: "Unauthorized" });
    if (authUser.role === "employee") return reply.code(403).send({ error: "Forbidden" });
    if (authUser.id === targetId) return;
    if (authUser.role === "admin") return;

    const target = await getTargetScope(targetId);
    if (target && inSameScope(authUser, target)) return;

    return reply.code(403).send({ error: "Forbidden" });
  };
}
