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

interface Project {
  id: number;
  code: string;
  name: string;
  active: boolean;
  geofenceLat: number | null;
  geofenceLng: number | null;
  geofenceRadiusM: number | null;
}

// Best-effort — the field can always be filled in by hand if this fails or is denied.
function getLocation(): Promise<{ lat: number; lng: number } | null> {
  if (!navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 60_000 }
    );
  });
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [form, setForm] = useState({ code: "", name: "", geofenceLat: "", geofenceLng: "", geofenceRadiusM: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);

  const [editing, setEditing] = useState<Project | null>(null);
  const [editForm, setEditForm] = useState({ geofenceLat: "", geofenceLng: "", geofenceRadiusM: "" });
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editLocating, setEditLocating] = useState(false);

  const load = useCallback(async () => {
    const res = await api.get("/projects");
    setProjects(res.data);
  }, []);

  useEffect(() => {
    load().catch(() => setError("Could not load projects."));
  }, [load]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.post("/projects", {
        code: form.code,
        name: form.name,
        geofenceLat: form.geofenceLat ? Number(form.geofenceLat) : undefined,
        geofenceLng: form.geofenceLng ? Number(form.geofenceLng) : undefined,
        geofenceRadiusM: form.geofenceRadiusM ? Number(form.geofenceRadiusM) : undefined,
      });
      setForm({ code: "", name: "", geofenceLat: "", geofenceLng: "", geofenceRadiusM: "" });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not create project.");
    } finally {
      setSubmitting(false);
    }
  };

  const useMyLocationForCreate = async () => {
    setLocating(true);
    const loc = await getLocation();
    if (loc) setForm((f) => ({ ...f, geofenceLat: String(loc.lat), geofenceLng: String(loc.lng) }));
    else setError("Could not get your current location.");
    setLocating(false);
  };

  const openEdit = (project: Project) => {
    setEditing(project);
    setEditForm({
      geofenceLat: project.geofenceLat != null ? String(project.geofenceLat) : "",
      geofenceLng: project.geofenceLng != null ? String(project.geofenceLng) : "",
      geofenceRadiusM: project.geofenceRadiusM != null ? String(project.geofenceRadiusM) : "",
    });
    setEditError("");
  };

  const closeEdit = () => setEditing(null);

  const useMyLocationForEdit = async () => {
    setEditLocating(true);
    const loc = await getLocation();
    if (loc) setEditForm((f) => ({ ...f, geofenceLat: String(loc.lat), geofenceLng: String(loc.lng) }));
    else setEditError("Could not get your current location.");
    setEditLocating(false);
  };

  const saveGeofence = async () => {
    if (!editing) return;
    setEditSaving(true);
    setEditError("");
    try {
      await api.patch(`/projects/${editing.id}`, {
        geofenceLat: editForm.geofenceLat ? Number(editForm.geofenceLat) : null,
        geofenceLng: editForm.geofenceLng ? Number(editForm.geofenceLng) : null,
        geofenceRadiusM: editForm.geofenceRadiusM ? Number(editForm.geofenceRadiusM) : null,
      });
      setEditing(null);
      await load();
    } catch (err: any) {
      setEditError(err.response?.data?.error || "Could not save geofence.");
    } finally {
      setEditSaving(false);
    }
  };

  const clearGeofence = () => setEditForm({ geofenceLat: "", geofenceLng: "", geofenceRadiusM: "" });

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Projects
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 3 }} component="form" onSubmit={handleCreate}>
        <Typography variant="h6" gutterBottom>
          Add Project
        </Typography>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
          <TextField label="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
          <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Button type="submit" variant="contained" disabled={submitting}>
            Add
          </Button>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 2, mb: 1 }}>
          Geofence (optional) — flags clock-ins/outs made outside this radius for review, without blocking them.
        </Typography>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
          <TextField
            label="Latitude"
            type="number"
            size="small"
            value={form.geofenceLat}
            onChange={(e) => setForm({ ...form, geofenceLat: e.target.value })}
            sx={{ width: 150 }}
          />
          <TextField
            label="Longitude"
            type="number"
            size="small"
            value={form.geofenceLng}
            onChange={(e) => setForm({ ...form, geofenceLng: e.target.value })}
            sx={{ width: 150 }}
          />
          <TextField
            label="Radius (m)"
            type="number"
            size="small"
            value={form.geofenceRadiusM}
            onChange={(e) => setForm({ ...form, geofenceRadiusM: e.target.value })}
            sx={{ width: 130 }}
          />
          <Button size="small" variant="outlined" onClick={useMyLocationForCreate} disabled={locating}>
            {locating ? "Locating..." : "Use My Location"}
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
              <TableCell>Geofence</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {projects.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.code}</TableCell>
                <TableCell>{p.name}</TableCell>
                <TableCell>
                  <Chip size="small" label={p.active ? "Active" : "Inactive"} color={p.active ? "success" : "default"} />
                </TableCell>
                <TableCell>
                  {p.geofenceRadiusM != null ? (
                    <Chip size="small" label={`${p.geofenceRadiusM}m radius`} />
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Not set
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => openEdit(p)}>
                    Edit Geofence
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={editing !== null} onClose={closeEdit} maxWidth="xs" fullWidth>
        <DialogTitle>Geofence — {editing?.name}</DialogTitle>
        <DialogContent>
          {editError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {editError}
            </Alert>
          )}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Latitude"
              type="number"
              value={editForm.geofenceLat}
              onChange={(e) => setEditForm({ ...editForm, geofenceLat: e.target.value })}
            />
            <TextField
              label="Longitude"
              type="number"
              value={editForm.geofenceLng}
              onChange={(e) => setEditForm({ ...editForm, geofenceLng: e.target.value })}
            />
            <TextField
              label="Radius (m)"
              type="number"
              value={editForm.geofenceRadiusM}
              onChange={(e) => setEditForm({ ...editForm, geofenceRadiusM: e.target.value })}
            />
            <Button variant="outlined" onClick={useMyLocationForEdit} disabled={editLocating}>
              {editLocating ? "Locating..." : "Use My Location"}
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={clearGeofence} color="error">
            Clear
          </Button>
          <Button onClick={closeEdit}>Cancel</Button>
          <Button variant="contained" onClick={saveGeofence} disabled={editSaving}>
            {editSaving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
