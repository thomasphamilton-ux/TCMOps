import type { FastifyRequest, FastifyReply } from "fastify";
import { exportsService } from "./service";

export const exportsController = {
  generate: async (req: FastifyRequest, reply: FastifyReply) => {
    const { type, startDate, endDate, notifyEmail } = req.body as {
      type: "daily" | "weekly";
      startDate: string;
      endDate: string;
      notifyEmail?: string;
    };
    reply.send(await exportsService.generate(type, startDate, endDate, req.authUser!, notifyEmail));
  },

  list: async (req: FastifyRequest, reply: FastifyReply) => {
    reply.send(await exportsService.list(req.authUser!));
  },
};
