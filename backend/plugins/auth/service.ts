import { eq } from "drizzle-orm";
import { db } from "../../db";
import { users, fraudFlags, projects } from "../../db/schema";
import { comparePin, signToken, hashPin } from "../../lib/auth";
import { facialEngine } from "./engine";
import { HttpError } from "../../lib/http-error";

function omitSecrets<T extends { pinHash: string; facialTemplate: string | null }>(user: T) {
  const { pinHash, facialTemplate, ...safe } = user;
  return safe;
}

export const authService = {
  async login(phone: string, pin: string) {
    const [user] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
    if (!user || !user.active) throw new HttpError(401, "Invalid phone number or PIN");

    const valid = await comparePin(pin, user.pinHash);
    if (!valid) throw new HttpError(401, "Invalid phone number or PIN");

    const token = signToken({ id: user.id, role: user.role, teamId: user.teamId, projectId: user.projectId });
    return { token, user: omitSecrets(user) };
  },

  // Public self-registration via a project-specific QR code — see
  // backend/plugins/projects/service.ts for how the token is issued. Physical
  // possession of the printed code is the trust boundary here, so the new
  // account is active immediately rather than waiting on admin approval.
  async register(data: {
    token: string;
    name: string;
    phone: string;
    pin: string;
    language?: string;
    image: string;
  }) {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.registrationToken, data.token))
      .limit(1);
    if (!project) throw new HttpError(400, "Invalid or expired registration code.");
    if (!project.active) throw new HttpError(400, "This project is not currently accepting registrations.");

    const [existing] = await db.select().from(users).where(eq(users.phone, data.phone)).limit(1);
    if (existing) throw new HttpError(409, "This phone number is already registered.");

    const pinHash = await hashPin(data.pin);
    const [created] = await db
      .insert(users)
      .values({
        name: data.name,
        phone: data.phone,
        pinHash,
        role: "employee",
        projectId: project.id,
        active: true,
        language: data.language || null,
        facialTemplate: data.image,
      })
      .returning();

    const token = signToken({ id: created.id, role: created.role, teamId: created.teamId, projectId: created.projectId });
    return { token, user: omitSecrets(created) };
  },

  async me(userId: number) {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new HttpError(404, "User not found");
    return omitSecrets(user);
  },

  async captureFace(userId: number, image: string) {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new HttpError(404, "User not found");

    if (!user.facialTemplate) {
      // First capture we've ever seen for this person becomes their reference
      // template — never blocks the clock-in either way.
      await db.update(users).set({ facialTemplate: image }).where(eq(users.id, userId));
      return { match: true, confidence: null, enrolled: true, justEnrolled: true };
    }

    const result = await facialEngine.compareFaces(image, user.facialTemplate);

    if (!result.match) {
      await db.insert(fraudFlags).values({
        employeeId: userId,
        date: new Date().toISOString().slice(0, 10),
        projectId: user.projectId,
        teamId: user.teamId,
        type: "facial_mismatch",
        severity: 2,
        details: `Confidence: ${result.confidence}`,
      });
    }

    return { ...result, enrolled: true, justEnrolled: false };
  },
};
