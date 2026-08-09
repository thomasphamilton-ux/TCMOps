import fp from "fastify-plugin";
import { lunchExceptionsController } from "./controller";
import { lunchExceptionsService } from "./service";
import { logLunchExceptionSchema, listLunchExceptionsSchema } from "./schema";
import { authenticate, requireRole } from "../../lib/auth";
import { requireTimeEntryAccess } from "../time/access";
import { requireProjectScopedSelfOrRole, requireProjectScopedRecord } from "../../lib/project-scope";

// Every employee gets a 30-minute unpaid lunch deduction by default (see
// backend/lib/timeclock.ts). Waiving it for a day is a two-step approval:
// a foreman-or-above logs the exception (same access rule as allocating
// cost-code hours — admin any, manager/supervisor own project, foreman own
// team), then only a supervisor-or-above can approve it.
export default fp(async (fastify) => {
  fastify.post(
    "/lunch-exceptions",
    { schema: logLunchExceptionSchema, preHandler: [authenticate, requireTimeEntryAccess("employeeId")] },
    lunchExceptionsController.log
  );

  fastify.patch(
    "/lunch-exceptions/:id/approve",
    {
      preHandler: [
        authenticate,
        requireRole("admin", "manager", "supervisor"),
        requireProjectScopedRecord("id", lunchExceptionsService.getEmployeeId),
      ],
    },
    lunchExceptionsController.approve
  );

  fastify.get(
    "/lunch-exceptions",
    { schema: listLunchExceptionsSchema, preHandler: [authenticate, requireRole("admin", "manager", "supervisor")] },
    lunchExceptionsController.listPending
  );

  fastify.get(
    "/lunch-exceptions/:employeeId",
    {
      preHandler: [
        authenticate,
        requireRole("admin", "manager", "supervisor", "foreman", "employee"),
        requireProjectScopedSelfOrRole("employeeId", "params"),
      ],
    },
    lunchExceptionsController.getForEmployee
  );
});
