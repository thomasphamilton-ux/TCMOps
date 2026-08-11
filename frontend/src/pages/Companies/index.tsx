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
  Alert,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
} from "@mui/material";
import api from "../../api/client";

interface Company {
  id: number;
  code: string;
  name: string;
  active: boolean;
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [form, setForm] = useState({ code: "", name: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [editing, setEditing] = useState<Company | null>(null);
  const [editForm, setEditForm] = useState({ code: "", name: "" });
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await api.get("/companies");
    setCompanies(res.data);
  }, []);

  useEffect(() => {
    load().catch(() => setError("Could not load companies."));
  }, [load]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.post("/companies", { code: form.code, name: form.name });
      setForm({ code: "", name: "" });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not create company.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (company: Company) => {
    setError("");
    try {
      await api.patch(`/companies/${company.id}`, { active: !company.active });
      setCompanies((prev) => prev.map((c) => (c.id === company.id ? { ...c, active: !company.active } : c)));
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not update company.");
    }
  };

  const openEdit = (company: Company) => {
    setEditing(company);
    setEditForm({ code: company.code, name: company.name });
    setEditError("");
  };

  const closeEdit = () => setEditing(null);

  const saveEdit = async () => {
    if (!editing) return;
    setEditSaving(true);
    setEditError("");
    try {
      await api.patch(`/companies/${editing.id}`, { code: editForm.code, name: editForm.name });
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
        Companies
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Purely organizational — groups projects together for filtering on the Users, Teams, and Cost Codes screens.
        Doesn't change anyone's access.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 3 }} component="form" onSubmit={handleCreate}>
        <Typography variant="h6" gutterBottom>
          Add Company
        </Typography>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
          <TextField label="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
          <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Button type="submit" variant="contained" disabled={submitting}>
            Add
          </Button>
        </Box>
      </Paper>

      <Paper>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Code</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Status</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {companies.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.code}</TableCell>
                <TableCell>{c.name}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={c.active ? "Active" : "Inactive"}
                    color={c.active ? "success" : "default"}
                    onClick={() => toggleActive(c)}
                    sx={{ cursor: "pointer" }}
                  />
                </TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => openEdit(c)}>
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {companies.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  No companies yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={editing !== null} onClose={closeEdit} maxWidth="xs" fullWidth>
        <DialogTitle>Edit Company — {editing?.name}</DialogTitle>
        <DialogContent>
          {editError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {editError}
            </Alert>
          )}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Code"
              value={editForm.code}
              onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
              required
            />
            <TextField
              label="Name"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              required
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
