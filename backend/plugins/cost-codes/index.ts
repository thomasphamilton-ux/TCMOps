import fp from "fastify-plugin";
import { costCodesController } from "./controller";
import { costCodesService } from "./service";
import { createCostCodeSchema, updateCostCodeSchema, importCostCodesSchema } from "./schema";
import { authenticate, requireRole } from "../../lib/auth";
import { requireProjectMatch } from "../../lib/project-scope";

export default fp(async (fastify) => {
  fastify.get("/cost-codes", { preHandler: [authenticate] }, costCodesController.list);

  fastify.post(
    "/cost-codes",
    { schema: createCostCodeSchema, preHandler: [authenticate, requireRole("admin", "manager")] },
    costCodesController.create
  );

  fastify.patch(
    "/cost-codes/:id",
    {
      schema: updateCostCodeSchema,
      preHandler: [
        authenticate,
        requireRole("admin", "manager"),
        requireProjectMatch("id", costCodesService.getProjectId),
      ],
    },
    costCodesController.update
  );

  fastify.post(
    "/cost-codes/import",
    { schema: importCostCodesSchema, preHandler: [authenticate, requireRole("admin", "manager")] },
    costCodesController.importExcel
  );

  fastify.get(
    "/cost-codes/import/template",
    { preHandler: [authenticate, requireRole("admin", "manager")] },
    costCodesController.downloadTemplate
  );
});
