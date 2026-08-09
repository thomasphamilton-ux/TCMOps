import type { FastifyRequest, FastifyReply } from "fastify";
import { costCodesService } from "./service";

export const costCodesController = {
  list: async (req: FastifyRequest, reply: FastifyReply) => {
    reply.send(await costCodesService.list(req.authUser!));
  },

  create: async (req: FastifyRequest, reply: FastifyReply) => {
    reply.code(201).send(await costCodesService.create(req.body as any, req.authUser!));
  },

  update: async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    reply.send(await costCodesService.update(Number(id), req.body as any));
  },

  importExcel: async (req: FastifyRequest, reply: FastifyReply) => {
    const { file } = req.body as { file: string };
    reply.send(await costCodesService.importExcel(file, req.authUser!));
  },

  downloadTemplate: async (_req: FastifyRequest, reply: FastifyReply) => {
    const buffer = await costCodesService.buildImportTemplate();
    reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", 'attachment; filename="cost-codes-import-template.xlsx"')
      .send(buffer);
  },
};
