import fp from "fastify-plugin";
import { perDiemController } from "./controller";
import { evaluatePerDiemSchema, overridePerDiemSchema, clearOverrideSchema } from "./schema";
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

  fastify.get(
    "/per-diem/:employeeId/week",
    {
      preHandler: [
        authenticate,
        requireRole("admin", "manager", "supervisor", "foreman", "employee"),
        requireProjectScopedSelfOrRole("employeeId", "params"),
      ],
    },
    perDiemController.getWeek
  );

  fastify.post(
    "/per-diem",
    {
      schema: evaluatePerDiemSchema,
      preHandler: [authenticate, requireProjectScopedSelfOrRole("employeeId", "body")],
    },
    perDiemController.evaluate
  );

  // Manual pay/no-pay override — supervisor-or-above only (not foreman), per
  // "unless excused or authorized by supervisor".
  fastify.post(
    "/per-diem/override",
    {
      schema: overridePerDiemSchema,
      preHandler: [
        authenticate,
        requireRole("admin", "manager", "supervisor"),
        requireProjectScopedSelfOrRole("employeeId", "body"),
      ],
    },
    perDiemController.override
  );

  fastify.post(
    "/per-diem/override/clear",
    {
      schema: clearOverrideSchema,
      preHandler: [
        authenticate,
        requireRole("admin", "manager", "supervisor"),
        requireProjectScopedSelfOrRole("employeeId", "body"),
      ],
    },
    perDiemController.clearOverride
  );
});
