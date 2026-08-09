import { useState, useEffect } from "react";
import { Box, Typography, Table, TableHead, TableRow, TableCell, TableBody, Paper, Alert, Stack, Chip } from "@mui/material";
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
  date: string;
  eligible: boolean;
  amount: number;
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

function currentWeekRange() {
  const now = new Date();
  const diffToMonday = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: toDateStr(monday), end: toDateStr(sunday) };
}

export default function WeeklyPage() {
  const { user } = useAuth();
  const [data, setData] = useState<{ totalHours: number; breakdown: Breakdown[] } | null>(null);
  const [perDiem, setPerDiem] = useState<PerDiemRow[]>([]);
  const [error, setError] = useState("");
  const { start, end } = currentWeekRange();

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.get(`/productivity/${user.id}`, { params: { start, end } }),
      api.get(`/per-diem/${user.id}`),
    ])
      .then(([prodRes, perDiemRes]) => {
        setData(prodRes.data);
        setPerDiem(perDiemRes.data.filter((p: PerDiemRow) => p.date >= start && p.date <= end));
      })
      .catch(() => setError("Could not load weekly summary."));
  }, [user, start, end]);

  const totalPerDiemCents = perDiem.filter((p) => p.eligible).reduce((sum, p) => sum + p.amount, 0);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Weekly Summary — {start} to {end}
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}
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
                  <TableCell align="right">Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {perDiem.map((p) => (
                  <TableRow key={p.date}>
                    <TableCell>{p.date}</TableCell>
                    <TableCell>
                      <Chip size="small" label={p.eligible ? "Eligible" : "Not eligible"} color={p.eligible ? "success" : "default"} />
                    </TableCell>
                    <TableCell align="right">{p.eligible ? `$${(p.amount / 100).toFixed(2)}` : "—"}</TableCell>
                  </TableRow>
                ))}
                {perDiem.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} align="center">
                      No per diem records this week.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>
        </>
      )}
    </Box>
  );
}
