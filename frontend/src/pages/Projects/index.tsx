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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
} from "@mui/material";
import QRCode from "qrcode";
import api from "../../api/client";
import GeofencePicker from "../../components/GeofencePicker";

interface Project {
  id: number;
  code: string;
  name: string;
  active: boolean;
  companyId: number | null;
  geofenceLat: number | null;
  geofenceLng: number | null;
  geofenceRadiusM: number | null;
}

interface Company {
  id: number;
  code: string;
  name: string;
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
  const [companies, setCompanies] = useState<Company[]>([]);
  const [form, setForm] = useState({
    code: "",
    name: "",
    companyId: "",
    geofenceLat: "",
    geofenceLng: "",
    geofenceRadiusM: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);

  const [editing, setEditing] = useState<Project | null>(null);
  const [editForm, setEditForm] = useState({ companyId: "", geofenceLat: "", geofenceLng: "", geofenceRadiusM: "" });
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editLocating, setEditLocating] = useState(false);

  const [qrProject, setQrProject] = useState<Project | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [qrError, setQrError] = useState("");
  const [qrBusy, setQrBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await api.get("/projects");
    setProjects(res.data);
  }, []);

  useEffect(() => {
    load().catch(() => setError("Could not load projects."));
  }, [load]);

  useEffect(() => {
    api
      .get("/companies")
      .then((res) => setCompanies(res.data))
      .catch(() => {});
  }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.post("/projects", {
        code: form.code,
        name: form.name,
        companyId: form.companyId ? Number(form.companyId) : undefined,
        geofenceLat: form.geofenceLat ? Number(form.geofenceLat) : undefined,
        geofenceLng: form.geofenceLng ? Number(form.geofenceLng) : undefined,
        geofenceRadiusM: form.geofenceRadiusM ? Number(form.geofenceRadiusM) : undefined,
      });
      setForm({ code: "", name: "", companyId: "", geofenceLat: "", geofenceLng: "", geofenceRadiusM: "" });
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
      companyId: project.companyId != null ? String(project.companyId) : "",
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
        companyId: editForm.companyId ? Number(editForm.companyId) : null,
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

  const clearGeofence = () => setEditForm((f) => ({ ...f, geofenceLat: "", geofenceLng: "", geofenceRadiusM: "" }));

  const toggleActive = async (project: Project) => {
    setError("");
    try {
      await api.patch(`/projects/${project.id}`, { active: !project.active });
      setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, active: !project.active } : p)));
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not update project.");
    }
  };

  const renderQr = async (registrationToken: string) => {
    const url = `${window.location.origin}/register?token=${registrationToken}`;
    setQrUrl(url);
    setQrDataUrl(await QRCode.toDataURL(url, { width: 320, margin: 2 }));
  };

  const openQr = async (project: Project) => {
    setQrProject(project);
    setQrError("");
    setQrDataUrl("");
    setQrBusy(true);
    try {
      const res = await api.get(`/projects/${project.id}/registration-token`);
      await renderQr(res.data.registrationToken);
    } catch (err: any) {
      setQrError(err.response?.data?.error || "Could not load the registration code.");
    } finally {
      setQrBusy(false);
    }
  };

  const closeQr = () => {
    setQrProject(null);
    setQrDataUrl("");
    setQrUrl("");
    setQrError("");
  };

  const regenerateQr = async () => {
    if (!qrProject) return;
    if (!window.confirm("This invalidates the current printed QR code — anyone with the old copy won't be able to register. Continue?")) {
      return;
    }
    setQrError("");
    setQrBusy(true);
    try {
      const res = await api.post(`/projects/${qrProject.id}/registration-token/regenerate`);
      await renderQr(res.data.registrationToken);
    } catch (err: any) {
      setQrError(err.response?.data?.error || "Could not regenerate the registration code.");
    } finally {
      setQrBusy(false);
    }
  };

  const printQr = () => {
    if (!qrDataUrl || !qrProject) return;
    const win = window.open("", "_blank", "width=420,height=560");
    if (!win) return;
    win.document.write(`
      <html>
        <head><title>Registration QR — ${qrProject.name}</title></head>
        <body style="text-align:center; font-family: sans-serif; padding: 24px;">
          <h2>${qrProject.name}</h2>
          <p>Scan to register as a new employee</p>
          <img src="${qrDataUrl}" style="width: 320px; height: 320px;" />
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
  };

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
          <TextField
            select
            label="Company"
            value={form.companyId}
            onChange={(e) => setForm({ ...form, companyId: e.target.value })}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">Unassigned</MenuItem>
            {companies.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          <Button type="submit" variant="contained" disabled={submitting}>
            Add
          </Button>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 2, mb: 1 }}>
          Geofence (optional) — flags clock-ins/outs made outside this radius for review, without blocking them.
        </Typography>
        <GeofencePicker
          lat={form.geofenceLat ? Number(form.geofenceLat) : null}
          lng={form.geofenceLng ? Number(form.geofenceLng) : null}
          radiusM={form.geofenceRadiusM ? Number(form.geofenceRadiusM) : null}
          onPick={(lat, lng) => setForm((f) => ({ ...f, geofenceLat: String(lat), geofenceLng: String(lng) }))}
        />
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center", mt: 2 }}>
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
              <TableCell>Company</TableCell>
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
                <TableCell>{companies.find((c) => c.id === p.companyId)?.name ?? "—"}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={p.active ? "Active" : "Inactive"}
                    color={p.active ? "success" : "default"}
                    onClick={() => toggleActive(p)}
                    sx={{ cursor: "pointer" }}
                  />
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
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Button size="small" onClick={() => openQr(p)}>
                      Registration QR
                    </Button>
                    <Button size="small" onClick={() => openEdit(p)}>
                      Edit
                    </Button>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={editing !== null} onClose={closeEdit} maxWidth="sm" fullWidth>
        <DialogTitle>Edit — {editing?.name}</DialogTitle>
        <DialogContent>
          {editError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {editError}
            </Alert>
          )}
          <TextField
            select
            label="Company"
            value={editForm.companyId}
            onChange={(e) => setEditForm({ ...editForm, companyId: e.target.value })}
            fullWidth
            sx={{ mb: 2 }}
          >
            <MenuItem value="">Unassigned</MenuItem>
            {companies.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          <Typography variant="subtitle2" gutterBottom>
            Geofence
          </Typography>
          <Box sx={{ mt: 1, mb: 2 }}>
            <GeofencePicker
              lat={editForm.geofenceLat ? Number(editForm.geofenceLat) : null}
              lng={editForm.geofenceLng ? Number(editForm.geofenceLng) : null}
              radiusM={editForm.geofenceRadiusM ? Number(editForm.geofenceRadiusM) : null}
              onPick={(lat, lng) => setEditForm((f) => ({ ...f, geofenceLat: String(lat), geofenceLng: String(lng) }))}
            />
          </Box>
          <Stack spacing={2}>
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

      <Dialog open={qrProject !== null} onClose={closeQr} maxWidth="xs" fullWidth>
        <DialogTitle>Registration QR — {qrProject?.name}</DialogTitle>
        <DialogContent>
          {qrError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {qrError}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Print this and post it at the job site. Scanning it opens a self-registration form scoped to this
            project — new employees set their own name, phone, PIN, language, and photo, and are active
            immediately.
          </Typography>
          {qrDataUrl && (
            <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
              <img src={qrDataUrl} alt="Registration QR code" width={240} height={240} />
            </Box>
          )}
          {qrUrl && (
            <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-all" }}>
              {qrUrl}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={regenerateQr} color="error" disabled={qrBusy}>
            Regenerate Code
          </Button>
          <Button onClick={closeQr}>Close</Button>
          <Button variant="contained" onClick={printQr} disabled={!qrDataUrl}>
            Print
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
