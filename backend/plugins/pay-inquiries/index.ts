import fp from "fastify-plugin";
import { payInquiriesController } from "./controller";
import { payInquiriesService } from "./service";
import { createPayInquirySchema, listPayInquiriesSchema, resolvePayInquirySchema } from "./schema";
import { authenticate, requireRole } from "../../lib/auth";
import { requireProjectScopedRecord } from "../../lib/project-scope";

export default fp(async (fastify) => {
  // Anyone can raise a pay inquiry about their own pay — it's always created
  // for the caller themselves (see payInquiriesController.create).
  fastify.post(
    "/pay-inquiries",
    { schema: createPayInquirySchema, preHandler: [authenticate] },
    payInquiriesController.create
  );

  // Role-scoped inside the service: employee sees only their own; foreman
  // sees their team's; manager/supervisor see their project's; admin sees all.
  fastify.get(
    "/pay-inquiries",
    { schema: listPayInquiriesSchema, preHandler: [authenticate] },
    payInquiriesController.list
  );

  fastify.patch(
    "/pay-inquiries/:id/resolve",
    {
      schema: resolvePayInquirySchema,
      preHandler: [
        authenticate,
        requireRole("admin", "manager", "supervisor", "foreman"),
        requireProjectScopedRecord("id", payInquiriesService.getEmployeeId),
      ],
    },
    payInquiriesController.resolve
  );
});
