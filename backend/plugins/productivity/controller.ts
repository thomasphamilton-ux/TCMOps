import type { FastifyRequest, FastifyReply } from "fastify";
import { productivityService } from "./service";

export const productivityController = {
  getTotals: async (req: FastifyRequest, reply: FastifyReply) => {
    const { employeeId } = req.params as { employeeId: string };
    const { start, end } = req.query as { start?: string; end?: string };
    const today = new Date().toISOString().slice(0, 10);
    reply.send(await productivityService.getTotals(Number(employeeId), start ?? today, end ?? today));
  },
};
