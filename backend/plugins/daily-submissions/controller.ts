import type { FastifyRequest, FastifyReply } from "fastify";
import { dailySubmissionsService } from "./service";

function parseProjectId(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export const dailySubmissionsController = {
  coverage: async (req: FastifyRequest, reply: FastifyReply) => {
    const { teamId, date } = req.query as { teamId: string; date: string };
    reply.send(await dailySubmissionsService.getCoverageIssues(Number(teamId), date));
  },

  status: async (req: FastifyRequest, reply: FastifyReply) => {
    const { teamId, date } = req.query as { teamId: string; date: string };
    reply.send(await dailySubmissionsService.getStatus(Number(teamId), date, req.authUser!));
  },

  submit: async (req: FastifyRequest, reply: FastifyReply) => {
    const { teamId, date } = req.body as { teamId: number; date: string };
    reply.code(201).send(await dailySubmissionsService.submit(teamId, date, req.authUser!));
  },

  approve: async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    reply.send(await dailySubmissionsService.approve(Number(id), req.authUser!));
  },

  listPending: async (req: FastifyRequest, reply: FastifyReply) => {
    const { projectId } = req.query as { projectId?: unknown };
    reply.send(await dailySubmissionsService.listPending(req.authUser!, parseProjectId(projectId)));
  },
};
