import fp from "fastify-plugin";
import { fraudController } from "./controller";
import { fraudService } from "./service";
import { listFlagsSchema, resolveFlagSchema } from "./schema";
import { authenticate, requireRole } from "../../lib/auth";
import { requireProjectScopedSelfOrRole, requireProjectScopedRecord } from "../../lib/project-scope";

export default fp(async (fastify) => {
  fastify.get(
    "/fraud",
    { schema: listFlagsSchema, preHandler: [authenticate, requireRole("admin", "manager", "supervisor")] },
    fraudController.list
  );

  fastify.get(
    "/fraud/:employeeId",
    {
      preHandler: [
        authenticate,
        requireRole("admin", "manager", "supervisor", "foreman", "employee"),
        requireProjectScopedSelfOrRole("employeeId", "params"),
      ],
    },
    fraudController.getFlags
  );

  fastify.patch(
    "/fraud/:id/resolve",
    {
      schema: resolveFlagSchema,
      preHandler: [
        authenticate,
        requireRole("admin", "manager", "supervisor"),
        requireProjectScopedRecord("id", fraudService.getEmployeeId),
      ],
    },
    fraudController.resolve
  );

  fastify.patch(
    "/fraud/:id/investigate",
    {
      preHandler: [
        authenticate,
        requireRole("admin", "manager", "supervisor"),
        requireProjectScopedRecord("id", fraudService.getEmployeeId),
      ],
    },
    fraudController.investigate
  );
});
