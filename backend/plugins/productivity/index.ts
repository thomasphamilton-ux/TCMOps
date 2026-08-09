import fp from "fastify-plugin";
import { productivityController } from "./controller";
import { productivityQuerySchema } from "./schema";
import { authenticate, requireSelfOrRole } from "../../lib/auth";

export default fp(async (fastify) => {
  fastify.get(
    "/productivity/:employeeId",
    {
      schema: productivityQuerySchema,
      preHandler: [authenticate, requireSelfOrRole("employeeId", "admin", "manager", "supervisor", "foreman")],
    },
    productivityController.getTotals
  );
});
