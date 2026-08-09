import fp from "fastify-plugin";
import { attendanceController } from "./controller";
import { attendanceService } from "./service";
import { setAttendanceSchema } from "./schema";
import { authenticate, requireRole } from "../../lib/auth";
import { requireTimeEntryAccess } from "../time/access";
import { requireProjectScopedSelfOrRole, requireProjectScopedRecord } from "../../lib/project-scope";

export default fp(async (fastify) => {
  // Recording a non-clock-in status is a leadership action, same access rule
  // as allocating daily cost-code time: admin (anyone), manager/supervisor
  // (own project), or a foreman for someone on their own team. Employees
  // never set their own.
  fastify.post(
    "/attendance",
    { schema: setAttendanceSchema, preHandler: [authenticate, requireTimeEntryAccess("employeeId")] },
    attendanceController.set
  );

  fastify.get(
    "/attendance/:employeeId",
    {
      preHandler: [
        authenticate,
        requireRole("admin", "manager", "supervisor", "foreman", "employee"),
        requireProjectScopedSelfOrRole("employeeId", "params"),
      ],
    },
    attendanceController.list
  );

  fastify.get(
    "/attendance",
    { preHandler: [authenticate, requireRole("admin", "manager", "supervisor", "foreman")] },
    attendanceController.listForDate
  );

  fastify.delete(
    "/attendance/:id",
    {
      preHandler: [
        authenticate,
        requireRole("admin", "manager", "supervisor"),
        requireProjectScopedRecord("id", attendanceService.getEmployeeId),
      ],
    },
    attendanceController.remove
  );
});
