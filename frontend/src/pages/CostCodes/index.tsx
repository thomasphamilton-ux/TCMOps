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
      });
      setForm({ code: "", description: "", allowsUnits: false, unitType: "", companyId: "", projectId: "" });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not create cost code.");
    } finally {
      setSubmitting(false);
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
        columnsHint="code, description, allowsUnits (true/false), unitType — optional"
        onImported={load}
      />

      <Paper>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Code</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Units</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {codes.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.code}</TableCell>
                <TableCell>{c.description}</TableCell>
                <TableCell>{c.allowsUnits ? c.unitType || "yes" : "—"}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={c.active ? "Active" : "Inactive"}
                    color={c.active ? "success" : "default"}
                    onClick={canManage ? () => toggleActive(c) : undefined}
                    sx={canManage ? { cursor: "pointer" } : undefined}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
