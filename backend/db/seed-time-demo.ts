import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "./index";
import { users, costCodes } from "./schema";
import { timeService } from "../plugins/time/service";
import { perDiemService } from "../plugins/per-diem/service";

/**
 * Populates sample daily time + productivity + per-diem data for the demo
 * employees created by seed-demo.ts, so the reporting pages have something
 * to show. Run with: npx tsx db/seed-time-demo.ts
 *
 * Idempotent-ish: re-running will hit "Already clocked in" for days already
 * seeded and just skip them (logged, not fatal).
 */
const DAYS_BACK = 13; // plus today = 14 calendar days, minus Sundays

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  const employees = await db.select().from(users).where(eq(users.role, "employee"));
  const codes = await db.select().from(costCodes);

  if (employees.length === 0 || codes.length === 0) {
    console.error("No employees or cost codes found — run seed-demo.ts first.");
    await pool.end();
    return;
  }

  const today = new Date();
  const workDates: string[] = [];
  for (let i = DAYS_BACK; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    if (d.getUTCDay() === 0) continue; // skip Sundays
    workDates.push(d.toISOString().slice(0, 10));
  }

  let created = 0;
  let skipped = 0;
  let anomaliesLeft = 2; // a couple of deliberate excessive-shift days for the fraud dashboard

  for (const dateStr of workDates) {
    const [y, m, d] = dateStr.split("-").map(Number);

    for (const emp of employees) {
      // Most days worked, but leave some gaps so it doesn't look robotic.
      if (Math.random() < 0.12) continue;

      const startHour = 6 + Math.random() * 0.75; // ~6:00-6:45 UTC start (offset varies)
      const startMinute = randInt(0, 59);
      const clockIn = new Date(Date.UTC(y, m - 1, d, Math.floor(startHour), startMinute));

      let shiftHours = 6.5 + Math.random() * 3; // 6.5–9.5h
      if (anomaliesLeft > 0 && Math.random() < 0.04) {
        shiftHours = 17; // deliberate excessive-shift anomaly for fraud flags
        anomaliesLeft--;
      }
      const clockOut = new Date(clockIn.getTime() + shiftHours * 3_600_000);

      try {
        await timeService.clockIn(emp.id, clockIn.toISOString(), emp.id);
        await timeService.clockOut(emp.id, clockOut.toISOString(), emp.id);
      } catch (err: any) {
        skipped++;
        continue;
      }

      // Split the shift across 1-2 cost codes.
      const numCodes = Math.random() < 0.6 ? 1 : 2;
      const chosenCodes = [...codes].sort(() => Math.random() - 0.5).slice(0, numCodes);
      let remaining = shiftHours;
      const finalEntries = chosenCodes.map((cc, idx) => {
        const isLast = idx === chosenCodes.length - 1;
        const hours = isLast ? remaining : Math.round((remaining / (chosenCodes.length - idx) / 2) * 4) / 4;
        remaining -= hours;
        return {
          costCodeId: cc.id,
          hours: Math.max(hours, 0.25),
          units: cc.allowsUnits ? randInt(3, 40) : undefined,
        };
      });

      await timeService.saveDaily(emp.id, dateStr, finalEntries, emp.id);

      const miles = Math.random() < 0.3 ? randInt(51, 120) : randInt(0, 40);
      const stayedOvernight = Math.random() < 0.05;
      await perDiemService.evaluate(emp.id, dateStr, miles, stayedOvernight);

      created++;
    }
  }

  console.log(`Seeded ${created} daily records across ${workDates.length} work dates (${skipped} skipped).`);
  console.log("Reload the Weekly, Dashboard, and Reports pages to see the data.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
