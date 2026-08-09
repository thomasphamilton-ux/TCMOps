import type { FastifyRequest, FastifyReply } from "fastify";
import { usersService } from "./service";

export const usersController = {
  list: async (req: FastifyRequest, reply: FastifyReply) => {
    reply.send(await usersService.list(req.authUser!));
  },

  getOne: async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    reply.send(await usersService.getById(Number(id)));
  },

  create: async (req: FastifyRequest, reply: FastifyReply) => {
    reply.code(201).send(await usersService.create(req.body as any, req.authUser!));
  },

  update: async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    reply.send(await usersService.update(Number(id), req.body as any, req.authUser!));
  },

  importExcel: async (req: FastifyRequest, reply: FastifyReply) => {
    const { file } = req.body as { file: string };
    reply.send(await usersService.importExcel(file, req.authUser!));
  },

  downloadTemplate: async (req: FastifyRequest, reply: FastifyReply) => {
    const buffer = await usersService.buildImportTemplate(req.authUser!);
    reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", 'attachment; filename="users-import-template.xlsx"')
      .send(buffer);
  },
};
