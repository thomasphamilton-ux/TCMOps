import fp from "fastify-plugin";
import { projectsController } from "./controller";
import { createProjectSchema, updateProjectSchema } from "./schema";
import { authenticate, requireRole } from "../../lib/auth";

// Projects are the multi-tenancy boundary. Only admin (global access) may
// create/manage projects, but manager/supervisor/foreman can read their own
// project — e.g. the Map page needs to show that project's geofence.
export default fp(async (fastify) => {
  fastify.get(
    "/projects",
    { preHandler: [authenticate, requireRole("admin", "manager", "supervisor", "foreman")] },
    projectsController.list
  );

  fastify.get(
    "/projects/:id",
    { preHandler: [authenticate, requireRole("admin", "manager", "supervisor", "foreman")] },
    projectsController.getOne
  );

  fastify.post(
    "/projects",
    { schema: createProjectSchema, preHandler: [authenticate, requireRole("admin")] },
    projectsController.create
  );

  fastify.patch(
    "/projects/:id",
    { schema: updateProjectSchema, preHandler: [authenticate, requireRole("admin")] },
    projectsController.update
  );

  // Never exposed via the routes above — see omitRegistrationToken in service.ts.
  fastify.get(
    "/projects/:id/registration-token",
    { preHandler: [authenticate, requireRole("admin")] },
    projectsController.getRegistrationToken
  );

  fastify.post(
    "/projects/:id/registration-token/regenerate",
    { preHandler: [authenticate, requireRole("admin")] },
    projectsController.regenerateRegistrationToken
  );
});
