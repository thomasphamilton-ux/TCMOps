import type { FastifyRequest, FastifyReply } from "fastify";
import { reportsService } from "./service";

function parseProjectId(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export const reportsController = {
  daily: async (req: FastifyRequest, reply: FastifyReply) => {
    const { date, projectId } = req.query as { date?: string; projectId?: unknown };
    const target = date ?? new Date().toISOString().slice(0, 10);
    reply.send(await reportsService.daily(target, req.authUser!, parseProjectId(projectId)));
  },

  weekly: async (req: FastifyRequest, reply: FastifyReply) => {
    const { start, end, projectId } = req.query as { start?: string; end?: string; projectId?: unknown };
    const today = new Date();
    const defaultEnd = today.toISOString().slice(0, 10);
    const defaultStart = new Date(today.getTime() - 6 * 86_400_000).toISOString().slice(0, 10);
    reply.send(await reportsService.weekly(start ?? defaultStart, end ?? defaultEnd, req.authUser!, parseProjectId(projectId)));
  },

  detail: async (req: FastifyRequest, reply: FastifyReply) => {
    const { start, end, projectId } = req.query as { start?: string; end?: string; projectId?: unknown };
    const today = new Date().toISOString().slice(0, 10);
    reply.send(await reportsService.detailRows(start ?? today, end ?? today, req.authUser!, parseProjectId(projectId)));
  },
};
