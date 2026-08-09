import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "./index";
import { users } from "./schema";
import { hashPin } from "../lib/auth";

/**
 * Bootstraps the first admin account so there's a way to log in on a fresh
 * database. Run with: npm run db:seed
 */
async function main() {
  const phone = process.env.SEED_ADMIN_PHONE || "5555550100";
  const pin = process.env.SEED_ADMIN_PIN || "1234";

  const [existing] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
  if (existing) {
    console.log(`Admin ${phone} already exists (id ${existing.id}). Nothing to do.`);
    await pool.end();
    return;
  }

  const pinHash = await hashPin(pin);
  const [created] = await db.insert(users).values({ name: "Admin", phone, pinHash, role: "admin" }).returning();

  console.log(`Created admin user id=${created.id} phone=${phone} pin=${pin}`);
  console.log("Log in with these credentials, then change the PIN from the Users page.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
