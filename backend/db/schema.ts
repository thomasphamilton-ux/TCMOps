import {
  pgTable,
  serial,
  varchar,
  integer,
  boolean,
  timestamp,
  date,
  text,
  uniqueIndex,
  doublePrecision,
  time,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const ROLES = ["admin", "manager", "supervisor", "foreman", "employee"] as const;
export type Role = (typeof ROLES)[number];

export const ATTENDANCE_STATUSES = [
  "excused",
  "unexcused",
  "vacation",
  "turnaround",
  "bereavement",
  "other",
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const FRAUD_RESOLUTION_REASONS = [
  "approved",
  "unapproved",
  "working_remote",
  "gps_error",
  "corrected",
  "other",
] as const;
export type FraudResolutionReason = (typeof FRAUD_RESOLUTION_REASONS)[number];

// ---------------------------------------------------------------------------
// projects — the multi-tenancy boundary. Every team, cost code, and non-admin
// user belongs to exactly one project; admin has no project (global access).
// ---------------------------------------------------------------------------
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  active: boolean("active").notNull().default(true),
  // Geofence is optional per project — all three null means "not configured,
  // skip the check" (see backend/lib/geo.ts). When set, all three are present.
  geofenceLat: doublePrecision("geofence_lat"),
  geofenceLng: doublePrecision("geofence_lng"),
  geofenceRadiusM: integer("geofence_radius_m"),
  // Secret embedded in the printable self-registration QR code (see
  // backend/plugins/auth/service.ts register()). Lazily generated on first
  // request, rotatable from the Projects screen — never exposed on the
  // general list/getById response, only via the dedicated admin-only route.
  registrationToken: varchar("registration_token", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  codeIdx: uniqueIndex("projects_code_idx").on(table.code),
  registrationTokenIdx: uniqueIndex("projects_registration_token_idx").on(table.registrationToken),
}));

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  pinHash: varchar("pin_hash", { length: 255 }).notNull(),
  role: varchar("role", { length: 32 }).notNull().$type<Role>(),
  // Nullable: only admin has no project (global access). Enforced at the
  // application layer, not a DB constraint — see backend/plugins/users/service.ts.
  projectId: integer("project_id").references((): any => projects.id, { onDelete: "set null" }),
  teamId: integer("team_id").references((): any => teams.id, { onDelete: "set null" }),
  photoUrl: varchar("photo_url", { length: 255 }),
  facialTemplate: text("facial_template"),
  active: boolean("active").notNull().default(true),
  // Free-text site/trade classification (Helper, Apprentice, Journeyman, ...).
  // No fixed list — set per-user at setup time.
  classification: varchar("classification", { length: 64 }),
  // Reference rate (cents) for automatic per diem calculation — see
  // backend/plugins/per-diem/service.ts. Null means not eligible for per diem.
  perDiemRateCents: integer("per_diem_rate_cents"),
  // Individually waives the team shift-start rules (early-grace + floor —
  // see backend/lib/timeclock.ts) regardless of role. Every role above plain
  // "employee" is exempt automatically; this covers specific rank-and-file
  // workers who also need to be excluded (e.g. flexible-schedule employees).
  shiftExempt: boolean("shift_exempt").notNull().default(false),
  // Preferred language (e.g. "en", "es"). Currently just stored/displayed —
  // the UI itself isn't translated yet, this is groundwork for that later.
  language: varchar("language", { length: 10 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  phoneIdx: uniqueIndex("users_phone_idx").on(table.phone),
}));

// ---------------------------------------------------------------------------
// teams
// ---------------------------------------------------------------------------
export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  projectId: integer("project_id").references((): any => projects.id, { onDelete: "set null" }),
  foremanId: integer("foreman_id").references((): any => users.id, { onDelete: "set null" }),
  // Optional scheduled shift start (wall-clock "HH:MM:SS"). When set, drives the
  // clock-in early-grace window and the "time doesn't start until shift start"
  // floor — see backend/lib/timeclock.ts. Null means those rules are skipped.
  shiftStart: time("shift_start"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// cost codes
// ---------------------------------------------------------------------------
export const costCodes = pgTable("cost_codes", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).notNull(),
  projectId: integer("project_id").references((): any => projects.id, { onDelete: "set null" }),
  description: varchar("description", { length: 255 }).notNull(),
  allowsUnits: boolean("allows_units").notNull().default(false),
  unitType: varchar("unit_type", { length: 50 }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Composite: the same code string may be reused across different projects.
  codeIdx: uniqueIndex("cost_codes_project_code_idx").on(table.projectId, table.code),
}));

// ---------------------------------------------------------------------------
// daily time (one row per employee per work day = a clock-in/out shell)
// ---------------------------------------------------------------------------
export const dailyTime = pgTable("daily_time", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  // Rounded to the nearest 15 minutes and, for clockIn, floored to the team's
  // shift start when configured — see backend/lib/timeclock.ts. The raw actual
  // punch stays on clock_events for fraud/audit purposes; these two are the
  // payroll-facing values.
  clockIn: timestamp("clock_in"),
  clockOut: timestamp("clock_out"),
  // (clockOut - clockIn) minus the 30-minute lunch deduction, unless an
  // approved lunch exception exists for this employee+date. Null until clockOut.
  workedMinutes: integer("worked_minutes"),
  // Set when a fraud flag for this employee+date is resolved with "deny
  // hours" — the day's cost-code entries stay on the record for audit but are
  // excluded from report/dashboard/productivity totals (see reports/service.ts).
  denied: boolean("denied").notNull().default(false),
  deniedReason: text("denied_reason"),
  deniedBy: integer("denied_by").references(() => users.id),
  deniedAt: timestamp("denied_at"),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at"),
}, (table) => ({
  employeeDateIdx: uniqueIndex("daily_time_employee_date_idx").on(table.employeeId, table.date),
}));

// ---------------------------------------------------------------------------
// clock events (individual in/out punches — a day can have several pairs).
// daily_time.clock_in / clock_out track the first-in / last-out of the day
// so existing per-diem and fraud span checks keep working unchanged.
// ---------------------------------------------------------------------------
export const clockEvents = pgTable("clock_events", {
  id: serial("id").primaryKey(),
  dailyTimeId: integer("daily_time_id").notNull().references(() => dailyTime.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 8 }).notNull().$type<"in" | "out">(),
  timestamp: timestamp("timestamp").notNull(),
  image: text("image"),
  // Clock-out only: a drawn signature attesting to the exact wording stored
  // alongside it, so the record stays meaningful even if the wording changes later.
  signature: text("signature"),
  attestationText: text("attestation_text"),
  // Device-reported location at the moment of the punch, if the browser granted
  // permission — null otherwise. Used for the geofence check and the Map page.
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// daily entries (cost-code breakdown for a daily_time row)
// minutes is the source of truth; the API converts to/from hours at the edge.
// ---------------------------------------------------------------------------
export const dailyEntries = pgTable("daily_entries", {
  id: serial("id").primaryKey(),
  dailyTimeId: integer("daily_time_id").notNull().references(() => dailyTime.id, { onDelete: "cascade" }),
  costCodeId: integer("cost_code_id").notNull().references(() => costCodes.id),
  minutes: integer("minutes").notNull(),
  units: integer("units"),
  notes: text("notes"),
});

// ---------------------------------------------------------------------------
// attendance records — for days an employee does NOT clock in, so leadership
// can record why (excused, unexcused, vacation, turnaround, bereavement,
// other) instead of the day just showing up blank. Independent of daily_time;
// a day normally has one or the other, not both.
// ---------------------------------------------------------------------------
export const attendanceRecords = pgTable("attendance_records", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  status: varchar("status", { length: 32 }).notNull().$type<AttendanceStatus>(),
  notes: text("notes"),
  recordedBy: integer("recorded_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at"),
}, (table) => ({
  employeeDateIdx: uniqueIndex("attendance_employee_date_idx").on(table.employeeId, table.date),
}));

// ---------------------------------------------------------------------------
// time edit log (audit trail for corrections to already-recorded time —
// clock-in/out fixes and cost-code entry edits/deletes made by a supervisor
// or admin, as opposed to the employee's own original punches/entries).
// ---------------------------------------------------------------------------
export const timeEditLog = pgTable("time_edit_log", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  field: varchar("field", { length: 64 }).notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  reason: text("reason"),
  editedBy: integer("edited_by").notNull().references(() => users.id),
  editedAt: timestamp("edited_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// lunch exceptions — every employee gets a 30-minute unpaid lunch deduction
// by default (see backend/lib/timeclock.ts). To waive it for a given day, a
// foreman-or-above logs a reason here, then a supervisor-or-above approves it.
// ---------------------------------------------------------------------------
export const lunchExceptions = pgTable("lunch_exceptions", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  reason: text("reason").notNull(),
  loggedBy: integer("logged_by").notNull().references(() => users.id),
  loggedAt: timestamp("logged_at").defaultNow().notNull(),
  approved: boolean("approved").notNull().default(false),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  employeeDateIdx: uniqueIndex("lunch_exceptions_employee_date_idx").on(table.employeeId, table.date),
}));

// ---------------------------------------------------------------------------
// daily submissions — a foreman submits their team's day for approval once
// every member's hours are fully cost-coded or attendance-excused; a
// supervisor-or-above then approves it. One row per team per date.
// ---------------------------------------------------------------------------
export const dailySubmissions = pgTable("daily_submissions", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  submittedBy: integer("submitted_by").notNull().references(() => users.id),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
}, (table) => ({
  teamDateIdx: uniqueIndex("daily_submissions_team_date_idx").on(table.teamId, table.date),
}));

// ---------------------------------------------------------------------------
// per diem
// ---------------------------------------------------------------------------
export const perDiem = pgTable("per_diem", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  eligible: boolean("eligible").notNull().default(false),
  reason: text("reason"),
  amount: integer("amount").notNull().default(0), // cents
  // Once true, automatic weekly recalculation (see per-diem/service.ts)
  // leaves this row alone — a supervisor-or-above forced pay/no-pay for it.
  manualOverride: boolean("manual_override").notNull().default(false),
  overrideBy: integer("override_by").references(() => users.id),
  overrideAt: timestamp("override_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  employeeDateIdx: uniqueIndex("per_diem_employee_date_idx").on(table.employeeId, table.date),
}));

// ---------------------------------------------------------------------------
// fraud flags
// ---------------------------------------------------------------------------
export const fraudFlags = pgTable("fraud_flags", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  type: varchar("type", { length: 64 }).notNull(), // facial_mismatch | geo_mismatch | overlap | excessive_edits
  details: text("details"),
  severity: integer("severity").notNull().default(1),
  resolved: boolean("resolved").notNull().default(false),
  // While true, cost-code hours can't be allocated/edited for this employee+date
  // (see backend/plugins/time/service.ts) until the flag is investigated and resolved.
  underInvestigation: boolean("under_investigation").notNull().default(false),
  // Audit trail for how/why a flag was closed — required at resolve time (see
  // backend/plugins/fraud/service.ts), so these are only ever null pre-resolution.
  resolutionReason: varchar("resolution_reason", { length: 32 }),
  resolutionNotes: text("resolution_notes"),
  resolvedBy: integer("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// exports
// ---------------------------------------------------------------------------
export const exportsTable = pgTable("exports", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 32 }).notNull(), // daily | weekly
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  excelUrl: varchar("excel_url", { length: 255 }),
  pdfUrl: varchar("pdf_url", { length: 255 }),
  requestedBy: integer("requested_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// relations (used for query-builder joins in services)
// ---------------------------------------------------------------------------
export const projectsRelations = relations(projects, ({ many }) => ({
  users: many(users),
  teams: many(teams),
  costCodes: many(costCodes),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  project: one(projects, { fields: [users.projectId], references: [projects.id] }),
  team: one(teams, { fields: [users.teamId], references: [teams.id] }),
  dailyTime: many(dailyTime),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  project: one(projects, { fields: [teams.projectId], references: [projects.id] }),
  foreman: one(users, { fields: [teams.foremanId], references: [users.id] }),
  members: many(users),
}));

export const costCodesRelations = relations(costCodes, ({ one }) => ({
  project: one(projects, { fields: [costCodes.projectId], references: [projects.id] }),
}));

export const dailyTimeRelations = relations(dailyTime, ({ one, many }) => ({
  employee: one(users, { fields: [dailyTime.employeeId], references: [users.id] }),
  entries: many(dailyEntries),
  clockEvents: many(clockEvents),
}));

export const dailyEntriesRelations = relations(dailyEntries, ({ one }) => ({
  dailyTime: one(dailyTime, { fields: [dailyEntries.dailyTimeId], references: [dailyTime.id] }),
  costCode: one(costCodes, { fields: [dailyEntries.costCodeId], references: [costCodes.id] }),
}));

export const clockEventsRelations = relations(clockEvents, ({ one }) => ({
  dailyTime: one(dailyTime, { fields: [clockEvents.dailyTimeId], references: [dailyTime.id] }),
}));

export const timeEditLogRelations = relations(timeEditLog, ({ one }) => ({
  editor: one(users, { fields: [timeEditLog.editedBy], references: [users.id] }),
}));

export const attendanceRecordsRelations = relations(attendanceRecords, ({ one }) => ({
  employee: one(users, { fields: [attendanceRecords.employeeId], references: [users.id] }),
  recorder: one(users, { fields: [attendanceRecords.recordedBy], references: [users.id] }),
}));
