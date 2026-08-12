import fp from "fastify-plugin";
import { timeOffRequestsController } from "./controller";
import { timeOffRequestsService } from "./service";
import {
  createTimeOffRequestSchema,
  listTimeOffRequestsSchema,
  approveTimeOffRequestSchema,
  denyTimeOffRequestSchema,
} from "./schema";
import { authenticate, requireRole } from "../../lib/auth";
import { requireProjectScopedRecord } from "../../lib/project-scope";

export default fp(async (fastify) => {
  // Always created for the caller themselves.
  fastify.post(
    "/time-off-requests",
    { schema: createTimeOffRequestSchema, preHandler: [authenticate] },
    timeOffRequestsController.create
  );

  // Role-scoped inside the service, same shape as /pay-inquiries.
  fastify.get(
    "/time-off-requests",
    { schema: listTimeOffRequestsSchema, preHandler: [authenticate] },
    timeOffRequestsController.list
  );

  // Stage 1: the employee's own team foreman (or a supervisor/manager/admin
  // in that project, as an override). Enforces the pending_foreman state in
  // the service itself.
  fastify.patch(
    "/time-off-requests/:id/foreman-approve",
    {
      schema: approveTimeOffRequestSchema,
      preHandler: [
        authenticate,
        requireRole("admin", "manager", "supervisor", "foreman"),
        requireProjectScopedRecord("id", timeOffRequestsService.getEmployeeId),
      ],
    },
    timeOffRequestsController.foremanApprove
  );

  // Stage 2: the project's supervisor (or manager/admin) — foreman can't
  // finalize their own stage-1 sign-off into full approval.
  fastify.patch(
    "/time-off-requests/:id/supervisor-approve",
    {
      schema: approveTimeOffRequestSchema,
      preHandler: [
        authenticate,
        requireRole("admin", "manager", "supervisor"),
        requireProjectScopedRecord("id", timeOffRequestsService.getEmployeeId),
      ],
    },
    timeOffRequestsController.supervisorApprove
  );

  // Stage 3, only reached for a turnaround request longer than the base
  // entitlement (see requiresManagerApproval in service.ts) — manager or
  // admin only, not supervisor/foreman.
  fastify.patch(
    "/time-off-requests/:id/manager-approve",
    {
      schema: approveTimeOffRequestSchema,
      preHandler: [
        authenticate,
        requireRole("admin", "manager"),
        requireProjectScopedRecord("id", timeOffRequestsService.getEmployeeId),
      ],
    },
    timeOffRequestsController.managerApprove
  );

  // Denial is available at any pending stage to any leadership tier in scope.
  fastify.patch(
    "/time-off-requests/:id/deny",
    {
      schema: denyTimeOffRequestSchema,
      preHandler: [
        authenticate,
        requireRole("admin", "manager", "supervisor", "foreman"),
        requireProjectScopedRecord("id", timeOffRequestsService.getEmployeeId),
      ],
    },
    timeOffRequestsController.deny
  );

  fastify.get(
    "/time-off-requests/:id/export-pdf",
    {
      preHandler: [
        authenticate,
        requireRole("admin", "manager", "supervisor"),
        requireProjectScopedRecord("id", timeOffRequestsService.getEmployeeId),
      ],
    },
    timeOffRequestsController.exportPdf
  );
});
