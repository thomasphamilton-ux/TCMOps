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
  Chip,
  Stack,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Checkbox,
} from "@mui/material";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext";

interface Team {
  id: number;
  name: string;
  foremanId: number | null;
  shiftStart: string | null;
  active: boolean;
}

interface UserOption {
  id: number;
  name: string;
  role: string;
  teamId: number | null;
}

interface Project {
  id: number;
  code: string;
  name: string;
  companyId: number | null;
}

interface Company {
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
  const [companies, setCompanies] = useState<Company[]>([]);
  const [form, setForm] = useState({ name: "", foremanId: "", companyId: "", projectId: "", shiftStart: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editShiftStart, setEditShiftStart] = useState("");
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [managingTeam, setManagingTeam] = useState<Team | null>(null);
  const [rosterSaving, setRosterSaving] = useState<number | null>(null);
  const [rosterError, setRosterError] = useState("");

  const leadershipUsers = users.filter((u) => u.role === "foreman" || u.role === "supervisor");

  const toggleActive = async (team: Team) => {
    setError("");
    try {
      await api.patch(`/teams/${team.id}`, { active: !team.active });
      setTeams((prev) => prev.map((t) => (t.id === team.id ? { ...t, active: !team.active } : t)));
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not update team.");
    }
  };

  const toggleTeamMember = async (member: UserOption, teamId: number) => {
    setRosterSaving(member.id);
    setRosterError("");
    try {
      const newTeamId = member.teamId === teamId ? null : teamId;
      await api.patch(`/users/${member.id}`, { teamId: newTeamId });
      await load();
    } catch (err: any) {
      setRosterError(err.response?.data?.error || "Could not update assignment.");
    } finally {
      setRosterSaving(null);
    }
  };

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
    Promise.all([api.get("/projects"), api.get("/companies")])
      .then(([projectsRes, companiesRes]) => {
        setProjects(projectsRes.data);
        setCompanies(companiesRes.data);
      })
      .catch(() => setError("Could not load projects."));
  }, [isAdmin]);

  // Purely a UI filter — narrows which projects show up below.
  const visibleProjects =
    isAdmin && form.companyId ? projects.filter((p) => p.companyId === Number(form.companyId)) : projects;

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
      setForm({ name: "", foremanId: "", companyId: "", projectId: "", shiftStart: "" });
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
              label="Company"
              value={form.companyId}
              onChange={(e) => setForm({ ...form, companyId: e.target.value, projectId: "" })}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="">All Companies</MenuItem>
              {companies.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
          )}
          {isAdmin && (
            <TextField
              select
              label="Project"
              value={form.projectId}
              onChange={(e) => setForm({ ...form, projectId: e.target.value })}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="">Unassigned</MenuItem>
              {visibleProjects.map((p) => (
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
              <TableCell>Leadership</TableCell>
              <TableCell>Shift Start</TableCell>
              <TableCell>Status</TableCell>
              {canManage && <TableCell />}
            </TableRow>
          </TableHead>
          <TableBody>
            {teams.map((t) => {
              const assigned = leadershipUsers.filter((u) => u.teamId === t.id);
              return (
                <TableRow key={t.id}>
                  <TableCell>{t.name}</TableCell>
                  <TableCell>{foremanName(t.foremanId)}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {assigned.length === 0 && (
                        <Typography variant="body2" color="text.secondary">
                          None assigned
                        </Typography>
                      )}
                      {assigned.map((u) => (
                        <Chip key={u.id} size="small" label={`${u.name} (${u.role})`} />
                      ))}
                    </Stack>
                  </TableCell>
                  <TableCell>{toHHMM(t.shiftStart) || "Not set"}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={t.active ? "Active" : "Inactive"}
                      color={t.active ? "success" : "default"}
                      onClick={canManage ? () => toggleActive(t) : undefined}
                      sx={canManage ? { cursor: "pointer" } : undefined}
                    />
                  </TableCell>
                  {canManage && (
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button size="small" onClick={() => setManagingTeam(t)}>
                          Leadership
                        </Button>
                        <Button size="small" onClick={() => openEdit(t)}>
                          Edit
                        </Button>
                      </Stack>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
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

      <Dialog open={managingTeam !== null} onClose={() => setManagingTeam(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Team Leadership — {managingTeam?.name}</DialogTitle>
        <DialogContent>
          {rosterError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {rosterError}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Check anyone who should be assigned to this team — multiple foremen are supported. Assigning someone here
            moves them off any other team they're currently on.
          </Typography>
          <List dense disablePadding>
            {leadershipUsers.map((u) => (
              <ListItem key={u.id} disablePadding>
                <ListItemButton
                  onClick={() => managingTeam && toggleTeamMember(u, managingTeam.id)}
                  disabled={rosterSaving === u.id}
                >
                  <Checkbox
                    edge="start"
                    checked={managingTeam ? u.teamId === managingTeam.id : false}
                    tabIndex={-1}
                    disableRipple
                  />
                  <ListItemText primary={u.name} secondary={u.role} />
                </ListItemButton>
              </ListItem>
            ))}
            {leadershipUsers.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No foremen or supervisors in this project yet.
              </Typography>
            )}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setManagingTeam(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
