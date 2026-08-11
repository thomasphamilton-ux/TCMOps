import type { FastifyRequest, FastifyReply } from "fastify";
import { projectsService } from "./service";

export const projectsController = {
  list: async (req: FastifyRequest, reply: FastifyReply) => {
    reply.send(await projectsService.list(req.authUser!));
  },

  getOne: async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    reply.send(await projectsService.getById(Number(id), req.authUser!));
  },

  create: async (req: FastifyRequest, reply: FastifyReply) => {
    reply.code(201).send(await projectsService.create(req.body as any));
  },

  update: async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    reply.send(await projectsService.update(Number(id), req.body as any));
  },

  getRegistrationToken: async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    reply.send(await projectsService.getRegistrationToken(Number(id)));
  },

  regenerateRegistrationToken: async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    reply.send(await projectsService.regenerateRegistrationToken(Number(id)));
  },
};
