import fp from "fastify-plugin";
import { companiesController } from "./controller";
import { createCompanySchema, updateCompanySchema } from "./schema";
import { authenticate, requireRole } from "../../lib/auth";

// Admin-only, full stop — companies are purely organizational (see the
// comment on the companies table in db/schema.ts) and don't factor into
// anyone else's access scope, so there's no reason for another role to see them.
export default fp(async (fastify) => {
  fastify.get("/companies", { preHandler: [authenticate, requireRole("admin")] }, companiesController.list);

  fastify.get("/companies/:id", { preHandler: [authenticate, requireRole("admin")] }, companiesController.getOne);

  fastify.post(
    "/companies",
    { schema: createCompanySchema, preHandler: [authenticate, requireRole("admin")] },
    companiesController.create
  );

  fastify.patch(
    "/companies/:id",
    { schema: updateCompanySchema, preHandler: [authenticate, requireRole("admin")] },
    companiesController.update
  );
});
