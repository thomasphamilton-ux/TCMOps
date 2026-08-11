import type { FastifyRequest, FastifyReply } from "fastify";
import { fraudService } from "./service";
import type { FraudResolutionReason } from "../../db/schema";

export const fraudController = {
  list: async (req: FastifyRequest, reply: FastifyReply) => {
    const { resolved, projectId } = req.query as { resolved?: string; projectId?: unknown };
    const filter = resolved === undefined ? undefined : resolved === "true";
    const parsedProjectId = projectId === undefined || projectId === null || projectId === "" ? undefined : Number(projectId);
    reply.send(
      await fraudService.list(filter, req.authUser!, Number.isFinite(parsedProjectId) ? parsedProjectId : undefined)
    );
  },

  getFlags: async (req: FastifyRequest, reply: FastifyReply) => {
    const { employeeId } = req.params as { employeeId: string };
    reply.send(await fraudService.getFlags(Number(employeeId)));
  },

  resolve: async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { reason, notes, denyHours } = req.body as {
      reason: FraudResolutionReason;
      notes?: string;
      denyHours?: boolean;
    };
    reply.send(await fraudService.resolve(Number(id), req.authUser!.id, reason, notes, denyHours));
  },

  investigate: async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    reply.send(await fraudService.investigate(Number(id)));
  },
};
