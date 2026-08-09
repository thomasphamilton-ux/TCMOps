import fp from "fastify-plugin";
import { teamsController } from "./controller";
import { teamsService } from "./service";
import { createTeamSchema, updateTeamSchema } from "./schema";
import { authenticate, requireRole } from "../../lib/auth";
import { requireProjectMatch } from "../../lib/project-scope";

export default fp(async (fastify) => {
  fastify.get(
    "/teams",
    { preHandler: [authenticate, requireRole("admin", "manager", "supervisor", "foreman")] },
    teamsController.list
  );

  fastify.get(
    "/teams/:id",
    { preHandler: [authenticate, requireRole("admin", "manager", "supervisor", "foreman")] },
    teamsController.getOne
  );

  fastify.post(
    "/teams",
    { schema: createTeamSchema, preHandler: [authenticate, requireRole("admin", "manager")] },
    teamsController.create
  );

  fastify.patch(
    "/teams/:id",
    {
      schema: updateTeamSchema,
      preHandler: [
        authenticate,
        requireRole("admin", "manager"),
        requireProjectMatch("id", teamsService.getProjectId),
      ],
    },
    teamsController.update
  );
});
