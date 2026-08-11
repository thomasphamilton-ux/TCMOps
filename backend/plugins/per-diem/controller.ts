import type { FastifyRequest, FastifyReply } from "fastify";
import { perDiemService } from "./service";

export const perDiemController = {
  list: async (req: FastifyRequest, reply: FastifyReply) => {
    const { employeeId } = req.params as { employeeId: string };
    reply.send(await perDiemService.list(Number(employeeId)));
  },

  getWeek: async (req: FastifyRequest, reply: FastifyReply) => {
    const { employeeId } = req.params as { employeeId: string };
    const { weekStart } = req.query as { weekStart: string };
    reply.send(await perDiemService.calculateWeek(Number(employeeId), weekStart));
  },

  evaluate: async (req: FastifyRequest, reply: FastifyReply) => {
    const { employeeId, date, miles, stayedOvernight } = req.body as {
      employeeId: number;
      date: string;
      miles: number;
      stayedOvernight?: boolean;
    };
    reply.send(await perDiemService.evaluate(employeeId, date, miles, stayedOvernight ?? false));
  },

  override: async (req: FastifyRequest, reply: FastifyReply) => {
    const { employeeId, date, eligible } = req.body as { employeeId: number; date: string; eligible: boolean };
    reply.send(await perDiemService.setOverride(employeeId, date, eligible, req.authUser!.id));
  },

  clearOverride: async (req: FastifyRequest, reply: FastifyReply) => {
    const { employeeId, date } = req.body as { employeeId: number; date: string };
    await perDiemService.clearOverride(employeeId, date);
    reply.send(await perDiemService.getWeek(employeeId, date));
  },
};
