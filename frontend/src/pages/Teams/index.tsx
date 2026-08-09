import { useState, useEffect, useCallback, type FormEvent } from "react";
import {
  Box,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Paper,
  Button,
  TextField,
  MenuItem,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext";

interface Team {
  id: number;
  name: string;
  foremanId: number | null;
  shiftStart: string | null;
}

interface UserOption {
  id: number;
  name: string;
}

interface Project {
  id: number;
  code: string;
  name: string;
}

// Postgres "time" columns come back as "HH:MM:SS" — trim to "HH:MM" for the <input type="time"> and for display.
function toHHMM(value: string | null) {
  return value ? value.slice(0, 5) : "";
}

export default function TeamsPage() {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.role === "admin";
  const canManage = isAdmin || authUser?.role === "manager";
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [form, setForm] = useState({ name: "", foremanId: "", projectId: "", shiftStart: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editShiftStart, setEditShiftStart] = useState("");
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async () => {
    const [teamsRes, usersRes] = await Promise.all([api.get("/teams"), api.get("/users")]);
    setTeams(teamsRes.data);
    setUsers(usersRes.data);
  }, []);

  useEffect(() => {
    load().catch(() => setError("Could not load teams."));
  }, [load]);

  useEffect(() => {
    if (!isAdmin) return;
    api
      .get("/projects")
      .then((res) => setProjects(res.data))
      .catch(() => setError("Could not load projects."));
  }, [isAdmin]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.post("/teams", {
        name: form.name,
        foremanId: form.foremanId ? Number(form.foremanId) : undefined,
        projectId: isAdmin && form.projectId ? Number(form.projectId) : undefined,
        shiftStart: form.shiftStart || undefined,
      });
      setForm({ name: "", foremanId: "", projectId: "", shiftStart: "" });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not create team.");
    } finally {
      setSubmitting(false);
    }
  };

  const foremanName = (id: number | null) => users.find((u) => u.id === id)?.name ?? "—";

  const openEdit = (team: Team) => {
    setEditingTeam(team);
    setEditShiftStart(toHHMM(team.shiftStart));
    setEditError("");
  };

  const closeEdit = () => setEditingTeam(null);

  const saveShiftStart = async () => {
    if (!editingTeam) return;
    setEditSaving(true);
    setEditError("");
    try {
      await api.patch(`/teams/${editingTeam.id}`, { shiftStart: editShiftStart || null });
      setEditingTeam(null);
      await load();
    } catch (err: any) {
      setEditError(err.response?.data?.error || "Could not save shift start.");
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Teams
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 3 }} component="form" onSubmit={handleCreate}>
        <Typography variant="h6" gutterBottom>
          Add Team
        </Typography>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
          <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <TextField
            select
            label="Foreman"
            value={form.foremanId}
            onChange={(e) => setForm({ ...form, foremanId: e.target.value })}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="">Unassigned</MenuItem>
            {users.map((u) => (
              <MenuItem key={u.id} value={u.id}>
                {u.name}
              </MenuItem>
            ))}
          </TextField>
          {isAdmin && (
            <TextField
              select
              label="Project"
              value={form.projectId}
              onChange={(e) => setForm({ ...form, projectId: e.target.value })}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="">Unassigned</MenuItem>
              {projects.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name}
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            label="Shift Start"
            type="time"
            value={form.shiftStart}
            onChange={(e) => setForm({ ...form, shiftStart: e.target.value })}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 160 }}
          />
          <Button type="submit" variant="contained" disabled={submitting}>
            Add
          </Button>
        </Box>
      </Paper>

      <Paper>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Foreman</TableCell>
              <TableCell>Shift Start</TableCell>
              {canManage && <TableCell />}
            </TableRow>
          </TableHead>
          <TableBody>
            {teams.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{t.name}</TableCell>
                <TableCell>{foremanName(t.foremanId)}</TableCell>
                <TableCell>{toHHMM(t.shiftStart) || "Not set"}</TableCell>
                {canManage && (
                  <TableCell align="right">
                    <Button size="small" onClick={() => openEdit(t)}>
                      Edit
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={editingTeam !== null} onClose={closeEdit} maxWidth="xs" fullWidth>
        <DialogTitle>Shift Start — {editingTeam?.name}</DialogTitle>
        <DialogContent>
          {editError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {editError}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Clock-in isn't allowed more than 10 minutes early, and paid time never starts before this time. Leave blank
            to turn these rules off for this team.
          </Typography>
          <TextField
            label="Shift Start"
            type="time"
            value={editShiftStart}
            onChange={(e) => setEditShiftStart(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditShiftStart("")} color="error">
            Clear
          </Button>
          <Button onClick={closeEdit}>Cancel</Button>
          <Button variant="contained" onClick={saveShiftStart} disabled={editSaving}>
            {editSaving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
