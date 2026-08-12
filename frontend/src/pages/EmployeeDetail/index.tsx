import { useState, useEffect, useCallback } from "react";
import { useParams, Link as RouterLink } from "react-router-dom";
import {
  Box,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Paper,
  TextField,
  Alert,
  Chip,
  Grid,
  Stack,
  Link,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import { useAuth } from "../../context/AuthContext";
import api from "../../api/client";
import ResolveFlagDialog from "../../components/ResolveFlagDialog";
import { FRAUD_RESOLUTION_REASONS } from "../../constants/fraudResolutionReasons";

interface UserDetail {
  id: number;
  name: string;
  phone: string;
  role: string;
  teamId: number | null;
  active: boolean;
  archived: boolean;
  facialEnrolled: boolean;
  classification: string | null;
  perDiemRate: number | null;
  eid: string | null;
  employmentType: string;
  contractCompany: string | null;
  ptoBalanceHours: number | null;
}

interface Team {
  id: number;
  name: string;
}

interface CostCode {
  id: number;
  code: string;
  description: string;
  allowsUnits: boolean;
}

interface ProductivityRow {
  costCodeId: number;
  code: string;
  description: string;
  hours: number;
  units: number;
}

interface DailyEntry {
  id: number;
  costCodeId: number;
  hours: number;
  units: number | null;
  notes: string | null;
  costCode: { code: string; description: string };
}

interface ClockEvent {
  id: number;
  type: "in" | "out";
  timestamp: string;
}

interface DailyRecord {
  id: number;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  workedMinutes: number | null;
  denied: boolean;
  deniedReason: string | null;
  entries: DailyEntry[];
  clockEvents: ClockEvent[];
}

interface LunchExceptionRow {
  id: number;
  date: string;
  reason: string;
  approved: boolean;
  loggedAt: string;
  approvedAt: string | null;
}

interface PerDiemRow {
  id: number;
  date: string;
  eligible: boolean;
  amount: number;
  reason: string | null;
}

interface FraudRow {
  id: number;
  date: string;
  type: string;
  severity: number;
  resolved: boolean;
  underInvestigation: boolean;
  resolutionReason: string | null;
  resolutionNotes: string | null;
}

interface EditLogRow {
  id: number;
  date: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  editedAt: string;
  editor: { name: string } | null;
}

const ATTENDANCE_STATUSES = ["excused", "unexcused", "vacation", "unpaid", "turnaround", "bereavement", "other"] as const;
type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

interface AttendanceRow {
  id: number;
  date: string;
  status: AttendanceStatus;
  notes: string | null;
  recorder: { name: string } | null;
}

function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  let d = new Date(`${start}T00:00:00Z`);
  const endD = new Date(`${end}T00:00:00Z`);
  while (d <= endD) {
    dates.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86_400_000);
  }
  return dates;
}

// Local calendar date (no UTC round-trip) — toISOString() would silently
// roll "today" forward during evening hours in timezones behind UTC (e.g. EDT).
function todayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultRange() {
  const end = todayLocal();
  const [y, m, d] = end.split("-").map(Number);
  const startDate = new Date(y, m - 1, d - 13);
  const start = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-${String(startDate.getDate()).padStart(2, "0")}`;
  return { start, end };
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface EditEntryState {
  id: number;
  costCodeId: number;
  hours: number;
  units: number | "";
  notes: string;
  deleted: boolean;
}

export default function EmployeeDetailPage() {
  const { id } = useParams();
  const { user: currentUser } = useAuth();
  const canEdit = currentUser?.role === "admin" || currentUser?.role === "manager" || currentUser?.role === "supervisor";
  const employeeId = Number(id);

  const [range, setRange] = useState(defaultRange());
  const [employee, setEmployee] = useState<UserDetail | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [productivity, setProductivity] = useState<{ totalHours: number; breakdown: ProductivityRow[] } | null>(null);
  const [daily, setDaily] = useState<DailyRecord[]>([]);
  const [perDiem, setPerDiem] = useState<PerDiemRow[]>([]);
  const [fraud, setFraud] = useState<FraudRow[]>([]);
  const [editLog, setEditLog] = useState<EditLogRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [attendanceDrafts, setAttendanceDrafts] = useState<Record<string, { status: AttendanceStatus | ""; notes: string }>>({});
  const [lunchExceptions, setLunchExceptions] = useState<LunchExceptionRow[]>([]);
  const [error, setError] = useState("");

  const canManageAttendance =
    currentUser?.role === "admin" ||
    currentUser?.role === "manager" ||
    currentUser?.role === "supervisor" ||
    (currentUser?.role === "foreman" && currentUser.teamId !== null && currentUser.teamId === employee?.teamId);

  const [editDay, setEditDay] = useState<DailyRecord | null>(null);
  const [editClockIn, setEditClockIn] = useState("");
  const [editClockOut, setEditClockOut] = useState("");
  const [editEntries, setEditEntries] = useState<EditEntryState[]>([]);
  const [editReason, setEditReason] = useState("");
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async () => {
    const requests = [
      api.get(`/users/${employeeId}`),
      api.get("/teams"),
      api.get("/cost-codes"),
      api.get(`/productivity/${employeeId}`, { params: range }),
      api.get(`/time/daily/${employeeId}`, { params: range }),
      api.get(`/per-diem/${employeeId}`),
      api.get(`/fraud/${employeeId}`),
      api.get(`/attendance/${employeeId}`, { params: range }),
      api.get(`/lunch-exceptions/${employeeId}`),
    ];
    if (canEdit) requests.push(api.get(`/time/edit-log/${employeeId}`, { params: range }));

    const [userRes, teamsRes, codesRes, prodRes, dailyRes, perDiemRes, fraudRes, attendanceRes, lunchRes, editLogRes] =
      await Promise.all(requests);

    setEmployee(userRes.data);
    setTeam(teamsRes.data.find((t: Team) => t.id === userRes.data.teamId) ?? null);
    setCostCodes(codesRes.data);
    setProductivity(prodRes.data);
    setDaily(dailyRes.data);
    setPerDiem(perDiemRes.data.filter((p: PerDiemRow) => p.date >= range.start && p.date <= range.end));
    setFraud(fraudRes.data.filter((f: FraudRow) => f.date >= range.start && f.date <= range.end));
    setAttendance(attendanceRes.data);
    const drafts: Record<string, { status: AttendanceStatus | ""; notes: string }> = {};
    for (const a of attendanceRes.data as AttendanceRow[]) {
      drafts[a.date] = { status: a.status, notes: a.notes ?? "" };
    }
    setAttendanceDrafts(drafts);
    setLunchExceptions(lunchRes.data.filter((l: LunchExceptionRow) => l.date >= range.start && l.date <= range.end));
    setEditLog(editLogRes?.data ?? []);
  }, [employeeId, range, canEdit]);

  useEffect(() => {
    load().catch(() => setError("Could not load employee data."));
  }, [load]);

  const openEdit = (day: DailyRecord) => {
    setEditDay(day);
    setEditClockIn(toLocalInput(day.clockIn));
    setEditClockOut(toLocalInput(day.clockOut));
    setEditEntries(
      day.entries.map((e) => ({
        id: e.id,
        costCodeId: e.costCodeId,
        hours: e.hours,
        units: e.units ?? "",
        notes: e.notes ?? "",
        deleted: false,
      }))
    );
    setEditReason("");
    setEditError("");
  };

  const closeEdit = () => setEditDay(null);

  const updateEditEntry = (i: number, patch: Partial<EditEntryState>) => {
    setEditEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  };

  const openEditForDate = (date: string) => {
    const day = daily.find((d) => d.date === date);
    if (day) openEdit(day);
  };

  const saveEdit = async () => {
    if (!editDay) return;
    setEditSaving(true);
    setEditError("");
    try {
      const clockInIso = editClockIn ? new Date(editClockIn).toISOString() : null;
      const clockOutIso = editClockOut ? new Date(editClockOut).toISOString() : null;
      const patch: { clockIn?: string | null; clockOut?: string | null; reason?: string } = {};
      if (clockInIso !== editDay.clockIn) patch.clockIn = clockInIso;
      if (clockOutIso !== editDay.clockOut) patch.clockOut = clockOutIso;
      if (Object.keys(patch).length > 0) {
        patch.reason = editReason || undefined;
        await api.patch(`/time/records/${editDay.id}`, patch);
      }

      for (const entry of editEntries) {
        const original = editDay.entries.find((e) => e.id === entry.id)!;
        if (entry.deleted) {
          await api.delete(`/time/daily/${entry.id}`, { data: { reason: editReason || undefined } });
          continue;
        }
        const changed =
          entry.costCodeId !== original.costCodeId ||
          entry.hours !== original.hours ||
          (entry.units === "" ? null : Number(entry.units)) !== original.units ||
          entry.notes !== (original.notes ?? "");
        if (changed) {
          await api.put(`/time/daily/${entry.id}`, {
            costCodeId: entry.costCodeId,
            hours: entry.hours,
            units: entry.units === "" ? undefined : Number(entry.units),
            notes: entry.notes || undefined,
            reason: editReason || undefined,
          });
        }
      }

      closeEdit();
      await load();
    } catch (err: any) {
      setEditError(err.response?.data?.error || "Could not save changes.");
    } finally {
      setEditSaving(false);
    }
  };

  const [resolvingFlagId, setResolvingFlagId] = useState<number | null>(null);

  const submitResolve = async (reason: string, notes: string, denyHours: boolean) => {
    if (resolvingFlagId === null) return;
    await api.patch(`/fraud/${resolvingFlagId}/resolve`, { reason, notes: notes || undefined, denyHours });
    setResolvingFlagId(null);
    await load();
  };

  const investigateFlag = async (flagId: number) => {
    await api.patch(`/fraud/${flagId}/investigate`);
    await load();
  };

  const updateAttendanceDraft = (date: string, patch: Partial<{ status: AttendanceStatus | ""; notes: string }>) => {
    setAttendanceDrafts((prev) => ({
      ...prev,
      [date]: { status: prev[date]?.status ?? "", notes: prev[date]?.notes ?? "", ...patch },
    }));
  };

  const saveAttendance = async (date: string) => {
    const draft = attendanceDrafts[date];
    if (!draft?.status) return;
    await api.post("/attendance", { employeeId, date, status: draft.status, notes: draft.notes || undefined });
    await load();
  };

  const clearAttendance = async (recordId: number) => {
    await api.delete(`/attendance/${recordId}`);
    await load();
  };

  const [loggingLunchDate, setLoggingLunchDate] = useState<string | null>(null);
  const [lunchReason, setLunchReason] = useState("");
  const [lunchError, setLunchError] = useState("");
  const [lunchSaving, setLunchSaving] = useState(false);

  const openLogLunchException = (date: string) => {
    setLoggingLunchDate(date);
    setLunchReason("");
    setLunchError("");
  };

  const submitLunchException = async () => {
    if (!loggingLunchDate || !lunchReason.trim()) return;
    setLunchSaving(true);
    setLunchError("");
    try {
      await api.post("/lunch-exceptions", { employeeId, date: loggingLunchDate, reason: lunchReason });
      setLoggingLunchDate(null);
      await load();
    } catch (err: any) {
      setLunchError(err.response?.data?.error || "Could not log lunch exception.");
    } finally {
      setLunchSaving(false);
    }
  };

  const approveLunchException = async (id: number) => {
    await api.patch(`/lunch-exceptions/${id}/approve`);
    await load();
  };

  const resetFacialTemplate = async () => {
    if (!employee) return;
    await api.delete(`/users/${employee.id}/facial-template`);
    await load();
  };

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!employee) return <Typography>Loading...</Typography>;

  const totalPerDiemCents = perDiem.filter((p) => p.eligible).reduce((sum, p) => sum + p.amount, 0);

  return (
    <Box>
      <Link component={RouterLink} to="/users" sx={{ mb: 1, display: "inline-block" }}>
        &larr; Back to Users
      </Link>
      <Typography variant="h4" gutterBottom>
        {employee.name}
      </Typography>

      <Stack direction="row" spacing={1} sx={{ mb: 3 }} flexWrap="wrap">
        <Chip label={employee.phone} />
        <Chip label={employee.role} color="primary" variant="outlined" />
        <Chip label={team ? team.name : "No team"} variant="outlined" />
        {employee.eid && <Chip label={`EID: ${employee.eid}`} variant="outlined" />}
        {employee.classification && <Chip label={employee.classification} variant="outlined" />}
        {employee.employmentType === "contract" && (
          <Chip
            label={employee.contractCompany ? `Contract: ${employee.contractCompany}` : "Contract"}
            color="secondary"
            variant="outlined"
          />
        )}
        {employee.perDiemRate != null && (
          <Chip label={`Per Diem: $${employee.perDiemRate.toFixed(2)}/day`} variant="outlined" />
        )}
        {employee.ptoBalanceHours != null && (
          <Chip label={`PTO: ${employee.ptoBalanceHours.toFixed(1)} hrs`} variant="outlined" />
        )}
        <Chip label={employee.active ? "Active" : "Inactive"} color={employee.active ? "success" : "default"} />
        {employee.archived && <Chip label="Archived" color="warning" variant="outlined" />}
        <Chip
          label={employee.facialEnrolled ? "Facial ID: Enrolled" : "Facial ID: Not enrolled"}
          color={employee.facialEnrolled ? "success" : "default"}
          variant="outlined"
          onDelete={canEdit && employee.facialEnrolled ? resetFacialTemplate : undefined}
          deleteIcon={canEdit && employee.facialEnrolled ? <span title="Reset — re-enrolls on next clock-in">↺</span> : undefined}
        />
      </Stack>

      <Paper sx={{ p: 2, mb: 3, display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
        <TextField
          label="Start Date"
          type="date"
          value={range.start}
          onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label="End Date"
          type="date"
          value={range.end}
          onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))}
          InputLabelProps={{ shrink: true }}
        />
        <Typography variant="body2" color="text.secondary">
          {productivity ? `${productivity.totalHours.toFixed(2)} hours` : ""}
          {" · "}
          {`$${(totalPerDiemCents / 100).toFixed(2)} per diem`}
        </Typography>
      </Paper>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Typography variant="h6" gutterBottom>
            Productivity by Cost Code
          </Typography>
          <Paper>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Code</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell align="right">Hours</TableCell>
                  <TableCell align="right">Units</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(productivity?.breakdown ?? []).map((r) => (
                  <TableRow key={r.costCodeId}>
                    <TableCell>{r.code}</TableCell>
                    <TableCell>{r.description}</TableCell>
                    <TableCell align="right">{r.hours.toFixed(2)}</TableCell>
                    <TableCell align="right">{r.units}</TableCell>
                  </TableRow>
                ))}
                {(!productivity || productivity.breakdown.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={4} align="center">
                      No entries in this range.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>

          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            Fraud Flags
          </Typography>
          <Paper>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Severity</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Reason</TableCell>
                  {canEdit && <TableCell>Actions</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {fraud.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>{f.date}</TableCell>
                    <TableCell>{f.type}</TableCell>
                    <TableCell align="right">{f.severity}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={f.resolved ? "Resolved" : f.underInvestigation ? "Investigating" : "Open"}
                        color={f.resolved ? "default" : f.underInvestigation ? undefined : "error"}
                        sx={!f.resolved && f.underInvestigation ? { bgcolor: "#6a1b9a", color: "#fff" } : undefined}
                      />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 220 }}>
                      {f.resolutionReason ? (
                        <span title={FRAUD_RESOLUTION_REASONS.find((r) => r.value === f.resolutionReason)?.label}>
                          {(FRAUD_RESOLUTION_REASONS.find((r) => r.value === f.resolutionReason)?.label ?? f.resolutionReason).split(
                            " — "
                          )[0]}
                        </span>
                      ) : (
                        "—"
                      )}
                      {f.resolutionNotes && (
                        <Typography variant="caption" color="text.secondary" display="block" title={f.resolutionNotes} noWrap>
                          {f.resolutionNotes}
                        </Typography>
                      )}
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <Stack direction="row" spacing={1}>
                          <Button size="small" onClick={() => openEditForDate(f.date)}>
                            Fix
                          </Button>
                          {!f.resolved && !f.underInvestigation && (
                            <Button size="small" onClick={() => investigateFlag(f.id)}>
                              Investigate
                            </Button>
                          )}
                          {!f.resolved && (
                            <Button size="small" onClick={() => setResolvingFlagId(f.id)}>
                              Resolve
                            </Button>
                          )}
                        </Stack>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {fraud.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={canEdit ? 6 : 5} align="center">
                      No flags in this range.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>

          {canEdit && (
            <>
              <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
                Edit History
              </Typography>
              <Paper>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>When</TableCell>
                      <TableCell>Date</TableCell>
                      <TableCell>Field</TableCell>
                      <TableCell>Change</TableCell>
                      <TableCell>By</TableCell>
                      <TableCell>Reason</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {editLog.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell>{new Date(e.editedAt).toLocaleString()}</TableCell>
                        <TableCell>{e.date}</TableCell>
                        <TableCell>{e.field}</TableCell>
                        <TableCell>
                          {e.oldValue ?? "—"} → {e.newValue ?? "—"}
                        </TableCell>
                        <TableCell>{e.editor?.name ?? "—"}</TableCell>
                        <TableCell>{e.reason ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                    {editLog.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} align="center">
                          No edits in this range.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Paper>
            </>
          )}
        </Grid>

        <Grid item xs={12} md={6}>
          <Typography variant="h6" gutterBottom>
            Daily Log
          </Typography>
          <Paper>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Clock In</TableCell>
                  <TableCell>Clock Out</TableCell>
                  <TableCell align="right">Worked Hrs</TableCell>
                  <TableCell align="right">Sessions</TableCell>
                  <TableCell>Cost Codes</TableCell>
                  <TableCell align="right">Per Diem</TableCell>
                  {(canEdit || canManageAttendance) && <TableCell />}
                </TableRow>
              </TableHead>
              <TableBody>
                {daily.map((d) => {
                  const pd = perDiem.find((p) => p.date === d.date);
                  const lunchException = lunchExceptions.find((l) => l.date === d.date);
                  return (
                    <TableRow key={d.id}>
                      <TableCell>
                        {d.date}
                        {d.denied && (
                          <Chip
                            size="small"
                            label="Denied"
                            color="error"
                            variant="outlined"
                            title={d.deniedReason ?? undefined}
                            sx={{ display: "block", mt: 0.5, width: "fit-content" }}
                          />
                        )}
                      </TableCell>
                      <TableCell>{d.clockIn ? new Date(d.clockIn).toLocaleTimeString() : "—"}</TableCell>
                      <TableCell>{d.clockOut ? new Date(d.clockOut).toLocaleTimeString() : "—"}</TableCell>
                      <TableCell align="right">
                        {d.workedMinutes != null ? (d.workedMinutes / 60).toFixed(2) : "—"}
                        {lunchException && (
                          <Chip
                            size="small"
                            label={lunchException.approved ? "No lunch (approved)" : "No lunch (pending)"}
                            color={lunchException.approved ? "success" : "warning"}
                            sx={{ display: "block", mt: 0.5 }}
                          />
                        )}
                      </TableCell>
                      <TableCell align="right">{Math.ceil(d.clockEvents.length / 2)}</TableCell>
                      <TableCell>
                        {d.entries.length > 0
                          ? d.entries.map((e) => `${e.costCode.code} (${e.hours.toFixed(1)}h)`).join(", ")
                          : "—"}
                      </TableCell>
                      <TableCell align="right">{pd?.eligible ? `$${(pd.amount / 100).toFixed(2)}` : "—"}</TableCell>
                      {(canEdit || canManageAttendance) && (
                        <TableCell>
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            {canEdit && (
                              <IconButton size="small" onClick={() => openEdit(d)} aria-label="Edit day">
                                <EditIcon fontSize="small" />
                              </IconButton>
                            )}
                            {canManageAttendance && !lunchException && (
                              <Button size="small" onClick={() => openLogLunchException(d.date)}>
                                No Lunch
                              </Button>
                            )}
                            {canEdit && lunchException && !lunchException.approved && (
                              <Button size="small" onClick={() => approveLunchException(lunchException.id)}>
                                Approve
                              </Button>
                            )}
                          </Stack>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
                {daily.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={canEdit || canManageAttendance ? 8 : 7} align="center">
                      No time logged in this range.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>

          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            Non-Clock Days
          </Typography>
          <Paper>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Notes</TableCell>
                  {canManageAttendance && <TableCell />}
                </TableRow>
              </TableHead>
              <TableBody>
                {dateRange(range.start, range.end)
                  .filter((date) => !daily.find((d) => d.date === date))
                  .map((date) => {
                    const record = attendance.find((a) => a.date === date);
                    const draft = attendanceDrafts[date] ?? { status: "", notes: "" };
                    const dirty = record ? draft.status !== record.status || draft.notes !== (record.notes ?? "") : !!draft.status;

                    if (!canManageAttendance) {
                      return (
                        <TableRow key={date}>
                          <TableCell>{date}</TableCell>
                          <TableCell>
                            {record ? <Chip size="small" label={record.status} /> : <Typography color="text.secondary">—</Typography>}
                          </TableCell>
                          <TableCell>{record?.notes ?? "—"}</TableCell>
                        </TableRow>
                      );
                    }

                    return (
                      <TableRow key={date}>
                        <TableCell>{date}</TableCell>
                        <TableCell>
                          <TextField
                            select
                            size="small"
                            value={draft.status}
                            onChange={(e) => updateAttendanceDraft(date, { status: e.target.value as AttendanceStatus })}
                            sx={{ minWidth: 140 }}
                          >
                            <MenuItem value="">—</MenuItem>
                            {ATTENDANCE_STATUSES.map((s) => (
                              <MenuItem key={s} value={s}>
                                {s}
                              </MenuItem>
                            ))}
                          </TextField>
                        </TableCell>
                        <TableCell>
                          <TextField
                            size="small"
                            value={draft.notes}
                            onChange={(e) => updateAttendanceDraft(date, { notes: e.target.value })}
                            placeholder="Notes"
                            fullWidth
                          />
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5}>
                            {dirty && (
                              <Button size="small" onClick={() => saveAttendance(date)}>
                                Save
                              </Button>
                            )}
                            {record && (currentUser?.role === "admin" || currentUser?.role === "supervisor") && (
                              <IconButton size="small" onClick={() => clearAttendance(record.id)} aria-label="Clear status">
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            )}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                {dateRange(range.start, range.end).filter((date) => !daily.find((d) => d.date === date)).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={canManageAttendance ? 4 : 3} align="center">
                      Every day in this range has a clock record.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>
        </Grid>
      </Grid>

      <Dialog open={editDay !== null} onClose={closeEdit} maxWidth="sm" fullWidth>
        <DialogTitle>Fix Time — {editDay?.date}</DialogTitle>
        <DialogContent>
          {editError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {editError}
            </Alert>
          )}

          <Stack direction="row" spacing={2} sx={{ mb: 2, mt: 1 }}>
            <TextField
              label="Clock In"
              type="datetime-local"
              value={editClockIn}
              onChange={(e) => setEditClockIn(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="Clock Out"
              type="datetime-local"
              value={editClockOut}
              onChange={(e) => setEditClockOut(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Stack>

          <Typography variant="subtitle2" gutterBottom>
            Cost Code Entries
          </Typography>
          {editEntries.map((entry, i) => (
            <Stack
              key={entry.id}
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ mb: 1, opacity: entry.deleted ? 0.4 : 1 }}
            >
              <TextField
                select
                size="small"
                label="Cost Code"
                value={entry.costCodeId}
                onChange={(e) => updateEditEntry(i, { costCodeId: Number(e.target.value) })}
                disabled={entry.deleted}
                sx={{ minWidth: 180 }}
              >
                {costCodes.map((cc) => (
                  <MenuItem key={cc.id} value={cc.id}>
                    {cc.code}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                label="Hours"
                type="number"
                value={entry.hours}
                onChange={(e) => updateEditEntry(i, { hours: Number(e.target.value) })}
                disabled={entry.deleted}
                sx={{ width: 90 }}
              />
              <TextField
                size="small"
                label="Units"
                type="number"
                value={entry.units}
                onChange={(e) => updateEditEntry(i, { units: e.target.value === "" ? "" : Number(e.target.value) })}
                disabled={entry.deleted}
                sx={{ width: 90 }}
              />
              <IconButton
                size="small"
                onClick={() => updateEditEntry(i, { deleted: !entry.deleted })}
                aria-label={entry.deleted ? "Undo remove" : "Remove entry"}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}

          <TextField
            label="Reason for change"
            value={editReason}
            onChange={(e) => setEditReason(e.target.value)}
            fullWidth
            multiline
            minRows={2}
            sx={{ mt: 2 }}
            placeholder="e.g. Employee forgot to clock out, corrected per timesheet review"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEdit}>Cancel</Button>
          <Button variant="contained" onClick={saveEdit} disabled={editSaving}>
            {editSaving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogActions>
      </Dialog>

      <ResolveFlagDialog
        open={resolvingFlagId !== null}
        onClose={() => setResolvingFlagId(null)}
        onSubmit={submitResolve}
      />

      <Dialog open={loggingLunchDate !== null} onClose={() => setLoggingLunchDate(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Log No-Lunch Exception — {loggingLunchDate}</DialogTitle>
        <DialogContent>
          {lunchError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {lunchError}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            The 30-minute lunch deduction still applies until a supervisor approves this.
          </Typography>
          <TextField
            label="Reason"
            value={lunchReason}
            onChange={(e) => setLunchReason(e.target.value)}
            fullWidth
            required
            multiline
            minRows={2}
            placeholder="e.g. Crew worked through lunch to finish the pour before rain"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLoggingLunchDate(null)}>Cancel</Button>
          <Button variant="contained" onClick={submitLunchException} disabled={!lunchReason.trim() || lunchSaving}>
            {lunchSaving ? "Logging..." : "Log Exception"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
