import type { FastifyRequest, FastifyReply } from "fastify";
import { lunchExceptionsService } from "./service";

export const lunchExceptionsController = {
  log: async (req: FastifyRequest, reply: FastifyReply) => {
    const { employeeId, date, reason } = req.body as { employeeId: number; date: string; reason: string };
    reply.code(201).send(await lunchExceptionsService.log(employeeId, date, reason, req.authUser!.id));
  },

  approve: async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    reply.send(await lunchExceptionsService.approve(Number(id), req.authUser!.id));
  },

  listPending: async (req: FastifyRequest, reply: FastifyReply) => {
    const { projectId } = req.query as { projectId?: unknown };
    const n = projectId === undefined || projectId === null || projectId === "" ? undefined : Number(projectId);
    reply.send(await lunchExceptionsService.listPending(req.authUser!, Number.isFinite(n) ? n : undefined));
  },

  getForEmployee: async (req: FastifyRequest, reply: FastifyReply) => {
    const { employeeId } = req.params as { employeeId: string };
    reply.send(await lunchExceptionsService.getForEmployee(Number(employeeId)));
  },
};
