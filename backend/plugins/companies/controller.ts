import type { FastifyRequest, FastifyReply } from "fastify";
import { companiesService } from "./service";

export const companiesController = {
  list: async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.send(await companiesService.list());
  },

  getOne: async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    reply.send(await companiesService.getById(Number(id)));
  },

  create: async (req: FastifyRequest, reply: FastifyReply) => {
    reply.code(201).send(await companiesService.create(req.body as any));
  },

  update: async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    reply.send(await companiesService.update(Number(id), req.body as any));
  },
};
