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
  Checkbox,
  FormControlLabel,
  MenuItem,
  Alert,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
} from "@mui/material";
import api from "../../api/client";
import ExcelImport from "../../components/ExcelImport";
import { useAuth } from "../../context/AuthContext";

interface CostCode {
  id: number;
  code: string;
  description: string;
  allowsUnits: boolean;
  unitType: string | null;
  active: boolean;
  taskType: string | null;
  budgetHours: number | null;
  incurredHours: number;
  remainingHours: number | null;
  budgetUnits: number | null;
  incurredUnits: number;
  remainingUnits: number | null;
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

// "—" for untracked budgets, otherwise fixed to 1 decimal so the incurred
// side (which is often a non-round number of minutes/60) doesn't jitter.
function fmtNum(n: number | null): string {
  return n == null ? "—" : n.toFixed(1);
}

export default function CostCodesPage() {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.role === "admin";
  const canManage = authUser?.role === "admin" || authUser?.role === "manager";
  const [codes, setCodes] = useState<CostCode[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [form, setForm] = useState({
    code: "",
    description: "",
    allowsUnits: false,
    unitType: "",
    companyId: "",
    projectId: "",
    taskType: "",
    budgetHours: "",
    budgetUnits: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const res = await api.get("/cost-codes");
    setCodes(res.data);
  }, []);

  useEffect(() => {
    load().catch(() => setError("Could not load cost codes."));
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

  const toggleActive = async (c: CostCode) => {
    setError("");
    try {
      await api.patch(`/cost-codes/${c.id}`, { active: !c.active });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not update cost code.");
    }
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.post("/cost-codes", {
        ...form,
        companyId: undefined,
        unitType: form.unitType || undefined,
        projectId: isAdmin && form.projectId ? Number(form.projectId) : undefined,
        taskType: form.taskType || undefined,
        budgetHours: form.budgetHours ? Number(form.budgetHours) : undefined,
        budgetUnits: form.budgetUnits ? Number(form.budgetUnits) : undefined,
      });
      setForm({
        code: "",
        description: "",
        allowsUnits: false,
        unitType: "",
        companyId: "",
        projectId: "",
        taskType: "",
        budgetHours: "",
        budgetUnits: "",
      });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not create cost code.");
    } finally {
      setSubmitting(false);
    }
  };

  const [editing, setEditing] = useState<CostCode | null>(null);
  const [editForm, setEditForm] = useState({
    description: "",
    allowsUnits: false,
    unitType: "",
    taskType: "",
    budgetHours: "",
    budgetUnits: "",
  });
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const openEdit = (c: CostCode) => {
    setEditing(c);
    setEditForm({
      description: c.description,
      allowsUnits: c.allowsUnits,
      unitType: c.unitType ?? "",
      taskType: c.taskType ?? "",
      budgetHours: c.budgetHours != null ? String(c.budgetHours) : "",
      budgetUnits: c.budgetUnits != null ? String(c.budgetUnits) : "",
    });
    setEditError("");
  };

  const closeEdit = () => setEditing(null);

  const saveEdit = async () => {
    if (!editing) return;
    setEditSaving(true);
    setEditError("");
    try {
      await api.patch(`/cost-codes/${editing.id}`, {
        description: editForm.description,
        allowsUnits: editForm.allowsUnits,
        unitType: editForm.allowsUnits ? editForm.unitType || null : null,
        taskType: editForm.taskType || null,
        budgetHours: editForm.budgetHours ? Number(editForm.budgetHours) : null,
        budgetUnits: editForm.budgetUnits ? Number(editForm.budgetUnits) : null,
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
        Cost Codes
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 3 }} component="form" onSubmit={handleCreate}>
        <Typography variant="h6" gutterBottom>
          Add Cost Code
        </Typography>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
          <TextField label="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
          <TextField
            label="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            required
            sx={{ minWidth: 240 }}
          />
          <TextField
            label="Task Type"
            placeholder="Electrical, Sitework..."
            value={form.taskType}
            onChange={(e) => setForm({ ...form, taskType: e.target.value })}
            sx={{ minWidth: 160 }}
          />
          <TextField
            label="Budget Hours"
            type="number"
            value={form.budgetHours}
            onChange={(e) => setForm({ ...form, budgetHours: e.target.value })}
            sx={{ width: 140 }}
            inputProps={{ step: "0.1", min: 0 }}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={form.allowsUnits}
                onChange={(e) => setForm({ ...form, allowsUnits: e.target.checked })}
              />
            }
            label="Allows units"
          />
          {form.allowsUnits && (
            <TextField
              label="Unit type"
              value={form.unitType}
              onChange={(e) => setForm({ ...form, unitType: e.target.value })}
            />
          )}
          {form.allowsUnits && (
            <TextField
              label="Budget Units"
              type="number"
              value={form.budgetUnits}
              onChange={(e) => setForm({ ...form, budgetUnits: e.target.value })}
              sx={{ width: 140 }}
              inputProps={{ step: "1", min: 0 }}
            />
          )}
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
          <Button type="submit" variant="contained" disabled={submitting}>
            Add
          </Button>
        </Box>
      </Paper>

      <ExcelImport
        title="Bulk Import Cost Codes"
        endpoint="/cost-codes/import"
        templateEndpoint="/cost-codes/import/template"
        templateFilename="cost-codes-import-template.xlsx"
        columnsHint="code, description, taskType, allowsUnits (true/false), unitType, budgetHours, budgetUnits, status (active/inactive) — all but code/description are optional"
        onImported={load}
      />

      <Paper sx={{ overflowX: "auto" }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Code</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Task Type</TableCell>
              <TableCell>Units</TableCell>
              <TableCell align="right">Budget Hrs</TableCell>
              <TableCell align="right">Incurred Hrs</TableCell>
              <TableCell align="right">Remaining Hrs</TableCell>
              <TableCell align="right">Budget Units</TableCell>
              <TableCell align="right">Incurred Units</TableCell>
              <TableCell align="right">Remaining Units</TableCell>
              <TableCell>Status</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {codes.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.code}</TableCell>
                <TableCell>{c.description}</TableCell>
                <TableCell>{c.taskType ?? "—"}</TableCell>
                <TableCell>{c.allowsUnits ? c.unitType || "yes" : "—"}</TableCell>
                <TableCell align="right">{fmtNum(c.budgetHours)}</TableCell>
                <TableCell align="right">{fmtNum(c.incurredHours)}</TableCell>
                <TableCell align="right">{fmtNum(c.remainingHours)}</TableCell>
                <TableCell align="right">{c.allowsUnits ? fmtNum(c.budgetUnits) : "—"}</TableCell>
                <TableCell align="right">{c.allowsUnits ? fmtNum(c.incurredUnits) : "—"}</TableCell>
                <TableCell align="right">{c.allowsUnits ? fmtNum(c.remainingUnits) : "—"}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={c.active ? "Active" : "Inactive"}
                    color={c.active ? "success" : "default"}
                    onClick={canManage ? () => toggleActive(c) : undefined}
                    sx={canManage ? { cursor: "pointer" } : undefined}
                  />
                </TableCell>
                <TableCell align="right">
                  {canManage && (
                    <Button size="small" onClick={() => openEdit(c)}>
                      Edit
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={editing !== null} onClose={closeEdit} maxWidth="xs" fullWidth>
        <DialogTitle>Edit Cost Code — {editing?.code}</DialogTitle>
        <DialogContent>
          {editError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {editError}
            </Alert>
          )}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Description"
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              required
            />
            <TextField
              label="Task Type"
              placeholder="Electrical, Sitework..."
              value={editForm.taskType}
              onChange={(e) => setEditForm({ ...editForm, taskType: e.target.value })}
            />
            <TextField
              label="Budget Hours"
              type="number"
              value={editForm.budgetHours}
              onChange={(e) => setEditForm({ ...editForm, budgetHours: e.target.value })}
              inputProps={{ step: "0.1", min: 0 }}
              helperText="Leave blank if this code's hours aren't budgeted"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={editForm.allowsUnits}
                  onChange={(e) => setEditForm({ ...editForm, allowsUnits: e.target.checked })}
                />
              }
              label="Allows units"
            />
            {editForm.allowsUnits && (
              <TextField
                label="Unit type"
                value={editForm.unitType}
                onChange={(e) => setEditForm({ ...editForm, unitType: e.target.value })}
              />
            )}
            {editForm.allowsUnits && (
              <TextField
                label="Budget Units"
                type="number"
                value={editForm.budgetUnits}
                onChange={(e) => setEditForm({ ...editForm, budgetUnits: e.target.value })}
                inputProps={{ step: "1", min: 0 }}
                helperText="Leave blank if this code's units aren't budgeted"
              />
            )}
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
