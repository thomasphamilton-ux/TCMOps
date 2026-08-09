import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import type { FastifyRequest, FastifyReply } from "fastify";
import type { Role } from "../db/schema";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not set. Add it to .env before starting the server.");
}
const JWT_EXPIRES_IN = "12h";

export interface AuthUser {
  id: number;
  role: Role;
  teamId: number | null;
  // Multi-tenancy boundary: null only for admin (global access). Every other
  // role is scoped to exactly one project — see backend/lib/project-scope.ts.
  projectId: number | null;
}

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET as string, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): AuthUser {
  return jwt.verify(token, JWT_SECRET as string) as AuthUser;
}

export function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

export function comparePin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

/**
 * Route preHandler: requires a valid bearer token. Attaches req.authUser.
 * Not registered globally on purpose — each plugin opts individual routes
 * in via `preHandler: [authenticate, ...]` so public routes (login) stay public
 * without relying on a path-matching skip-list.
 */
export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "Unauthorized" });
  }
  try {
    req.authUser = verifyToken(header.slice(7));
  } catch {
    return reply.code(401).send({ error: "Invalid or expired token" });
  }
}

/** Route preHandler: requires authenticate() to have run first, then checks role. */
export function requireRole(...roles: Role[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.authUser || !roles.includes(req.authUser.role)) {
      return reply.code(403).send({ error: "Forbidden" });
    }
  };
}

/** Allows the request through if the caller is one of `roles` OR is acting on their own record (id in params). */
export function requireSelfOrRole(paramName: string, ...roles: Role[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const targetId = Number((req.params as Record<string, string>)[paramName]);
    if (!req.authUser) return reply.code(401).send({ error: "Unauthorized" });
    if (req.authUser.id === targetId) return;
    if (roles.includes(req.authUser.role)) return;
    return reply.code(403).send({ error: "Forbidden" });
  };
}

/** Same as requireSelfOrRole, but reads the target id from the JSON body instead of the URL params. */
export function requireSelfOrRoleFromBody(fieldName: string, ...roles: Role[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as Record<string, unknown> | undefined;
    const targetId = Number(body?.[fieldName]);
    if (!req.authUser) return reply.code(401).send({ error: "Unauthorized" });
    if (req.authUser.id === targetId) return;
    if (roles.includes(req.authUser.role)) return;
    return reply.code(403).send({ error: "Forbidden" });
  };
}
