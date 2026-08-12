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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import api from "../../api/client";
import ExcelImport from "../../components/ExcelImport";
import { useAuth } from "../../context/AuthContext";
import { LANGUAGE_OPTIONS } from "../../constants/languages";

interface User {
  id: number;
  name: string;
  phone: string;
  role: string;
  teamId: number | null;
  active: boolean;
  shiftExempt: boolean;
  classification: string | null;
  perDiemRate: number | null;
  language: string | null;
  defaultCostCodeId: number | null;
  archived: boolean;
  eid: string | null;
  employmentType: string;
  contractCompany: string | null;
  ptoBalanceHours: number | null;
}

interface Team {
  id: number;
  name: string;
  projectId: number | null;
  active: boolean;
}

interface CostCode {
  id: number;
  code: string;
  description: string;
  projectId: number | null;
  active: boolean;
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

const ROLES = ["admin", "manager", "supervisor", "foreman", "employee"];

export default function UsersPage() {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.role === "admin";
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    pin: "",
    role: "employee",
    companyId: "",
    teamId: "",
    projectId: "",
    shiftExempt: false,
    classification: "",
    perDiemRate: "",
    defaultCostCodeId: "",
    eid: "",
    employmentType: "full_time",
    contractCompany: "",
    ptoBalanceHours: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Light debounce so typing a name doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    const [usersRes, teamsRes, costCodesRes] = await Promise.all([
      api.get("/users", { params: search ? { search } : undefined }),
      api.get("/teams"),
      api.get("/cost-codes"),
    ]);
    setUsers(usersRes.data);
    setTeams(teamsRes.data);
    setCostCodes(costCodesRes.data);
  }, [search]);

  useEffect(() => {
    load().catch(() => setError("Could not load users."));
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

  // Purely a UI filter — narrows which projects show up below, nothing about
  // company is ever sent to the backend for a user record.
  const visibleProjects =
    isAdmin && form.companyId ? projects.filter((p) => p.companyId === Number(form.companyId)) : projects;

  // Manager's own project is forced server-side, so the field only matters — and
  // only needs to render — for admin. Once a project is picked, the team choices
  // narrow to that project.
  const visibleTeams = (
    isAdmin && form.projectId ? teams.filter((t) => t.projectId === Number(form.projectId)) : teams
  ).filter((t) => t.active || t.id === Number(form.teamId));

  const visibleCostCodes = (
    isAdmin && form.projectId ? costCodes.filter((cc) => cc.projectId === Number(form.projectId)) : costCodes
  ).filter((cc) => cc.active || cc.id === Number(form.defaultCostCodeId));

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.post("/users", {
        ...form,
        companyId: undefined,
        teamId: form.teamId ? Number(form.teamId) : undefined,
        projectId: isAdmin && form.projectId ? Number(form.projectId) : undefined,
        perDiemRate: form.perDiemRate ? Number(form.perDiemRate) : undefined,
        defaultCostCodeId: form.defaultCostCodeId ? Number(form.defaultCostCodeId) : undefined,
        contractCompany: form.employmentType === "contract" ? form.contractCompany || undefined : undefined,
        ptoBalanceHours: form.ptoBalanceHours ? Number(form.ptoBalanceHours) : undefined,
      });
      setForm({
        name: "",
        phone: "",
        pin: "",
        role: "employee",
        companyId: "",
        teamId: "",
        projectId: "",
        shiftExempt: false,
        classification: "",
        perDiemRate: "",
        defaultCostCodeId: "",
        eid: "",
        employmentType: "full_time",
        contractCompany: "",
        ptoBalanceHours: "",
      });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not create user.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setError("");
    try {
      const res = await api.get("/users/export", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `users-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not export users.");
    } finally {
      setExporting(false);
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

  const toggleActive = async (u: User) => {
    setError("");
    try {
      await api.patch(`/users/${u.id}`, { active: !u.active });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, active: !u.active } : x)));
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not update user.");
    }
  };

  const toggleArchived = async (u: User) => {
    setError("");
    try {
      await api.patch(`/users/${u.id}`, { archived: !u.archived });
      // Archiving/unarchiving changes which rows the default (unsearched) roster
      // even includes, so a local patch isn't enough — refetch under current search.
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not update user.");
    }
  };

  const [editing, setEditing] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    phone: "",
    role: "employee",
    companyId: "",
    teamId: "",
    projectId: "",
    shiftExempt: false,
    pin: "",
    classification: "",
    perDiemRate: "",
    language: "",
    defaultCostCodeId: "",
    eid: "",
    employmentType: "full_time",
    contractCompany: "",
    ptoBalanceHours: "",
  });
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const openEdit = (u: User) => {
    setEditing(u);
    setEditForm({
      name: u.name,
      phone: u.phone,
      role: u.role,
      companyId: "",
      teamId: u.teamId ? String(u.teamId) : "",
      projectId: "",
      shiftExempt: u.shiftExempt,
      pin: "",
      classification: u.classification ?? "",
      perDiemRate: u.perDiemRate != null ? String(u.perDiemRate) : "",
      language: u.language ?? "",
      defaultCostCodeId: u.defaultCostCodeId != null ? String(u.defaultCostCodeId) : "",
      eid: u.eid ?? "",
      employmentType: u.employmentType,
      contractCompany: u.contractCompany ?? "",
      ptoBalanceHours: u.ptoBalanceHours != null ? String(u.ptoBalanceHours) : "",
    });
    setEditError("");
  };

  const closeEdit = () => setEditing(null);

  const editVisibleProjects =
    isAdmin && editForm.companyId ? projects.filter((p) => p.companyId === Number(editForm.companyId)) : projects;

  const editVisibleTeams = (
    isAdmin && editForm.projectId ? teams.filter((t) => t.projectId === Number(editForm.projectId)) : teams
  ).filter((t) => t.active || t.id === Number(editForm.teamId));

  const editVisibleCostCodes = (
    isAdmin && editForm.projectId ? costCodes.filter((cc) => cc.projectId === Number(editForm.projectId)) : costCodes
  ).filter((cc) => cc.active || cc.id === Number(editForm.defaultCostCodeId));

  const saveEdit = async () => {
    if (!editing) return;
    setEditSaving(true);
    setEditError("");
    try {
      await api.patch(`/users/${editing.id}`, {
        name: editForm.name,
        phone: editForm.phone,
        role: editForm.role,
        teamId: editForm.teamId ? Number(editForm.teamId) : null,
        ...(isAdmin && editForm.projectId ? { projectId: Number(editForm.projectId) } : {}),
        shiftExempt: editForm.shiftExempt,
        classification: editForm.classification || null,
        perDiemRate: editForm.perDiemRate ? Number(editForm.perDiemRate) : null,
        language: editForm.language || null,
        defaultCostCodeId: editForm.defaultCostCodeId ? Number(editForm.defaultCostCodeId) : null,
        eid: editForm.eid || null,
        employmentType: editForm.employmentType,
        contractCompany: editForm.employmentType === "contract" ? editForm.contractCompany || null : null,
        ptoBalanceHours: editForm.ptoBalanceHours ? Number(editForm.ptoBalanceHours) : null,
        ...(editForm.pin ? { pin: editForm.pin } : {}),
      });
      setEditing(null);
      await load();
    } catch (err: any) {
      setEditError(err.response?.data?.error || "Could not save changes.");
    } finally {
      setEditSaving(false);
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

      <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ mb: 2 }}>
        <TextField
          label="Search users"
          placeholder="Name or phone..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          size="small"
          sx={{ minWidth: 280 }}
          helperText={search ? "Searching includes archived users" : "Archived users are hidden until you search"}
        />
        <Button variant="outlined" onClick={handleExport} disabled={exporting} sx={{ mt: 0.5 }}>
          {exporting ? "Exporting..." : "Export to Excel"}
        </Button>
      </Stack>

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
            label="EID"
            placeholder="Employee ID"
            value={form.eid}
            onChange={(e) => setForm({ ...form, eid: e.target.value })}
            sx={{ minWidth: 140 }}
          />
          <TextField
            label="Classification"
            placeholder="Helper, Apprentice, Journeyman..."
            value={form.classification}
            onChange={(e) => setForm({ ...form, classification: e.target.value })}
            sx={{ minWidth: 180 }}
          />
          <TextField
            label="Per Diem Rate ($/day)"
            type="number"
            value={form.perDiemRate}
            onChange={(e) => setForm({ ...form, perDiemRate: e.target.value })}
            sx={{ width: 170 }}
            inputProps={{ step: "0.01", min: 0 }}
          />
          <TextField
            label="PTO Balance (hrs)"
            type="number"
            value={form.ptoBalanceHours}
            onChange={(e) => setForm({ ...form, ptoBalanceHours: e.target.value })}
            sx={{ width: 150 }}
            inputProps={{ step: "0.1", min: 0 }}
          />
          <TextField
            select
            label="Employment Type"
            value={form.employmentType}
            onChange={(e) => setForm({ ...form, employmentType: e.target.value })}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="full_time">Full Time</MenuItem>
            <MenuItem value="contract">Contract</MenuItem>
          </TextField>
          {form.employmentType === "contract" && (
            <TextField
              label="Contract Company"
              placeholder="Staffing/contracting firm"
              value={form.contractCompany}
              onChange={(e) => setForm({ ...form, contractCompany: e.target.value })}
              sx={{ minWidth: 180 }}
            />
          )}
          <TextField
            select
            label="Default Cost Code"
            value={form.defaultCostCodeId}
            onChange={(e) => setForm({ ...form, defaultCostCodeId: e.target.value })}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="">None</MenuItem>
            {visibleCostCodes.map((cc) => (
              <MenuItem key={cc.id} value={cc.id}>
                {cc.code} — {cc.description}
              </MenuItem>
            ))}
          </TextField>
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
              label="Company"
              value={form.companyId}
              onChange={(e) => setForm({ ...form, companyId: e.target.value, projectId: "", teamId: "" })}
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
              onChange={(e) => setForm({ ...form, projectId: e.target.value, teamId: "" })}
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
        columnsHint='name, phone, pin, role (admin/manager/supervisor/foreman/employee), team, classification, eid, default cost code (code — optional), per diem rate, language, shift exempt (yes/no), employment type (full_time/contract), contract company (only if contract)'
        onImported={load}
      />

      <Paper>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>EID</TableCell>
              <TableCell>Phone</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Classification</TableCell>
              <TableCell>Team</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Shift Exempt</TableCell>
              <TableCell />
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
                <TableCell>{u.eid ?? "—"}</TableCell>
                <TableCell>{u.phone}</TableCell>
                <TableCell>{u.role}</TableCell>
                <TableCell>{u.classification ?? "—"}</TableCell>
                <TableCell>{teams.find((t) => t.id === u.teamId)?.name ?? "—"}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5}>
                    <Chip
                      size="small"
                      label={u.active ? "Active" : "Inactive"}
                      color={u.active ? "success" : "default"}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleActive(u);
                      }}
                      sx={{ cursor: "pointer" }}
                    />
                    {u.archived && <Chip size="small" label="Archived" color="warning" variant="outlined" />}
                  </Stack>
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
                <TableCell align="right">
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Button
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(u);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="small"
                      color={u.archived ? "primary" : "inherit"}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleArchived(u);
                      }}
                    >
                      {u.archived ? "Unarchive" : "Archive"}
                    </Button>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={editing !== null} onClose={closeEdit} maxWidth="xs" fullWidth>
        <DialogTitle>Edit User — {editing?.name}</DialogTitle>
        <DialogContent>
          {editError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {editError}
            </Alert>
          )}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Name"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              required
            />
            <TextField
              label="Phone"
              value={editForm.phone}
              onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              required
            />
            <TextField
              label="EID"
              placeholder="Employee ID"
              value={editForm.eid}
              onChange={(e) => setEditForm({ ...editForm, eid: e.target.value })}
            />
            <TextField
              label="Classification"
              placeholder="Helper, Apprentice, Journeyman..."
              value={editForm.classification}
              onChange={(e) => setEditForm({ ...editForm, classification: e.target.value })}
            />
            <TextField
              label="Per Diem Rate ($/day)"
              type="number"
              value={editForm.perDiemRate}
              onChange={(e) => setEditForm({ ...editForm, perDiemRate: e.target.value })}
              inputProps={{ step: "0.01", min: 0 }}
              helperText="Leave blank if this person isn't eligible for per diem"
            />
            <TextField
              label="PTO Balance (hrs)"
              type="number"
              value={editForm.ptoBalanceHours}
              onChange={(e) => setEditForm({ ...editForm, ptoBalanceHours: e.target.value })}
              inputProps={{ step: "0.1", min: 0 }}
              helperText="Shown to leadership reviewing this person's paid time off requests"
            />
            <TextField
              select
              label="Default Cost Code"
              value={editForm.defaultCostCodeId}
              onChange={(e) => setEditForm({ ...editForm, defaultCostCodeId: e.target.value })}
              helperText="Pre-fills the first entry on their Daily page — they can still change it or split the day"
            >
              <MenuItem value="">None</MenuItem>
              {editVisibleCostCodes.map((cc) => (
                <MenuItem key={cc.id} value={cc.id}>
                  {cc.code} — {cc.description}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Language"
              value={editForm.language}
              onChange={(e) => setEditForm({ ...editForm, language: e.target.value })}
            >
              <MenuItem value="">Not set</MenuItem>
              {LANGUAGE_OPTIONS.map((l) => (
                <MenuItem key={l.value} value={l.value}>
                  {l.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Employment Type"
              value={editForm.employmentType}
              onChange={(e) => setEditForm({ ...editForm, employmentType: e.target.value })}
            >
              <MenuItem value="full_time">Full Time</MenuItem>
              <MenuItem value="contract">Contract</MenuItem>
            </TextField>
            {editForm.employmentType === "contract" && (
              <TextField
                label="Contract Company"
                placeholder="Staffing/contracting firm"
                value={editForm.contractCompany}
                onChange={(e) => setEditForm({ ...editForm, contractCompany: e.target.value })}
              />
            )}
            <TextField
              select
              label="Role"
              value={editForm.role}
              onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
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
                label="Company"
                value={editForm.companyId}
                onChange={(e) => setEditForm({ ...editForm, companyId: e.target.value, projectId: "", teamId: "" })}
                helperText="Just narrows the Project list below — not saved on the user"
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
                value={editForm.projectId}
                onChange={(e) => setEditForm({ ...editForm, projectId: e.target.value, teamId: "" })}
                helperText="Leave blank to keep the user's current project"
              >
                <MenuItem value="">Unchanged</MenuItem>
                {editVisibleProjects.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <TextField
              select
              label="Team"
              value={editForm.teamId}
              onChange={(e) => setEditForm({ ...editForm, teamId: e.target.value })}
            >
              <MenuItem value="">Unassigned</MenuItem>
              {editVisibleTeams.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.name}
                </MenuItem>
              ))}
            </TextField>
            {editForm.role === "employee" && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={editForm.shiftExempt}
                    onChange={(e) => setEditForm({ ...editForm, shiftExempt: e.target.checked })}
                  />
                }
                label="Shift exempt"
              />
            )}
            <TextField
              label="Reset PIN (optional)"
              value={editForm.pin}
              onChange={(e) => setEditForm({ ...editForm, pin: e.target.value })}
              helperText="Leave blank to keep the current PIN"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEdit}>Cancel</Button>
          <Button variant="contained" onClick={saveEdit} disabled={editSaving}>
            {editSaving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
