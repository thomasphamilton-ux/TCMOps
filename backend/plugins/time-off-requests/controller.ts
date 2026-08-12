import type { FastifyRequest, FastifyReply } from "fastify";
import { timeOffRequestsService } from "./service";
import { timeOffPdfBuilder } from "./pdf";

export const timeOffRequestsController = {
  create: async (req: FastifyRequest, reply: FastifyReply) => {
    const { startDate, endDate, hoursPerDay, type, notes } = req.body as {
      startDate: string;
      endDate: string;
      hoursPerDay: number;
      type: any;
      notes?: string;
    };
    reply
      .code(201)
      .send(await timeOffRequestsService.create(req.authUser!.id, { startDate, endDate, hoursPerDay, type, notes }));
  },

  list: async (req: FastifyRequest, reply: FastifyReply) => {
    const { status, projectId } = req.query as { status?: string; projectId?: number };
    reply.send(await timeOffRequestsService.list(req.authUser!, status, projectId));
  },

  foremanApprove: async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { signature } = req.body as { signature: string };
    reply.send(await timeOffRequestsService.foremanApprove(Number(id), req.authUser!.id, signature));
  },

  supervisorApprove: async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { signature } = req.body as { signature: string };
    reply.send(await timeOffRequestsService.supervisorApprove(Number(id), req.authUser!.id, signature));
  },

  managerApprove: async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { signature } = req.body as { signature: string };
    reply.send(await timeOffRequestsService.managerApprove(Number(id), req.authUser!.id, signature));
  },

  deny: async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { reason } = req.body as { reason: string };
    reply.send(await timeOffRequestsService.deny(Number(id), req.authUser!.id, reason));
  },

  exportPdf: async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const request = await timeOffRequestsService.getById(Number(id));
    if (!request) return reply.code(404).send({ error: "Time off request not found" });
    if (request.status !== "approved") return reply.code(409).send({ error: "Request is not fully approved yet" });

    const buffer = await timeOffPdfBuilder(request);
    await timeOffRequestsService.markSentToPayroll(request.id);

    reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="time-off-request-${request.id}.pdf"`)
      .send(buffer);
  },
};
