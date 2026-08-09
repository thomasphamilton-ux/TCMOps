import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "./index";
import { users, teams, costCodes, projects } from "./schema";
import { hashPin } from "../lib/auth";

/**
 * Populates demo data for reporting work: 1 project, 1 manager, 2 foreman-led
 * teams, 1 supervisor, 10 employees, and 6 cost codes. Run with: npx tsx db/seed-demo.ts
 */
const DEMO_PIN = "1234";
const DEMO_PROJECT = { code: "DEMO", name: "Demo Project" };

async function upsertUser(data: {
  name: string;
  phone: string;
  role: "admin" | "manager" | "supervisor" | "foreman" | "employee";
  teamId?: number | null;
  projectId?: number | null;
}) {
  const [existing] = await db.select().from(users).where(eq(users.phone, data.phone)).limit(1);
  if (existing) {
    console.log(`User ${data.phone} (${data.name}) already exists (id ${existing.id}). Skipping.`);
    return existing;
  }
  const pinHash = await hashPin(DEMO_PIN);
  const [created] = await db
    .insert(users)
    .values({
      name: data.name,
      phone: data.phone,
      pinHash,
      role: data.role,
      teamId: data.teamId ?? null,
      projectId: data.projectId ?? null,
    })
    .returning();
  console.log(`Created ${data.role} ${created.name} phone=${created.phone} pin=${DEMO_PIN}`);
  return created;
}

async function main() {
  // --- Project -----------------------------------------------------------
  let [project] = await db.select().from(projects).where(eq(projects.code, DEMO_PROJECT.code)).limit(1);
  if (!project) {
    [project] = await db.insert(projects).values(DEMO_PROJECT).returning();
    console.log(`Created project "${project.name}" (id ${project.id})`);
  } else {
    console.log(`Project "${project.name}" already exists (id ${project.id}). Skipping.`);
  }

  // --- Manager (runs this project day-to-day) -----------------------------
  await upsertUser({ name: "Ellis Monroe", phone: "5555550200", role: "manager", projectId: project.id });

  // --- Foremen + teams -------------------------------------------------
  const foreman1 = await upsertUser({ name: "Marcus Reid", phone: "5555550201", role: "foreman", projectId: project.id });
  const foreman2 = await upsertUser({ name: "Dana Whitfield", phone: "5555550202", role: "foreman", projectId: project.id });

  const teamDefs = [
    { name: "Crew A", foremanId: foreman1.id, projectId: project.id },
    { name: "Crew B", foremanId: foreman2.id, projectId: project.id },
  ];

  const createdTeams: { id: number; name: string }[] = [];
  for (const t of teamDefs) {
    const [existing] = await db.select().from(teams).where(eq(teams.name, t.name)).limit(1);
    if (existing) {
      console.log(`Team ${t.name} already exists (id ${existing.id}). Skipping.`);
      createdTeams.push(existing);
      continue;
    }
    const [created] = await db.insert(teams).values(t).returning();
    console.log(`Created team ${created.name} (foreman id ${t.foremanId})`);
    createdTeams.push(created);
  }

  // Point each foreman at their own team.
  await db.update(users).set({ teamId: createdTeams[0].id }).where(eq(users.id, foreman1.id));
  await db.update(users).set({ teamId: createdTeams[1].id }).where(eq(users.id, foreman2.id));

  // --- Supervisor (oversees all teams in this project, not tied to one) --
  await upsertUser({ name: "Priya Nathan", phone: "5555550203", role: "supervisor", projectId: project.id });

  // --- 10 employees, split 5/5 across the two crews ----------------------
  const employeeNames = [
    "Alex Carter",
    "Jordan Blake",
    "Sam Rivera",
    "Casey Nguyen",
    "Morgan Ellis",
    "Taylor Brooks",
    "Jamie Foster",
    "Riley Simmons",
    "Devon Marsh",
    "Quinn Alvarez",
  ];

  for (let i = 0; i < employeeNames.length; i++) {
    const team = createdTeams[i % 2];
    await upsertUser({
      name: employeeNames[i],
      phone: `55555503${String(i + 10).padStart(2, "0")}`,
      role: "employee",
      teamId: team.id,
      projectId: project.id,
    });
  }

  // --- Cost codes: FSA-<2 digits><letter>-700, middle segment unique -----
  const costCodeDefs = [
    { code: "FSA-01A-700", description: "Site Prep & Mobilization", allowsUnits: false, unitType: null },
    { code: "FSA-02B-700", description: "Conduit Installation", allowsUnits: true, unitType: "LF" },
    { code: "FSA-03C-700", description: "Wire Pull", allowsUnits: true, unitType: "LF" },
    { code: "FSA-04D-700", description: "Panel & Equipment Install", allowsUnits: true, unitType: "EA" },
    { code: "FSA-05E-700", description: "Fixture Install", allowsUnits: true, unitType: "EA" },
    { code: "FSA-06F-700", description: "Testing & Inspection", allowsUnits: false, unitType: null },
  ];

  for (const cc of costCodeDefs) {
    const [existing] = await db.select().from(costCodes).where(eq(costCodes.code, cc.code)).limit(1);
    if (existing) {
      console.log(`Cost code ${cc.code} already exists (id ${existing.id}). Skipping.`);
      continue;
    }
    const [created] = await db.insert(costCodes).values({ ...cc, projectId: project.id }).returning();
    console.log(`Created cost code ${created.code} — ${created.description}`);
  }

  console.log("\nDemo data ready. All demo users log in with PIN 1234.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
