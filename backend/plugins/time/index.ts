import fp from "fastify-plugin";
import { timeController } from "./controller";
import { timeService } from "./service";
import {
  clockInSchema,
  clockOutSchema,
  saveDailySchema,
  updateEntrySchema,
  deleteEntrySchema,
  correctDailySchema,
  locationsSchema,
} from "./schema";
import { authenticate, requireRole } from "../../lib/auth";
import { requireTimeEntryAccess } from "./access";
import { requireProjectScopedSelfOrRole, requireProjectScopedRecord } from "../../lib/project-scope";

export default fp(async (fastify) => {
  fastify.get(
    "/time/attestation-text",
    { preHandler: [authenticate] },
    timeController.getAttestationText
  );

  fastify.post(
    "/time/clock-in",
    {
      schema: clockInSchema,
      preHandler: [authenticate, requireProjectScopedSelfOrRole("employeeId", "body")],
    },
    timeController.clockIn
  );

  fastify.post(
    "/time/clock-out",
    {
      schema: clockOutSchema,
      preHandler: [authenticate, requireProjectScopedSelfOrRole("employeeId", "body")],
    },
    timeController.clockOut
  );

  fastify.post(
    "/time/daily",
    {
      schema: saveDailySchema,
      // Original daily allocation: self (leadership only), admin (any),
      // manager/supervisor (own project), or a foreman entering for someone
      // on their own team. Correcting an already-saved entry afterwards
      // (PUT/DELETE below) is admin/manager/supervisor only.
      preHandler: [authenticate, requireTimeEntryAccess("employeeId")],
    },
    timeController.saveDaily
  );

  // Correcting already-saved time (entry edits/deletes, clock in/out fixes) is
  // restricted to admin/manager/supervisor and always written to time_edit_log.
  fastify.put(
    "/time/daily/:id",
    {
      schema: updateEntrySchema,
      preHandler: [
        authenticate,
        requireRole("admin", "manager", "supervisor"),
        requireProjectScopedRecord("id", timeService.getEmployeeIdForEntry),
      ],
    },
    timeController.updateEntry
  );

  fastify.delete(
    "/time/daily/:id",
    {
      schema: deleteEntrySchema,
      preHandler: [
        authenticate,
        requireRole("admin", "manager", "supervisor"),
        requireProjectScopedRecord("id", timeService.getEmployeeIdForEntry),
      ],
    },
    timeController.deleteEntry
  );

  fastify.patch(
    "/time/records/:id",
    {
      schema: correctDailySchema,
      preHandler: [
        authenticate,
        requireRole("admin", "manager", "supervisor"),
        requireProjectScopedRecord("id", timeService.getEmployeeIdForDailyTime),
      ],
    },
    timeController.correctDaily
  );

  fastify.get(
    "/time/edit-log/:employeeId",
    {
      preHandler: [
        authenticate,
        requireRole("admin", "manager", "supervisor"),
        requireProjectScopedSelfOrRole("employeeId", "params"),
      ],
    },
    timeController.getEditLog
  );

  fastify.get(
    "/time/daily/:employeeId",
    {
      preHandler: [
        authenticate,
        requireRole("admin", "manager", "supervisor", "foreman", "employee"),
        requireProjectScopedSelfOrRole("employeeId", "params"),
      ],
    },
    timeController.getDaily
  );

  fastify.get(
    "/time/locations",
    {
      schema: locationsSchema,
      preHandler: [authenticate, requireRole("admin", "manager", "supervisor", "foreman")],
    },
    timeController.getLocations
  );
});
