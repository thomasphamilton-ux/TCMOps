import fp from "fastify-plugin";
import { authController } from "./controller";
import { loginSchema, facialSchema, registerSchema } from "./schema";
import { authenticate } from "../../lib/auth";

export default fp(async (fastify) => {
  fastify.post("/auth/login", { schema: loginSchema }, authController.login);
  // Public — trust boundary is physical possession of the printed project QR code.
  fastify.post("/auth/register", { schema: registerSchema }, authController.register);
  fastify.get("/auth/me", { preHandler: [authenticate] }, authController.me);
  fastify.post("/auth/facial", { schema: facialSchema, preHandler: [authenticate] }, authController.captureFace);
});
