import { useState, useEffect, useCallback } from "react";
import { Box, Typography, Button, MenuItem, TextField, Alert, IconButton, Stack, Paper, Chip, List, ListItem, ListItemText } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { useAuth } from "../../context/AuthContext";
import api from "../../api/client";

interface CostCode {
  id: number;
  code: string;
  description: string;
  allowsUnits: boolean;
  active: boolean;
}

interface Team {
  id: number;
  name: string;
}

interface SubmissionStatus {
  id: number;
  teamId: number;
  date: string;
  submittedAt: string;
  approvedBy: number | null;
  approvedAt: string | null;
}

interface CoverageIssue {
  employeeId: number;
  employeeName: string;
  issue: string;
  detail: string;
}

interface Entry {
  costCodeId: number | "";
  hours: number | "";
  units: number | "";
  notes: string;
}

interface UserOption {
  id: number;
  name: string;
  teamId: number | null;
}

// Local calendar date (no UTC round-trip) — toISOString() would silently
// roll this to tomorrow during evening hours in timezones behind UTC (e.g.
// EDT), which would save real time entries against the wrong date.
function todayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
const today = todayLocal();

export default function DailyPage() {
  const { user } = useAuth();
  const canPickForOthers =
    user?.role === "admin" || user?.role === "manager" || user?.role === "supervisor" || user?.role === "foreman";

  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [employees, setEmployees] = useState<UserOption[]>([]);
  const [targetEmployeeId, setTargetEmployeeId] = useState<number | null>(user?.id ?? null);
  const [date, setDate] = useState(today);
  const [underInvestigation, setUnderInvestigation] = useState(false);

  const [teams, setTeams] = useState<Team[]>([]);
  const [submissionTeamId, setSubmissionTeamId] = useState("");
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus | null>(null);
  const [coverageIssues, setCoverageIssues] = useState<CoverageIssue[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!canPickForOthers) return;
    api.get("/users").then((res) => {
      const all: UserOption[] = res.data;
      const scoped = user?.role === "foreman" ? all.filter((u) => u.teamId === user.teamId) : all;
      setEmployees(scoped);
    });
  }, [canPickForOthers, user]);

  const load = useCallback(async () => {
    if (!targetEmployeeId) return;
    const [codesRes, dailyRes, employeeRes] = await Promise.all([
      api.get("/cost-codes"),
      api.get(`/time/daily/${targetEmployeeId}`, { params: { start: date, end: date } }),
      api.get(`/users/${targetEmployeeId}`),
    ]);
    setCostCodes(codesRes.data);
    const day = dailyRes.data[0];
    const defaultCostCodeId = employeeRes.data.defaultCostCodeId as number | null;
    setEntries(
      day?.entries?.length
        ? day.entries.map((e: any) => ({
            costCodeId: e.costCodeId,
            hours: e.hours,
            units: e.units ?? "",
            notes: e.notes ?? "",
          }))
        // Blank day — pre-fill one row with this person's default cost code as a
        // convenience starting point. Still just a normal, freely editable row:
        // change it, clear it, or add more via "Add Entry" to split the day.
        : defaultCostCodeId != null
          ? [{ costCodeId: defaultCostCodeId, hours: "", units: "", notes: "" }]
          : []
    );
    setUnderInvestigation(!!day?.underInvestigation);
    setSaved(false);
  }, [targetEmployeeId, date]);

  useEffect(() => {
    load().catch(() => setError("Could not load daily entry."));
  }, [load]);

  useEffect(() => {
    if (!canPickForOthers) return;
    api.get("/teams").then((res) => setTeams(res.data));
  }, [canPickForOthers]);

  // Foreman always acts on their own team; everyone else with access picks
  // one (defaults to the first once teams load).
  useEffect(() => {
    if (!canPickForOthers || teams.length === 0 || submissionTeamId) return;
    if (user?.role === "foreman" && user.teamId) setSubmissionTeamId(String(user.teamId));
    else setSubmissionTeamId(String(teams[0].id));
  }, [canPickForOthers, teams, user, submissionTeamId]);

  const loadSubmission = useCallback(async () => {
    if (!canPickForOthers || !submissionTeamId) return;
    const [statusRes, coverageRes] = await Promise.all([
      api.get("/submissions/status", { params: { teamId: submissionTeamId, date } }),
      api.get("/submissions/coverage", { params: { teamId: submissionTeamId, date } }),
    ]);
    setSubmissionStatus(statusRes.data);
    setCoverageIssues(coverageRes.data);
  }, [canPickForOthers, submissionTeamId, date]);

  useEffect(() => {
    loadSubmission().catch(() => setSubmitError("Could not load submission status."));
  }, [loadSubmission]);

  const submitForApproval = async () => {
    if (!submissionTeamId) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      await api.post("/submissions", { teamId: Number(submissionTeamId), date });
      await loadSubmission();
    } catch (err: any) {
      setSubmitError(err.response?.data?.error || "Could not submit for approval.");
    } finally {
      setSubmitting(false);
    }
  };

  const updateEntry = (index: number, patch: Partial<Entry>) => {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  };

  const addEntry = () => setEntries((prev) => [...prev, { costCodeId: "", hours: "", units: "", notes: "" }]);
  const removeEntry = (index: number) => setEntries((prev) => prev.filter((_, i) => i !== index));

  const saveDaily = async () => {
    if (!targetEmployeeId) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await api.post("/time/daily", {
        employeeId: targetEmployeeId,
        date,
        entries: entries
          .filter((e) => e.costCodeId !== "" && e.hours !== "")
          .map((e) => ({
            costCodeId: Number(e.costCodeId),
            hours: Number(e.hours),
            units: e.units === "" ? undefined : Number(e.units),
            notes: e.notes || undefined,
          })),
      });
      setSaved(true);
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not save daily entry.");
    } finally {
      setSaving(false);
    }
  };

  const targetName =
    targetEmployeeId === user?.id ? "your" : `${employees.find((e) => e.id === targetEmployeeId)?.name ?? ""}'s`;

  return (
    <Box sx={{ maxWidth: 640 }}>
      <Typography variant="h4" gutterBottom>
        Daily Time Entry
      </Typography>

      {canPickForOthers && (
        <Paper sx={{ p: 2, mb: 2, display: "flex", gap: 2, flexWrap: "wrap" }}>
          <TextField
            select
            label="Employee"
            value={targetEmployeeId ?? ""}
            onChange={(e) => setTargetEmployeeId(Number(e.target.value))}
            sx={{ minWidth: 200 }}
          >
            {user && (
              <MenuItem value={user.id}>{user.name} (me)</MenuItem>
            )}
            {employees
              .filter((e) => e.id !== user?.id)
              .map((e) => (
                <MenuItem key={e.id} value={e.id}>
                  {e.name}
                </MenuItem>
              ))}
          </TextField>
          <TextField
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        </Paper>
      )}

      <Typography variant="subtitle1" sx={{ mb: 2 }} color="text.secondary">
        {canPickForOthers ? `Entering ${targetName} time for ${date}` : `For ${date}`}
      </Typography>

      {underInvestigation && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          🔍 This day is under investigation — cost-code hours can't be added or changed until it's resolved.
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {saved && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Saved.
        </Alert>
      )}

      {entries.map((entry, i) => (
        <Stack
          key={i}
          direction="row"
          spacing={2}
          sx={{ mb: 2, p: 2, border: "1px solid #ddd", borderRadius: 1 }}
          alignItems="center"
          flexWrap="wrap"
        >
          <TextField
            select
            label="Cost Code"
            value={entry.costCodeId}
            onChange={(e) => updateEntry(i, { costCodeId: Number(e.target.value) })}
            sx={{ minWidth: 200 }}
          >
            {costCodes
              // Hide deactivated codes from new selections, but keep whichever one
              // this row already has selected so an existing entry doesn't go blank.
              .filter((cc) => cc.active || cc.id === entry.costCodeId)
              .map((cc) => (
                <MenuItem key={cc.id} value={cc.id}>
                  {cc.code} — {cc.description}
                  {!cc.active ? " (inactive)" : ""}
                </MenuItem>
              ))}
          </TextField>
          <TextField
            label="Hours"
            type="number"
            value={entry.hours}
            onChange={(e) => updateEntry(i, { hours: e.target.value === "" ? "" : Number(e.target.value) })}
            sx={{ width: 100 }}
          />
          <TextField
            label="Units"
            type="number"
            value={entry.units}
            onChange={(e) => updateEntry(i, { units: e.target.value === "" ? "" : Number(e.target.value) })}
            sx={{ width: 100 }}
          />
          <TextField
            label="Notes"
            value={entry.notes}
            onChange={(e) => updateEntry(i, { notes: e.target.value })}
            sx={{ minWidth: 160, flexGrow: 1 }}
          />
          <IconButton onClick={() => removeEntry(i)} aria-label="Remove entry">
            <DeleteIcon />
          </IconButton>
        </Stack>
      ))}

      <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
        <Button variant="outlined" onClick={addEntry} disabled={underInvestigation}>
          Add Entry
        </Button>
        <Button variant="contained" onClick={saveDaily} disabled={saving || underInvestigation}>
          {saving ? "Saving..." : "Save Daily"}
        </Button>
      </Stack>

      {canPickForOthers && (
        <Paper sx={{ p: 2, mt: 4 }}>
          <Typography variant="h6" gutterBottom>
            Submit Day for Approval
          </Typography>

          <Stack direction="row" spacing={2} sx={{ mb: 2 }} alignItems="center" flexWrap="wrap">
            {user?.role === "foreman" ? (
              <Typography variant="body2" color="text.secondary">
                Team: {teams.find((t) => t.id === user.teamId)?.name ?? "—"}
              </Typography>
            ) : (
              <TextField
                select
                label="Team"
                size="small"
                value={submissionTeamId}
                onChange={(e) => setSubmissionTeamId(e.target.value)}
                sx={{ minWidth: 200 }}
              >
                {teams.map((t) => (
                  <MenuItem key={t.id} value={t.id}>
                    {t.name}
                  </MenuItem>
                ))}
              </TextField>
            )}

            {submissionStatus?.approvedAt ? (
              <Chip label="Approved" color="success" />
            ) : submissionStatus ? (
              <Chip label="Submitted — awaiting approval" color="warning" />
            ) : (
              <Chip label="Not submitted" />
            )}
          </Stack>

          {submitError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {submitError}
            </Alert>
          )}

          {coverageIssues.length > 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Can't submit yet — {coverageIssues.length} team member(s) need attention for {date}:
              </Typography>
              <List dense disablePadding>
                {coverageIssues.map((issue) => (
                  <ListItem key={issue.employeeId} disableGutters>
                    <ListItemText primary={issue.employeeName} secondary={issue.detail} />
                  </ListItem>
                ))}
              </List>
            </Alert>
          )}

          <Button
            variant="contained"
            onClick={submitForApproval}
            disabled={submitting || coverageIssues.length > 0 || !!submissionStatus}
          >
            {submitting ? "Submitting..." : "Submit for Approval"}
          </Button>
        </Paper>
      )}
    </Box>
  );
}
