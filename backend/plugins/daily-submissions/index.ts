import fp from "fastify-plugin";
import { dailySubmissionsController } from "./controller";
import { submitDailySchema } from "./schema";
import { authenticate, requireRole } from "../../lib/auth";

// Team-scope authorization (foreman: own team only; manager/supervisor: own
// project; admin: any) is enforced inside the service, since it's keyed on
// teamId rather than employeeId and doesn't fit the existing employeeId-based
// project-scope guards.
export default fp(async (fastify) => {
  fastify.get(
    "/submissions/coverage",
    { preHandler: [authenticate, requireRole("admin", "manager", "supervisor", "foreman")] },
    dailySubmissionsController.coverage
  );

  fastify.get(
    "/submissions/status",
    { preHandler: [authenticate, requireRole("admin", "manager", "supervisor", "foreman")] },
    dailySubmissionsController.status
  );

  fastify.post(
    "/submissions",
    { schema: submitDailySchema, preHandler: [authenticate, requireRole("admin", "manager", "supervisor", "foreman")] },
    dailySubmissionsController.submit
  );

  fastify.patch(
    "/submissions/:id/approve",
    { preHandler: [authenticate, requireRole("admin", "manager", "supervisor")] },
    dailySubmissionsController.approve
  );

  fastify.get(
    "/submissions",
    { preHandler: [authenticate, requireRole("admin", "manager", "supervisor")] },
    dailySubmissionsController.listPending
  );
});
