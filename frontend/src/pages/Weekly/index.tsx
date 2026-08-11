import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Box,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Paper,
  Alert,
  Stack,
  Chip,
  TextField,
  MenuItem,
  Button,
} from "@mui/material";
import { useAuth } from "../../context/AuthContext";
import api from "../../api/client";

interface Breakdown {
  costCodeId: number;
  code: string;
  description: string;
  hours: number;
  units: number;
}

interface PerDiemRow {
  id: number | null;
  date: string;
  eligible: boolean;
  amount: number;
  reason: string | null;
  manualOverride: boolean;
}

interface UserOption {
  id: number;
  name: string;
  teamId: number | null;
}

// Local calendar date string (no UTC round-trip) — toISOString() here would
// silently roll the date forward during evening hours in timezones behind
// UTC (e.g. EDT), since it converts to UTC before formatting.
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

export default function WeeklyPage() {
  const { user } = useAuth();
  const canPickForOthers =
    user?.role === "admin" || user?.role === "manager" || user?.role === "supervisor" || user?.role === "foreman";
  const canOverride = user?.role === "admin" || user?.role === "manager" || user?.role === "supervisor";

  const weekOptions = useMemo(recentWeekOptions, []);
  const [selectedWeek, setSelectedWeek] = useState(weekOptions[0]);
  const end = addDays(selectedWeek, 6);

  const [employees, setEmployees] = useState<UserOption[]>([]);
  const [targetEmployeeId, setTargetEmployeeId] = useState<number | null>(user?.id ?? null);

  const [data, setData] = useState<{ totalHours: number; breakdown: Breakdown[] } | null>(null);
  const [perDiem, setPerDiem] = useState<PerDiemRow[]>([]);
  const [error, setError] = useState("");

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
    const [prodRes, perDiemRes] = await Promise.all([
      api.get(`/productivity/${targetEmployeeId}`, { params: { start: selectedWeek, end } }),
      api.get(`/per-diem/${targetEmployeeId}/week`, { params: { weekStart: selectedWeek } }),
    ]);
    setData(prodRes.data);
    setPerDiem(perDiemRes.data);
  }, [targetEmployeeId, selectedWeek, end]);

  useEffect(() => {
    load().catch(() => setError("Could not load weekly summary."));
  }, [load]);

  const setOverride = async (date: string, eligible: boolean) => {
    if (!targetEmployeeId) return;
    try {
      await api.post("/per-diem/override", { employeeId: targetEmployeeId, date, eligible });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not update per diem.");
    }
  };

  const clearOverride = async (date: string) => {
    if (!targetEmployeeId) return;
    try {
      await api.post("/per-diem/override/clear", { employeeId: targetEmployeeId, date });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not clear override.");
    }
  };

  const totalPerDiemCents = perDiem.filter((p) => p.eligible).reduce((sum, p) => sum + p.amount, 0);
  const targetName =
    targetEmployeeId === user?.id ? "Your" : `${employees.find((e) => e.id === targetEmployeeId)?.name ?? ""}'s`;

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        {targetName} Weekly Summary
      </Typography>

      <Paper sx={{ p: 2, mb: 2, display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
        {canPickForOthers && (
          <TextField
            select
            label="Employee"
            size="small"
            value={targetEmployeeId ?? ""}
            onChange={(e) => setTargetEmployeeId(Number(e.target.value))}
            sx={{ minWidth: 200 }}
          >
            {user && <MenuItem value={user.id}>{user.name} (me)</MenuItem>}
            {employees
              .filter((e) => e.id !== user?.id)
              .map((e) => (
                <MenuItem key={e.id} value={e.id}>
                  {e.name}
                </MenuItem>
              ))}
          </TextField>
        )}
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
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {!error && !data && <Typography>Loading...</Typography>}

      {data && (
        <>
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <Chip label={`${data.totalHours.toFixed(2)} hours`} color="primary" />
            <Chip label={`$${(totalPerDiemCents / 100).toFixed(2)} per diem`} color="success" variant="outlined" />
          </Stack>

          <Typography variant="h6" gutterBottom>
            Hours by Cost Code
          </Typography>
          <Paper sx={{ mb: 3 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Cost Code</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell align="right">Hours</TableCell>
                  <TableCell align="right">Units</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.breakdown.map((row) => (
                  <TableRow key={row.costCodeId}>
                    <TableCell>{row.code}</TableCell>
                    <TableCell>{row.description}</TableCell>
                    <TableCell align="right">{row.hours.toFixed(2)}</TableCell>
                    <TableCell align="right">{row.units}</TableCell>
                  </TableRow>
                ))}
                {data.breakdown.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} align="center">
                      No entries this week yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>

          <Typography variant="h6" gutterBottom>
            Per Diem
          </Typography>
          <Paper>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Reason</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  {canOverride && <TableCell />}
                </TableRow>
              </TableHead>
              <TableBody>
                {perDiem.map((p) => (
                  <TableRow key={p.date}>
                    <TableCell>{p.date}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={p.eligible ? "Eligible" : "Not eligible"}
                        color={p.eligible ? "success" : "default"}
                      />
                      {p.manualOverride && <Chip size="small" label="Manual" sx={{ ml: 0.5 }} variant="outlined" />}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {p.reason ?? "—"}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{p.eligible ? `$${(p.amount / 100).toFixed(2)}` : "—"}</TableCell>
                    {canOverride && (
                      <TableCell align="right">
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                          <Button size="small" onClick={() => setOverride(p.date, true)}>
                            Pay
                          </Button>
                          <Button size="small" onClick={() => setOverride(p.date, false)}>
                            No Pay
                          </Button>
                          {p.manualOverride && (
                            <Button size="small" color="inherit" onClick={() => clearOverride(p.date)}>
                              Reset
                            </Button>
                          )}
                        </Stack>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </>
      )}
    </Box>
  );
}
