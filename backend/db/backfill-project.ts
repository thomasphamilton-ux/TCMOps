import "dotenv/config";
import { eq, isNull, and, ne } from "drizzle-orm";
import { db, pool } from "./index";
import { projects, users, teams, costCodes } from "./schema";

/**
 * One-off, idempotent backfill for the multi-project rollout: creates a
 * "Demo Project" and assigns every existing team/cost-code/non-admin user
 * that has no project yet, so pre-existing dev data keeps working end-to-end
 * without a full reseed. Run with: npx tsx db/backfill-project.ts
 */
const DEMO_PROJECT = { code: "DEMO", name: "Demo Project" };

async function main() {
  let [project] = await db.select().from(projects).where(eq(projects.code, DEMO_PROJECT.code)).limit(1);
  if (!project) {
    [project] = await db.insert(projects).values(DEMO_PROJECT).returning();
    console.log(`Created project "${project.name}" (id ${project.id})`);
  } else {
    console.log(`Project "${project.name}" already exists (id ${project.id}).`);
  }

  const updatedTeams = await db
    .update(teams)
    .set({ projectId: project.id })
    .where(isNull(teams.projectId))
    .returning({ id: teams.id, name: teams.name });
  console.log(`Assigned ${updatedTeams.length} team(s) to "${project.name}": ${updatedTeams.map((t) => t.name).join(", ") || "(none)"}`);

  const updatedCostCodes = await db
    .update(costCodes)
    .set({ projectId: project.id })
    .where(isNull(costCodes.projectId))
    .returning({ id: costCodes.id, code: costCodes.code });
  console.log(`Assigned ${updatedCostCodes.length} cost code(s) to "${project.name}": ${updatedCostCodes.map((c) => c.code).join(", ") || "(none)"}`);

  const updatedUsers = await db
    .update(users)
    .set({ projectId: project.id })
    .where(and(isNull(users.projectId), ne(users.role, "admin")))
    .returning({ id: users.id, name: users.name, role: users.role });
  console.log(
    `Assigned ${updatedUsers.length} user(s) to "${project.name}": ${updatedUsers.map((u) => `${u.name} (${u.role})`).join(", ") || "(none)"}`
  );

  console.log("\nBackfill complete. Existing admin users remain global (no project).");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
