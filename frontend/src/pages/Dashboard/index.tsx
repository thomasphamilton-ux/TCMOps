import { Fragment, useState, useEffect, useMemo, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Grid,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  Alert,
  Collapse,
  ToggleButton,
  ToggleButtonGroup,
  TextField,
  MenuItem,
  Button,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import ResolveFlagDialog from "../../components/ResolveFlagDialog";

interface TeamTotals {
  team: string;
  hours: number;
  units: number;
  perDiemCents: number;
}

interface FraudFlag {
  id: number;
  employeeId: number;
  date: string;
  type: string;
  severity: number;
  resolved: boolean;
  underInvestigation: boolean;
}

interface LunchException {
  id: number;
  employeeId: number;
  date: string;
  reason: string;
  approved: boolean;
}

interface DetailRow {
  team: string;
  employeeId: number;
  employee: string;
  costCode: string;
  description: string;
  hours: number;
  units: number;
  perDiemCents: number;
}

// Clickable-row style, reused everywhere a Dashboard row drills into more detail —
// keep new metrics consistent with this same interaction pattern.
const clickableRowSx = { cursor: "pointer", "&:hover": { bgcolor: "action.hover" } };

// All date-only math below stays in LOCAL calendar terms throughout (never
// round-tripping through toISOString/UTC), so "today" and "this week" match
// what the user's own calendar says regardless of timezone or time of day.
// Mixing local getters with a UTC-based string conversion previously caused
// the computed Monday to silently roll forward a day during evening hours
// in timezones behind UTC (e.g. EDT).
function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateStr(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function mondayOf(d: Date) {
  const monday = new Date(d);
  const diffToMonday = (d.getDay() + 6) % 7;
  monday.setDate(d.getDate() - diffToMonday);
  return monday;
}

function addDays(dateStr: string, days: number) {
  const d = parseDateStr(dateStr);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

function formatWeekLabel(mondayStr: string) {
  const start = parseDateStr(mondayStr);
  const end = parseDateStr(addDays(mondayStr, 6));
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}, ${end.getFullYear()}`;
}

// Last 12 Mondays, most recent first, for the week-picker dropdown.
function recentWeekOptions() {
  const thisMonday = toDateStr(mondayOf(new Date()));
  const weeks: string[] = [];
  for (let i = 0; i < 12; i++) weeks.push(addDays(thisMonday, -7 * i));
  return weeks;
}

interface Project {
  id: number;
  code: string;
  name: string;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const canResolve = user?.role === "admin" || user?.role === "manager" || user?.role === "supervisor";
  const [mode, setMode] = useState<"daily" | "weekly">("daily");
  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()));
  const [selectedWeek, setSelectedWeek] = useState(toDateStr(mondayOf(new Date())));
  const weekOptions = useMemo(recentWeekOptions, []);

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");

  useEffect(() => {
    if (!isAdmin) return;
    api
      .get("/projects")
      .then((res) => setProjects(res.data))
      .catch(() => {});
  }, [isAdmin]);

  // Fetched once so flags outside the selected day/week — e.g. an older open
  // flag — still resolve to a real name instead of falling back to "Employee #N".
  const [allEmployees, setAllEmployees] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    api
      .get("/users")
      .then((res) => setAllEmployees(res.data))
      .catch(() => {});
  }, []);

  const range = mode === "daily" ? { start: selectedDate, end: selectedDate } : { start: selectedWeek, end: addDays(selectedWeek, 6) };
  const projectParam = isAdmin && selectedProjectId ? { projectId: Number(selectedProjectId) } : {};

  const [teamTotals, setTeamTotals] = useState<{ start: string; end: string; teams: TeamTotals[] } | null>(null);
  const [flags, setFlags] = useState<FraudFlag[]>([]);
  const [detail, setDetail] = useState<DetailRow[]>([]);
  const [lunchExceptions, setLunchExceptions] = useState<LunchException[]>([]);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [expandedCostCode, setExpandedCostCode] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const teamTotalsRequest =
      mode === "daily"
        ? api.get("/reports/daily", { params: { date: range.start, ...projectParam } })
        : api.get("/reports/weekly", { params: { start: range.start, end: range.end, ...projectParam } });

    Promise.all([
      teamTotalsRequest,
      api.get("/fraud", { params: { resolved: "false", ...projectParam } }),
      api.get("/reports/detail", { params: { start: range.start, end: range.end, ...projectParam } }),
      api.get("/lunch-exceptions", { params: projectParam }),
    ])
      .then(([totalsRes, fraudRes, detailRes, lunchRes]) => {
        setTeamTotals(totalsRes.data);
        setFlags(fraudRes.data);
        setDetail(detailRes.data);
        setLunchExceptions(lunchRes.data);
      })
      .catch(() => setError("Could not load dashboard data."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, range.start, range.end, selectedProjectId]);

  const approveLunchException = async (id: number) => {
    try {
      await api.patch(`/lunch-exceptions/${id}/approve`);
      setLunchExceptions((prev) => prev.filter((l) => l.id !== id));
    } catch {
      setError("Could not approve lunch exception.");
    }
  };

  const [resolvingFlagId, setResolvingFlagId] = useState<number | null>(null);

  const openResolveDialog = (e: MouseEvent, flagId: number) => {
    e.stopPropagation();
    setResolvingFlagId(flagId);
  };

  const submitResolve = async (reason: string, notes: string) => {
    if (resolvingFlagId === null) return;
    await api.patch(`/fraud/${resolvingFlagId}/resolve`, { reason, notes: notes || undefined });
    setFlags((prev) => prev.filter((f) => f.id !== resolvingFlagId));
    setResolvingFlagId(null);
  };

  const investigateFlag = async (e: MouseEvent, flagId: number) => {
    e.stopPropagation();
    try {
      await api.patch(`/fraud/${flagId}/investigate`);
      setFlags((prev) => prev.map((f) => (f.id === flagId ? { ...f, underInvestigation: true } : f)));
    } catch {
      setError("Could not flag for investigation.");
    }
  };

  const employeeNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const row of detail) map.set(row.employeeId, row.employee);
    for (const emp of allEmployees) map.set(emp.id, emp.name);
    return map;
  }, [detail, allEmployees]);

  const employeesByTeam = useMemo(() => {
    const map = new Map<string, Map<number, { name: string; hours: number; units: number; perDiemCents: number }>>();
    for (const row of detail) {
      if (!map.has(row.team)) map.set(row.team, new Map());
      const employees = map.get(row.team)!;
      const existing = employees.get(row.employeeId) ?? { name: row.employee, hours: 0, units: 0, perDiemCents: 0 };
      existing.hours += row.hours;
      existing.units += row.units;
      existing.perDiemCents = Math.max(existing.perDiemCents, row.perDiemCents);
      employees.set(row.employeeId, existing);
    }
    return map;
  }, [detail]);

  const costCodeTotals = useMemo(() => {
    const map = new Map<string, { description: string; hours: number; units: number }>();
    for (const row of detail) {
      if (row.costCode === "—") continue;
      const existing = map.get(row.costCode) ?? { description: row.description, hours: 0, units: 0 };
      existing.hours += row.hours;
      existing.units += row.units;
      map.set(row.costCode, existing);
    }
    return Array.from(map.entries())
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => b.hours - a.hours);
  }, [detail]);

  const employeesByCostCode = useMemo(() => {
    const map = new Map<string, Map<number, { name: string; team: string; hours: number; units: number }>>();
    for (const row of detail) {
      if (row.costCode === "—") continue;
      if (!map.has(row.costCode)) map.set(row.costCode, new Map());
      const employees = map.get(row.costCode)!;
      const existing = employees.get(row.employeeId) ?? { name: row.employee, team: row.team, hours: 0, units: 0 };
      existing.hours += row.hours;
      existing.units += row.units;
      employees.set(row.employeeId, existing);
    }
    return map;
  }, [detail]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!teamTotals) return <Typography>Loading...</Typography>;

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard — {mode === "daily" ? teamTotals.start : `${teamTotals.start} to ${teamTotals.end}`}
      </Typography>

      <Paper sx={{ p: 2, mb: 3, display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={mode}
          onChange={(_e, value) => value && setMode(value)}
        >
          <ToggleButton value="daily">Daily</ToggleButton>
          <ToggleButton value="weekly">Weekly</ToggleButton>
        </ToggleButtonGroup>

        {mode === "daily" ? (
          <TextField
            label="Date"
            type="date"
            size="small"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        ) : (
          <TextField
            select
            label="Week"
            size="small"
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(e.target.value)}
            sx={{ minWidth: 220 }}
          >
            {weekOptions.map((monday) => (
              <MenuItem key={monday} value={monday}>
                {formatWeekLabel(monday)}
              </MenuItem>
            ))}
          </TextField>
        )}

        {isAdmin && (
          <TextField
            select
            label="Project"
            size="small"
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="">All Projects</MenuItem>
            {projects.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Paper>

      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Typography variant="h6" gutterBottom>
            By Team
          </Typography>
          <Paper sx={{ mb: 3 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell />
                  <TableCell>Team</TableCell>
                  <TableCell align="right">Hours</TableCell>
                  <TableCell align="right">Units</TableCell>
                  <TableCell align="right">Per Diem</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {teamTotals.teams.map((t) => {
                  const isOpen = expandedTeam === t.team;
                  const members = employeesByTeam.get(t.team);
                  return (
                    <Fragment key={t.team}>
                      <TableRow hover sx={clickableRowSx} onClick={() => setExpandedTeam(isOpen ? null : t.team)}>
                        <TableCell sx={{ width: 32 }}>
                          {isOpen ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
                        </TableCell>
                        <TableCell>{t.team}</TableCell>
                        <TableCell align="right">{t.hours.toFixed(2)}</TableCell>
                        <TableCell align="right">{t.units}</TableCell>
                        <TableCell align="right">${(t.perDiemCents / 100).toFixed(2)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={5} sx={{ p: 0, border: isOpen ? undefined : "none" }}>
                          <Collapse in={isOpen} unmountOnExit>
                            <Table size="small">
                              <TableBody>
                                {members && members.size > 0 ? (
                                  Array.from(members.entries()).map(([employeeId, m]) => (
                                    <TableRow
                                      key={employeeId}
                                      hover
                                      sx={clickableRowSx}
                                      onClick={() => navigate(`/users/${employeeId}`)}
                                    >
                                      <TableCell sx={{ width: 32 }} />
                                      <TableCell sx={{ pl: 4 }}>{m.name}</TableCell>
                                      <TableCell align="right">{m.hours.toFixed(2)}</TableCell>
                                      <TableCell align="right">{m.units}</TableCell>
                                      <TableCell align="right">${(m.perDiemCents / 100).toFixed(2)}</TableCell>
                                    </TableRow>
                                  ))
                                ) : (
                                  <TableRow>
                                    <TableCell sx={{ width: 32 }} />
                                    <TableCell colSpan={4} sx={{ pl: 4 }}>
                                      No individual entries in this range.
                                    </TableCell>
                                  </TableRow>
                                )}
                              </TableBody>
                            </Table>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  );
                })}
                {teamTotals.teams.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      No time logged in this range.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>

          <Typography variant="h6" gutterBottom>
            By Cost Code
          </Typography>
          <Paper>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell />
                  <TableCell>Code</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell align="right">Hours</TableCell>
                  <TableCell align="right">Units</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {costCodeTotals.map((c) => {
                  const isOpen = expandedCostCode === c.code;
                  const contributors = employeesByCostCode.get(c.code);
                  return (
                    <Fragment key={c.code}>
                      <TableRow
                        hover
                        sx={clickableRowSx}
                        onClick={() => setExpandedCostCode(isOpen ? null : c.code)}
                      >
                        <TableCell sx={{ width: 32 }}>
                          {isOpen ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
                        </TableCell>
                        <TableCell>{c.code}</TableCell>
                        <TableCell>{c.description}</TableCell>
                        <TableCell align="right">{c.hours.toFixed(2)}</TableCell>
                        <TableCell align="right">{c.units}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={5} sx={{ p: 0, border: isOpen ? undefined : "none" }}>
                          <Collapse in={isOpen} unmountOnExit>
                            <Table size="small">
                              <TableBody>
                                {contributors && contributors.size > 0 ? (
                                  Array.from(contributors.entries()).map(([employeeId, c2]) => (
                                    <TableRow
                                      key={employeeId}
                                      hover
                                      sx={clickableRowSx}
                                      onClick={() => navigate(`/users/${employeeId}`)}
                                    >
                                      <TableCell sx={{ width: 32 }} />
                                      <TableCell sx={{ pl: 4 }}>{c2.name}</TableCell>
                                      <TableCell>{c2.team}</TableCell>
                                      <TableCell align="right">{c2.hours.toFixed(2)}</TableCell>
                                      <TableCell align="right">{c2.units}</TableCell>
                                    </TableRow>
                                  ))
                                ) : (
                                  <TableRow>
                                    <TableCell sx={{ width: 32 }} />
                                    <TableCell colSpan={4} sx={{ pl: 4 }}>
                                      No entries in this range.
                                    </TableCell>
                                  </TableRow>
                                )}
                              </TableBody>
                            </Table>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  );
                })}
                {costCodeTotals.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      No cost-code entries in this range.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>
        </Grid>

        <Grid item xs={12} md={5}>
          <Typography variant="h6" gutterBottom>
            Open Fraud Flags
          </Typography>
          <Paper>
            {flags.length === 0 && (
              <Typography color="text.secondary" sx={{ p: 2 }}>
                No open flags.
              </Typography>
            )}
            {flags.map((f) => (
              <Box
                key={f.id}
                onClick={() => navigate(`/users/${f.employeeId}`)}
                sx={{
                  ...clickableRowSx,
                  p: 1.5,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  "&:last-of-type": { borderBottom: "none" },
                }}
              >
                <Chip
                  size="small"
                  label={`Severity ${f.severity}`}
                  color={f.severity >= 3 ? "error" : f.severity === 2 ? "warning" : "default"}
                />
                <Typography variant="body2" sx={{ flexGrow: 1 }}>
                  {employeeNameById.get(f.employeeId) ?? `Employee #${f.employeeId}`} — {f.type} ({f.date})
                </Typography>
                {f.underInvestigation && (
                  <Chip size="small" label="Investigating" sx={{ bgcolor: "#6a1b9a", color: "#fff" }} />
                )}
                {canResolve && !f.underInvestigation && (
                  <Button size="small" onClick={(e) => investigateFlag(e, f.id)}>
                    Investigate
                  </Button>
                )}
                {canResolve && (
                  <Button size="small" onClick={(e) => openResolveDialog(e, f.id)}>
                    Resolve
                  </Button>
                )}
              </Box>
            ))}
          </Paper>

          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            Pending Lunch Exceptions
          </Typography>
          <Paper>
            {lunchExceptions.length === 0 && (
              <Typography color="text.secondary" sx={{ p: 2 }}>
                No pending lunch exceptions.
              </Typography>
            )}
            {lunchExceptions.map((l) => (
              <Box
                key={l.id}
                onClick={() => navigate(`/users/${l.employeeId}`)}
                sx={{
                  ...clickableRowSx,
                  p: 1.5,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  "&:last-of-type": { borderBottom: "none" },
                }}
              >
                <Typography variant="body2" sx={{ flexGrow: 1 }}>
                  {employeeNameById.get(l.employeeId) ?? `Employee #${l.employeeId}`} ({l.date}) — {l.reason}
                </Typography>
                {canResolve && (
                  <Button
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      approveLunchException(l.id);
                    }}
                  >
                    Approve
                  </Button>
                )}
              </Box>
            ))}
          </Paper>
        </Grid>
      </Grid>

      <ResolveFlagDialog
        open={resolvingFlagId !== null}
        onClose={() => setResolvingFlagId(null)}
        onSubmit={submitResolve}
      />
    </Box>
  );
}
