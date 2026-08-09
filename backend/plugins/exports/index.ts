import fp from "fastify-plugin";
import { exportsController } from "./controller";
import { generateExportSchema } from "./schema";
import { authenticate, requireRole } from "../../lib/auth";

export default fp(async (fastify) => {
  fastify.post(
    "/exports",
    { schema: generateExportSchema, preHandler: [authenticate, requireRole("admin", "manager", "supervisor")] },
    exportsController.generate
  );

  fastify.get(
    "/exports",
    { preHandler: [authenticate, requireRole("admin", "manager", "supervisor")] },
    exportsController.list
  );
});
