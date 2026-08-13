import "dotenv/config";
import { sql, ne, ilike } from "drizzle-orm";
import { db, pool } from "./index";
import { users, teams, costCodes, projects, companies } from "./schema";

/**
 * One-off production cleanup: wipes every non-admin user, every cost code,
 * every team, the "Pecan" project, and the "Amteck" company — along with all
 * transactional history (time, attendance, per diem, fraud, pay inquiries,
 * time off requests, exports) tied to any of that. Admin logins are the only
 * thing left standing afterward.
 *
 * Irreversible — no backup is taken by this script. Run with:
 *   npx tsx db/reset-live-data.ts
 */
async function main() {
  console.log("=== Step 1: wiping all transactional/history tables ===");
  await db.execute(sql`
    TRUNCATE TABLE
      clock_events,
      daily_entries,
      daily_time,
      attendance_records,
      time_edit_log,
      lunch_exceptions,
      daily_submissions,
      per_diem,
      fraud_flags,
      pay_inquiries,
      time_off_requests,
      exports
    RESTART IDENTITY CASCADE
  `);
  console.log("Done.");

  console.log("\n=== Step 2: deleting all cost codes ===");
  const deletedCodes = await db.delete(costCodes).returning({ code: costCodes.code });
  console.log(`Deleted ${deletedCodes.length} cost code(s): ${deletedCodes.map((c) => c.code).join(", ") || "(none)"}`);

  console.log("\n=== Step 3: deleting all teams ===");
  const deletedTeams = await db.delete(teams).returning({ name: teams.name });
  console.log(`Deleted ${deletedTeams.length} team(s): ${deletedTeams.map((t) => t.name).join(", ") || "(none)"}`);

  console.log("\n=== Step 4: deleting all non-admin users ===");
  // Defensive: clear self-referencing archivedBy on the admins we're keeping,
  // in case one was ever archived/unarchived by someone about to be deleted
  // (that FK is RESTRICT, not set-null, so it would otherwise block step 4).
  await db.update(users).set({ archivedBy: null }).where(sql`role = 'admin'`);
  const deletedUsers = await db.delete(users).where(ne(users.role, "admin")).returning({ name: users.name, phone: users.phone, role: users.role });
  console.log(`Deleted ${deletedUsers.length} non-admin user(s):`);
  for (const u of deletedUsers) console.log(`  - ${u.name} (${u.phone}, ${u.role})`);

  const remainingAdmins = await db.select({ name: users.name, phone: users.phone }).from(users).where(sql`role = 'admin'`);
  console.log(`Remaining admin(s): ${remainingAdmins.map((a) => `${a.name} (${a.phone})`).join(", ") || "(none — check this!)"}`);

  console.log('\n=== Step 5: deleting the "Pecan" project ===');
  const deletedProjects = await db.delete(projects).where(ilike(projects.name, "%pecan%")).returning({ name: projects.name, code: projects.code });
  console.log(`Deleted ${deletedProjects.length} project(s): ${deletedProjects.map((p) => `${p.name} (${p.code})`).join(", ") || "(none matched \"pecan\")"}`);

  console.log('\n=== Step 6: deleting the "Amteck" company ===');
  const deletedCompanies = await db.delete(companies).where(ilike(companies.name, "%amteck%")).returning({ name: companies.name, code: companies.code });
  console.log(`Deleted ${deletedCompanies.length} company(ies): ${deletedCompanies.map((c) => `${c.name} (${c.code})`).join(", ") || "(none matched \"amteck\")"}`);

  const remainingProjects = await db.select({ name: projects.name }).from(projects);
  const remainingCompanies = await db.select({ name: companies.name }).from(companies);
  console.log(`\nRemaining project(s): ${remainingProjects.map((p) => p.name).join(", ") || "(none)"}`);
  console.log(`Remaining company(ies): ${remainingCompanies.map((c) => c.name).join(", ") || "(none)"}`);

  console.log("\nDone. Database is now admin-only.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
