import { eq } from "drizzle-orm";
import { db } from "../../db";
import { users, fraudFlags } from "../../db/schema";
import { comparePin, signToken } from "../../lib/auth";
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

  async me(userId: number) {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new HttpError(404, "User not found");
    return omitSecrets(user);
  },

  async captureFace(userId: number, image: string) {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new HttpError(404, "User not found");

    if (!user.facialTemplate) {
      // Nobody has enrolled a template yet — don't block clock-in on it.
      return { match: true, confidence: null, enrolled: false };
    }

    const result = await facialEngine.compareFaces(image, user.facialTemplate);

    if (!result.match) {
      await db.insert(fraudFlags).values({
        employeeId: userId,
        date: new Date().toISOString().slice(0, 10),
        type: "facial_mismatch",
        severity: 2,
        details: `Confidence: ${result.confidence}`,
      });
    }

    return { ...result, enrolled: true };
  },
};
