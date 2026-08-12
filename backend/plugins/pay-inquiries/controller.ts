import type { FastifyRequest, FastifyReply } from "fastify";
import { payInquiriesService } from "./service";

export const payInquiriesController = {
  create: async (req: FastifyRequest, reply: FastifyReply) => {
    const { subject, message } = req.body as { subject: string; message: string };
    reply.code(201).send(await payInquiriesService.create(req.authUser!.id, { subject, message }));
  },

  list: async (req: FastifyRequest, reply: FastifyReply) => {
    const { resolved, projectId } = req.query as { resolved?: string; projectId?: number };
    reply.send(
      await payInquiriesService.list(req.authUser!, resolved === undefined ? undefined : resolved === "true", projectId)
    );
  },

  resolve: async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { response } = req.body as { response: string };
    reply.send(await payInquiriesService.resolve(Number(id), req.authUser!.id, response));
  },
};
