import type { FastifyRequest, FastifyReply } from "fastify";
import { attendanceService } from "./service";
import type { AttendanceStatus } from "../../db/schema";

export const attendanceController = {
  set: async (req: FastifyRequest, reply: FastifyReply) => {
    const { employeeId, date, status, notes } = req.body as {
      employeeId: number;
      date: string;
      status: AttendanceStatus;
      notes?: string;
    };
    reply.send(await attendanceService.set(employeeId, date, status, notes, req.authUser!.id));
  },

  list: async (req: FastifyRequest, reply: FastifyReply) => {
    const { employeeId } = req.params as { employeeId: string };
    const { start, end } = req.query as { start?: string; end?: string };
    reply.send(await attendanceService.list(Number(employeeId), start, end));
  },

  listForDate: async (req: FastifyRequest, reply: FastifyReply) => {
    const { date } = req.query as { date: string };
    reply.send(await attendanceService.listForDate(date, req.authUser!));
  },

  remove: async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    reply.send(await attendanceService.remove(Number(id)));
  },
};
