import { useState, useEffect, useCallback, Fragment } from "react";
import {
  Box,
  Typography,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TextField,
  MenuItem,
  Button,
  Alert,
  Stack,
  Chip,
  Collapse,
  IconButton,
  List,
  ListItem,
  ListItemText,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DeleteIcon from "@mui/icons-material/Delete";
import { useAuth } from "../../context/AuthContext";
import api from "../../api/client";

interface ForemanOption {
  id: number;
  name: string;
  role: string;
  teamId: number | null;
}

interface CostCode {
  id: number;
  code: string;
  description: string;
  active: boolean;
}

interface MemberSummary {
  employeeId: number;
  employeeName: string;
  defaultCostCodeId: number | null;
  clockIn: string | null;
  clockOut: string | null;
  workedMinutes: number;
  denied: boolean;
  underInvestigation: boolean;
  entries: { id: number; costCodeId: number; hours: number; units: number | null; notes: string | null }[];
}

interface TeamDaily {
  teamId: number;
  teamName: string;
  date: string;
  members: MemberSummary[];
  costCodes: CostCode[];
}

interface CoverageIssue {
  employeeId: number;
  employeeName: string;
  detail: string;
}

interface SubmissionStatus {
  id: number;
  submittedAt: string;
  approvedAt: string | null;
}

interface Entry {
  costCodeId: number | "";
  hours: number | "";
  units: number | "";
  notes: string;
}

// Local calendar date (no UTC round-trip) — same rule as everywhere else this
// app deals with "today", so evening hours in timezones behind UTC don't
// silently roll the default date forward.
function todayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
const today = todayLocal();

export default function TeamCodingPage() {
  const { user } = useAuth();
  const isForeman = user?.role === "foreman";

  const [foremen, setForemen] = useState<ForemanOption[]>([]);
  const [selectedForemanId, setSelectedForemanId] = useState<number | "">("");
  const [date, setDate] = useState(today);

  const [teamDaily, setTeamDaily] = useState<TeamDaily | null>(null);
  const [entriesByEmployee, setEntriesByEmployee] = useState<Record<number, Entry[]>>({});
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [savingEmployee, setSavingEmployee] = useState<number | null>(null);
  const [error, setError] = useState("");

  const [coverageIssues, setCoverageIssues] = useState<CoverageIssue[]>([]);
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (isForeman) return;
    api.get("/users").then((res) => {
      const list: ForemanOption[] = res.data;
      setForemen(list.filter((u) => u.role === "foreman"));
    });
  }, [isForeman]);

  const teamId = isForeman ? user?.teamId ?? null : foremen.find((f) => f.id === selectedForemanId)?.teamId ?? null;

  const load = useCallback(async () => {
    if (!teamId) {
      setTeamDaily(null);
      setCoverageIssues([]);
      setSubmissionStatus(null);
      return;
    }
    const [teamDailyRes, coverageRes, statusRes] = await Promise.all([
      api.get("/submissions/team-daily", { params: { teamId, date } }),
      api.get("/submissions/coverage", { params: { teamId, date } }),
      api.get("/submissions/status", { params: { teamId, date } }),
    ]);
    const data: TeamDaily = teamDailyRes.data;
    setTeamDaily(data);
    setCoverageIssues(coverageRes.data);
    setSubmissionStatus(statusRes.data);

    const nextEntries: Record<number, Entry[]> = {};
    const nextExpanded: Record<number, boolean> = {};
    for (const m of data.members) {
      nextEntries[m.employeeId] =
        m.entries.length > 0
          ? m.entries.map((e) => ({ costCodeId: e.costCodeId, hours: e.hours, units: e.units ?? "", notes: e.notes ?? "" }))
          : m.defaultCostCodeId != null
            ? [{ costCodeId: m.defaultCostCodeId, hours: "", units: "", notes: "" }]
            : [];
      const codedMinutes = (nextEntries[m.employeeId] ?? []).reduce(
        (sum, e) => sum + (e.hours === "" ? 0 : Math.round(Number(e.hours) * 60)),
        0
      );
      // Auto-expand whoever still needs coding, collapse whoever's already covered.
      nextExpanded[m.employeeId] = m.workedMinutes - codedMinutes > 0;
    }
    setEntriesByEmployee(nextEntries);
    setExpanded(nextExpanded);
  }, [teamId, date]);

  useEffect(() => {
    load().catch(() => setError("Could not load team data."));
  }, [load]);

  const updateEntry = (employeeId: number, index: number, patch: Partial<Entry>) => {
    setEntriesByEmployee((prev) => ({
      ...prev,
      [employeeId]: prev[employeeId].map((e, i) => (i === index ? { ...e, ...patch } : e)),
    }));
  };

  const addEntry = (employeeId: number) => {
    setEntriesByEmployee((prev) => ({
      ...prev,
      [employeeId]: [...(prev[employeeId] ?? []), { costCodeId: "", hours: "", units: "", notes: "" }],
    }));
  };

  const removeEntry = (employeeId: number, index: number) => {
    setEntriesByEmployee((prev) => ({ ...prev, [employeeId]: prev[employeeId].filter((_, i) => i !== index) }));
  };

  // Derived live from in-progress entries, not the last server snapshot, so
  // "remaining" updates as the foreman types — not just after they hit Save.
  const summarize = (member: MemberSummary) => {
    const entries = entriesByEmployee[member.employeeId] ?? [];
    const codedMinutes = entries.reduce((sum, e) => sum + (e.hours === "" ? 0 : Math.round(Number(e.hours) * 60)), 0);
    return { codedMinutes, remainingMinutes: Math.max(0, member.workedMinutes - codedMinutes) };
  };

  const saveMember = async (member: MemberSummary) => {
    setSavingEmployee(member.employeeId);
    setError("");
    try {
      const entries = entriesByEmployee[member.employeeId] ?? [];
      await api.post("/time/daily", {
        employeeId: member.employeeId,
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
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error || `Could not save ${member.employeeName}'s time.`);
    } finally {
      setSavingEmployee(null);
    }
  };

  const submitForApproval = async () => {
    if (!teamId) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      await api.post("/submissions", { teamId, date });
      await load();
    } catch (err: any) {
      setSubmitError(err.response?.data?.error || "Could not submit for approval.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 960 }}>
      <Typography variant="h4" gutterBottom>
        Team Cost Coding
      </Typography>

      <Paper sx={{ p: 2, mb: 2, display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
        {isForeman ? (
          <Typography variant="body2" color="text.secondary">
            Team: {teamDaily?.teamName ?? (user?.teamId ? "Loading..." : "You're not assigned to a team yet.")}
          </Typography>
        ) : (
          <TextField
            select
            label="Foreman"
            size="small"
            value={selectedForemanId}
            onChange={(e) => setSelectedForemanId(Number(e.target.value))}
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="">Select a foreman...</MenuItem>
            {foremen.map((f) => (
              <MenuItem key={f.id} value={f.id}>
                {f.name}
              </MenuItem>
            ))}
          </TextField>
        )}
        <TextField
          label="Date"
          type="date"
          size="small"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {!teamId && (
        <Typography color="text.secondary">
          {isForeman ? "No team assigned." : "Pick a foreman above to see their team."}
        </Typography>
      )}

      {teamDaily && teamId && (
        <>
          <Paper>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 32 }} />
                  <TableCell>Name</TableCell>
                  <TableCell align="right">Worked</TableCell>
                  <TableCell align="right">Coded</TableCell>
                  <TableCell align="right">Remaining</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {teamDaily.members.map((m) => {
                  const isOpen = !!expanded[m.employeeId];
                  const { codedMinutes, remainingMinutes } = summarize(m);
                  const entries = entriesByEmployee[m.employeeId] ?? [];
                  return (
                    <Fragment key={m.employeeId}>
                      <TableRow
                        hover
                        sx={{ cursor: "pointer" }}
                        onClick={() => setExpanded((p) => ({ ...p, [m.employeeId]: !p[m.employeeId] }))}
                      >
                        <TableCell>{isOpen ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}</TableCell>
                        <TableCell>{m.employeeName}</TableCell>
                        <TableCell align="right">{(m.workedMinutes / 60).toFixed(2)}h</TableCell>
                        <TableCell align="right">{(codedMinutes / 60).toFixed(2)}h</TableCell>
                        <TableCell align="right">
                          <Chip
                            size="small"
                            label={`${(remainingMinutes / 60).toFixed(2)}h`}
                            color={remainingMinutes > 0 ? "warning" : "success"}
                          />
                        </TableCell>
                        <TableCell>
                          {m.underInvestigation && <Chip size="small" label="Locked" color="secondary" />}
                          {m.denied && <Chip size="small" label="Denied" variant="outlined" sx={{ ml: 0.5 }} />}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={6} sx={{ p: 0, border: isOpen ? undefined : "none" }}>
                          <Collapse in={isOpen} unmountOnExit>
                            <Box sx={{ p: 2, bgcolor: "action.hover" }} onClick={(e) => e.stopPropagation()}>
                              {m.underInvestigation ? (
                                <Alert severity="warning">
                                  This day is under investigation — cost-code hours can't be added or changed until it's
                                  resolved.
                                </Alert>
                              ) : (
                                <>
                                  <Stack spacing={1}>
                                    {entries.map((entry, i) => (
                                      <Stack key={i} direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                        <TextField
                                          select
                                          size="small"
                                          label="Cost Code"
                                          value={entry.costCodeId}
                                          onChange={(e) => updateEntry(m.employeeId, i, { costCodeId: Number(e.target.value) })}
                                          sx={{ minWidth: 200 }}
                                        >
                                          {teamDaily.costCodes
                                            .filter((cc) => cc.active || cc.id === entry.costCodeId)
                                            .map((cc) => (
                                              <MenuItem key={cc.id} value={cc.id}>
                                                {cc.code} — {cc.description}
                                                {!cc.active ? " (inactive)" : ""}
                                              </MenuItem>
                                            ))}
                                        </TextField>
                                        <TextField
                                          size="small"
                                          label="Hours"
                                          type="number"
                                          value={entry.hours}
                                          onChange={(e) =>
                                            updateEntry(m.employeeId, i, { hours: e.target.value === "" ? "" : Number(e.target.value) })
                                          }
                                          sx={{ width: 90 }}
                                        />
                                        <TextField
                                          size="small"
                                          label="Units"
                                          type="number"
                                          value={entry.units}
                                          onChange={(e) =>
                                            updateEntry(m.employeeId, i, { units: e.target.value === "" ? "" : Number(e.target.value) })
                                          }
                                          sx={{ width: 90 }}
                                        />
                                        <TextField
                                          size="small"
                                          label="Notes"
                                          value={entry.notes}
                                          onChange={(e) => updateEntry(m.employeeId, i, { notes: e.target.value })}
                                          sx={{ minWidth: 140, flexGrow: 1 }}
                                        />
                                        <IconButton size="small" onClick={() => removeEntry(m.employeeId, i)} aria-label="Remove entry">
                                          <DeleteIcon fontSize="small" />
                                        </IconButton>
                                      </Stack>
                                    ))}
                                    {entries.length === 0 && (
                                      <Typography variant="body2" color="text.secondary">
                                        No cost code entries yet.
                                      </Typography>
                                    )}
                                  </Stack>
                                  <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                                    <Button size="small" variant="outlined" onClick={() => addEntry(m.employeeId)}>
                                      Add Entry
                                    </Button>
                                    <Button
                                      size="small"
                                      variant="contained"
                                      onClick={() => saveMember(m)}
                                      disabled={savingEmployee === m.employeeId}
                                    >
                                      {savingEmployee === m.employeeId ? "Saving..." : "Save"}
                                    </Button>
                                  </Stack>
                                </>
                              )}
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  );
                })}
                {teamDaily.members.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      No active team members.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>

          <Paper sx={{ p: 2, mt: 3 }}>
            <Typography variant="h6" gutterBottom>
              Submit Day for Approval
            </Typography>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
              {submissionStatus?.approvedAt ? (
                <Chip label="Approved — ready for payroll entry" color="success" />
              ) : submissionStatus ? (
                <Chip label="Submitted — awaiting supervisor approval" color="warning" />
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
        </>
      )}
    </Box>
  );
}
