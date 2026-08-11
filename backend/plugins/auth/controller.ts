import type { FastifyRequest, FastifyReply } from "fastify";
import { authService } from "./service";

export const authController = {
  login: async (req: FastifyRequest, reply: FastifyReply) => {
    const { phone, pin } = req.body as { phone: string; pin: string };
    reply.send(await authService.login(phone, pin));
  },

  me: async (req: FastifyRequest, reply: FastifyReply) => {
    reply.send(await authService.me(req.authUser!.id));
  },

  register: async (req: FastifyRequest, reply: FastifyReply) => {
    reply.code(201).send(await authService.register(req.body as any));
  },

  captureFace: async (req: FastifyRequest, reply: FastifyReply) => {
    const { image } = req.body as { image: string };
    reply.send(await authService.captureFace(req.authUser!.id, image));
  },
};
