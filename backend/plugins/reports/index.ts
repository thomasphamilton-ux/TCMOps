import fp from "fastify-plugin";
import { reportsController } from "./controller";
import { dailyReportSchema, weeklyReportSchema } from "./schema";
import { authenticate, requireRole } from "../../lib/auth";

export default fp(async (fastify) => {
  fastify.get(
    "/reports/daily",
    { schema: dailyReportSchema, preHandler: [authenticate, requireRole("admin", "manager", "supervisor", "foreman")] },
    reportsController.daily
  );

  fastify.get(
    "/reports/weekly",
    { schema: weeklyReportSchema, preHandler: [authenticate, requireRole("admin", "manager", "supervisor", "foreman")] },
    reportsController.weekly
  );

  fastify.get(
    "/reports/detail",
    { preHandler: [authenticate, requireRole("admin", "manager", "supervisor", "foreman")] },
    reportsController.detail
  );

  fastify.get(
    "/reports/roster-summary",
    { preHandler: [authenticate, requireRole("admin", "manager", "supervisor", "foreman")] },
    reportsController.rosterSummary
  );
});
