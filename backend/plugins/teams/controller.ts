import type { FastifyRequest, FastifyReply } from "fastify";
import { teamsService } from "./service";

export const teamsController = {
  list: async (req: FastifyRequest, reply: FastifyReply) => {
    reply.send(await teamsService.list(req.authUser!));
  },

  getOne: async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    reply.send(await teamsService.getById(Number(id)));
  },

  create: async (req: FastifyRequest, reply: FastifyReply) => {
    reply.code(201).send(await teamsService.create(req.body as any, req.authUser!));
  },

  update: async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    reply.send(await teamsService.update(Number(id), req.body as any, req.authUser!));
  },
};
