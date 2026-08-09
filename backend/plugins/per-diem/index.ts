import fp from "fastify-plugin";
import { perDiemController } from "./controller";
import { evaluatePerDiemSchema } from "./schema";
import { authenticate, requireRole } from "../../lib/auth";
import { requireProjectScopedSelfOrRole } from "../../lib/project-scope";

export default fp(async (fastify) => {
  fastify.get(
    "/per-diem/:employeeId",
    {
      preHandler: [
        authenticate,
        requireRole("admin", "manager", "supervisor", "foreman", "employee"),
        requireProjectScopedSelfOrRole("employeeId", "params"),
      ],
    },
    perDiemController.list
  );

  fastify.post(
    "/per-diem",
    {
      schema: evaluatePerDiemSchema,
      preHandler: [authenticate, requireProjectScopedSelfOrRole("employeeId", "body")],
    },
    perDiemController.evaluate
  );
});
