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
  Chip,
  Checkbox,
  FormControlLabel,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import api from "../../api/client";
import ExcelImport from "../../components/ExcelImport";
import { useAuth } from "../../context/AuthContext";

interface User {
  id: number;
  name: string;
  phone: string;
  role: string;
  teamId: number | null;
  active: boolean;
  shiftExempt: boolean;
}

interface Team {
  id: number;
  name: string;
  projectId: number | null;
}

interface Project {
  id: number;
  code: string;
  name: string;
}

const ROLES = ["admin", "manager", "supervisor", "foreman", "employee"];

export default function UsersPage() {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.role === "admin";
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    pin: "",
    role: "employee",
    teamId: "",
    projectId: "",
    shiftExempt: false,
  });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const [usersRes, teamsRes] = await Promise.all([api.get("/users"), api.get("/teams")]);
    setUsers(usersRes.data);
    setTeams(teamsRes.data);
  }, []);

  useEffect(() => {
    load().catch(() => setError("Could not load users."));
  }, [load]);

  useEffect(() => {
    if (!isAdmin) return;
    api
      .get("/projects")
      .then((res) => setProjects(res.data))
      .catch(() => setError("Could not load projects."));
  }, [isAdmin]);

  // Manager's own project is forced server-side, so the field only matters — and
  // only needs to render — for admin. Once a project is picked, the team choices
  // narrow to that project.
  const visibleTeams = isAdmin && form.projectId ? teams.filter((t) => t.projectId === Number(form.projectId)) : teams;

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.post("/users", {
        ...form,
        teamId: form.teamId ? Number(form.teamId) : undefined,
        projectId: isAdmin && form.projectId ? Number(form.projectId) : undefined,
      });
      setForm({ name: "", phone: "", pin: "", role: "employee", teamId: "", projectId: "", shiftExempt: false });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not create user.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleShiftExempt = async (u: User) => {
    try {
      await api.patch(`/users/${u.id}`, { shiftExempt: !u.shiftExempt });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, shiftExempt: !u.shiftExempt } : x)));
    } catch {
      setError("Could not update shift exemption.");
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Users
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 3 }} component="form" onSubmit={handleCreate}>
        <Typography variant="h6" gutterBottom>
          Add User
        </Typography>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <TextField
            label="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            required
          />
          <TextField label="PIN" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} required />
          <TextField
            select
            label="Role"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            sx={{ minWidth: 140 }}
          >
            {ROLES.map((r) => (
              <MenuItem key={r} value={r}>
                {r}
              </MenuItem>
            ))}
          </TextField>
          {isAdmin && (
            <TextField
              select
              label="Project"
              value={form.projectId}
              onChange={(e) => setForm({ ...form, projectId: e.target.value, teamId: "" })}
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
            select
            label="Team"
            value={form.teamId}
            onChange={(e) => setForm({ ...form, teamId: e.target.value })}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">Unassigned</MenuItem>
            {visibleTeams.map((t) => (
              <MenuItem key={t.id} value={t.id}>
                {t.name}
              </MenuItem>
            ))}
          </TextField>
          {form.role === "employee" && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.shiftExempt}
                  onChange={(e) => setForm({ ...form, shiftExempt: e.target.checked })}
                />
              }
              label="Shift exempt"
              title="Not held to the team's shift-start early-clock-in and floor rules"
            />
          )}
          <Button type="submit" variant="contained" disabled={submitting}>
            Add
          </Button>
        </Box>
      </Paper>

      <ExcelImport
        title="Bulk Import Users"
        endpoint="/users/import"
        templateEndpoint="/users/import/template"
        templateFilename="users-import-template.xlsx"
        columnsHint='name, phone, pin, role (admin/manager/supervisor/foreman/employee), team (team name — optional, matched by name)'
        onImported={load}
      />

      <Paper>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Phone</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Team</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Shift Exempt</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((u) => (
              <TableRow
                key={u.id}
                hover
                onClick={() => navigate(`/users/${u.id}`)}
                sx={{ cursor: "pointer" }}
              >
                <TableCell>{u.name}</TableCell>
                <TableCell>{u.phone}</TableCell>
                <TableCell>{u.role}</TableCell>
                <TableCell>{teams.find((t) => t.id === u.teamId)?.name ?? "—"}</TableCell>
                <TableCell>
                  <Chip size="small" label={u.active ? "Active" : "Inactive"} color={u.active ? "success" : "default"} />
                </TableCell>
                <TableCell>
                  {u.role === "employee" ? (
                    <Checkbox
                      size="small"
                      checked={u.shiftExempt}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleShiftExempt(u)}
                    />
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Always
                    </Typography>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
