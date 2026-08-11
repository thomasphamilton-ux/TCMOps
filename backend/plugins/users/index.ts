import fp from "fastify-plugin";
import { usersController } from "./controller";
import { createUserSchema, updateUserSchema, importUsersSchema } from "./schema";
import { authenticate, requireRole } from "../../lib/auth";
import { requireProjectScopedSelfOrRole } from "../../lib/project-scope";

export default fp(async (fastify) => {
  fastify.get(
    "/users",
    { preHandler: [authenticate, requireRole("admin", "manager", "supervisor", "foreman")] },
    usersController.list
  );

  fastify.get(
    "/users/:id",
    {
      preHandler: [
        authenticate,
        requireRole("admin", "manager", "supervisor", "foreman", "employee"),
        requireProjectScopedSelfOrRole("id", "params"),
      ],
    },
    usersController.getOne
  );

  fastify.post(
    "/users",
    { schema: createUserSchema, preHandler: [authenticate, requireRole("admin", "manager")] },
    usersController.create
  );

  fastify.patch(
    "/users/:id",
    {
      schema: updateUserSchema,
      preHandler: [authenticate, requireRole("admin", "manager"), requireProjectScopedSelfOrRole("id", "params")],
    },
    usersController.update
  );

  fastify.delete(
    "/users/:id/facial-template",
    { preHandler: [authenticate, requireRole("admin", "manager"), requireProjectScopedSelfOrRole("id", "params")] },
    usersController.resetFacialTemplate
  );

  fastify.post(
    "/users/import",
    { schema: importUsersSchema, preHandler: [authenticate, requireRole("admin", "manager")] },
    usersController.importExcel
  );

  fastify.get(
    "/users/import/template",
    { preHandler: [authenticate, requireRole("admin", "manager")] },
    usersController.downloadTemplate
  );

  fastify.get(
    "/users/export",
    { preHandler: [authenticate, requireRole("admin", "manager")] },
    usersController.exportExcel
  );
});
