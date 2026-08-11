import "dotenv/config";
import { eq, isNull } from "drizzle-orm";
import { db, pool } from "./index";
import { dailyTime, perDiem, fraudFlags, users } from "./schema";

/**
 * One-off, idempotent backfill for the dailyTime/perDiem/fraudFlags
 * historical-snapshot columns added for cross-project audit accuracy (see the
 * comment on dailyTime.projectId in schema.ts). Rows created before this fix
 * have no snapshot yet, so the best available data is each employee's
 * CURRENT project/team — not perfectly accurate for anyone who's already
 * changed projects since the work was done, but far better than leaving
 * these rows unattributed. Everything created from now on captures the
 * correct historical value automatically at write time; this only needs to
 * run once (safe to re-run — only touches rows still missing a projectId).
 * Run with: npx tsx db/backfill-history-project.ts
 */
async function main() {
  const allUsers = await db.select({ id: users.id, projectId: users.projectId, teamId: users.teamId }).from(users);
  const byId = new Map(allUsers.map((u) => [u.id, u]));

  const staleDailyTime = await db
    .select({ id: dailyTime.id, employeeId: dailyTime.employeeId })
    .from(dailyTime)
    .where(isNull(dailyTime.projectId));
  for (const row of staleDailyTime) {
    const employee = byId.get(row.employeeId);
    if (!employee) continue;
    await db.update(dailyTime).set({ projectId: employee.projectId, teamId: employee.teamId }).where(eq(dailyTime.id, row.id));
  }
  console.log(`Backfilled ${staleDailyTime.length} dailyTime row(s).`);

  const stalePerDiem = await db
    .select({ id: perDiem.id, employeeId: perDiem.employeeId })
    .from(perDiem)
    .where(isNull(perDiem.projectId));
  for (const row of stalePerDiem) {
    const employee = byId.get(row.employeeId);
    if (!employee) continue;
    await db.update(perDiem).set({ projectId: employee.projectId, teamId: employee.teamId }).where(eq(perDiem.id, row.id));
  }
  console.log(`Backfilled ${stalePerDiem.length} perDiem row(s).`);

  const staleFraudFlags = await db
    .select({ id: fraudFlags.id, employeeId: fraudFlags.employeeId })
    .from(fraudFlags)
    .where(isNull(fraudFlags.projectId));
  for (const row of staleFraudFlags) {
    const employee = byId.get(row.employeeId);
    if (!employee) continue;
    await db.update(fraudFlags).set({ projectId: employee.projectId, teamId: employee.teamId }).where(eq(fraudFlags.id, row.id));
  }
  console.log(`Backfilled ${staleFraudFlags.length} fraudFlags row(s).`);

  console.log("\nBackfill complete. Rows created from now on capture their project/team automatically at write time.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
