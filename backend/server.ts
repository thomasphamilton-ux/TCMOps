import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";

import authPlugin from "./plugins/auth";
import projectsPlugin from "./plugins/projects";
import usersPlugin from "./plugins/users";
import teamsPlugin from "./plugins/teams";
import costCodesPlugin from "./plugins/cost-codes";
import timePlugin from "./plugins/time";
import attendancePlugin from "./plugins/attendance";
import productivityPlugin from "./plugins/productivity";
import perDiemPlugin from "./plugins/per-diem";
import lunchExceptionsPlugin from "./plugins/lunch-exceptions";
import fraudPlugin from "./plugins/fraud";
import reportsPlugin from "./plugins/reports";
import exportsPlugin from "./plugins/exports";

const uploadsDir = path.join(__dirname, "uploads");
fs.mkdirSync(path.join(uploadsDir, "exports"), { recursive: true });

const fastify = Fastify({
  logger: {
    transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } },
  },
});

fastify.addHook("onRequest", async (req) => {
  req.log.info(`${req.method} ${req.url}`);
});

async function main() {
  // CORS_ORIGIN is a comma-separated allowlist for production (e.g. the real
  // domain). Left unset, falls back to reflecting any origin — fine for local
  // dev, not for production, hence the explicit `.env.example` warning.
  const corsOrigin = process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean);
  await fastify.register(cors, { origin: corsOrigin && corsOrigin.length > 0 ? corsOrigin : true });
  await fastify.register(fastifyStatic, {
    root: uploadsDir,
    prefix: "/files/",
  });

  fastify.get("/health", async () => ({ status: "ok" }));

  await fastify.register(authPlugin);
  await fastify.register(projectsPlugin);
  await fastify.register(usersPlugin);
  await fastify.register(teamsPlugin);
  await fastify.register(costCodesPlugin);
  await fastify.register(timePlugin);
  await fastify.register(attendancePlugin);
  await fastify.register(productivityPlugin);
  await fastify.register(perDiemPlugin);
  await fastify.register(lunchExceptionsPlugin);
  await fastify.register(fraudPlugin);
  await fastify.register(reportsPlugin);
  await fastify.register(exportsPlugin);

  fastify.setNotFoundHandler((req, reply) => {
    reply.code(404).send({ error: `Route ${req.method} ${req.url} not found` });
  });

  fastify.setErrorHandler((error, req, reply) => {
    req.log.error(error);
    const status = (error as any).statusCode ?? 500;
    reply.code(status).send({
      error: status === 500 ? "Internal server error" : error.message,
    });
  });

  const port = Number(process.env.PORT) || 3000;
  await fastify.listen({ port, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
