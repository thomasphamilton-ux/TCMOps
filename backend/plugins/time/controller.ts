import type { FastifyRequest, FastifyReply } from "fastify";
import { timeService, CLOCK_OUT_ATTESTATION } from "./service";

export const timeController = {
  getAttestationText: async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.send({ text: CLOCK_OUT_ATTESTATION });
  },

  clockIn: async (req: FastifyRequest, reply: FastifyReply) => {
    const { employeeId, timestamp, image, lat, lng } = req.body as {
      employeeId: number;
      timestamp: string;
      image?: string;
      lat?: number;
      lng?: number;
    };
    reply.send(await timeService.clockIn(employeeId, timestamp, req.authUser!.id, image, lat, lng));
  },

  clockOut: async (req: FastifyRequest, reply: FastifyReply) => {
    const { employeeId, timestamp, image, signature, lat, lng } = req.body as {
      employeeId: number;
      timestamp: string;
      image?: string;
      signature?: string;
      lat?: number;
      lng?: number;
    };
    reply.send(await timeService.clockOut(employeeId, timestamp, req.authUser!.id, image, signature, lat, lng));
  },

  saveDaily: async (req: FastifyRequest, reply: FastifyReply) => {
    const { employeeId, date, entries } = req.body as {
      employeeId: number;
      date: string;
      entries: { costCodeId: number; hours: number; units?: number; notes?: string }[];
    };
    reply.send(await timeService.saveDaily(employeeId, date, entries, req.authUser!.id));
  },

  updateEntry: async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { reason, ...data } = req.body as { reason?: string; [key: string]: unknown };
    reply.send(await timeService.updateEntry(Number(id), data as any, req.authUser!.id, reason));
  },

  deleteEntry: async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { reason } = (req.body as { reason?: string }) ?? {};
    reply.send(await timeService.deleteEntry(Number(id), req.authUser!.id, reason));
  },

  correctDaily: async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { reason, ...patch } = req.body as { clockIn?: string | null; clockOut?: string | null; reason?: string };
    reply.send(await timeService.correctDaily(Number(id), patch, req.authUser!.id, reason));
  },

  getEditLog: async (req: FastifyRequest, reply: FastifyReply) => {
    const { employeeId } = req.params as { employeeId: string };
    const { start, end } = req.query as { start?: string; end?: string };
    reply.send(await timeService.getEditLog(Number(employeeId), start, end));
  },

  getDaily: async (req: FastifyRequest, reply: FastifyReply) => {
    const { employeeId } = req.params as { employeeId: string };
    const { start, end } = req.query as { start?: string; end?: string };
    const today = new Date().toISOString().slice(0, 10);
    reply.send(await timeService.getDaily(Number(employeeId), start ?? today, end ?? today));
  },

  getLocations: async (req: FastifyRequest, reply: FastifyReply) => {
    const { start, end, projectId } = req.query as { start?: string; end?: string; projectId?: unknown };
    const today = new Date().toISOString().slice(0, 10);
    const n = projectId === undefined || projectId === null || projectId === "" ? undefined : Number(projectId);
    reply.send(
      await timeService.getLocations(start ?? today, end ?? today, req.authUser!, Number.isFinite(n) ? n : undefined)
    );
  },
};
