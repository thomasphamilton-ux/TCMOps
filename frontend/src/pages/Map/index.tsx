import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Box, Typography, Paper, TextField, MenuItem, Alert, Stack, Chip } from "@mui/material";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { FRAUD_RESOLUTION_REASONS } from "../../constants/fraudResolutionReasons";

interface Project {
  id: number;
  code: string;
  name: string;
  geofenceLat: number | null;
  geofenceLng: number | null;
  geofenceRadiusM: number | null;
}

interface LocationPoint {
  id: number;
  type: "in" | "out";
  timestamp: string;
  lat: number;
  lng: number;
  employeeId: number;
  employeeName: string;
}

interface FraudFlag {
  id: number;
  employeeId: number;
  date: string;
  type: string;
  severity: number;
  resolved: boolean;
  underInvestigation: boolean;
}

function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const CLOCK_IN_COLOR = "#2e7d32";
const CLOCK_OUT_COLOR = "#c62828";
const GEOFENCE_COLOR = "#1976d2";
const FLAGGED_RING_COLOR = "#f57c00";

export default function MapPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const canResolve = user?.role === "admin" || user?.role === "manager" || user?.role === "supervisor";

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [start, setStart] = useState(toDateStr(new Date(Date.now() - 6 * 86_400_000)));
  const [end, setEnd] = useState(toDateStr(new Date()));
  const [points, setPoints] = useState<LocationPoint[]>([]);
  const [flags, setFlags] = useState<FraudFlag[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/projects")
      .then((res) => setProjects(res.data))
      .catch(() => setError("Could not load projects."));
  }, []);

  // Non-admin only ever gets back their own single project — select it automatically.
  useEffect(() => {
    if (!isAdmin && projects.length === 1) setSelectedProjectId(String(projects[0].id));
  }, [isAdmin, projects]);

  const geofenceProjects = useMemo(
    () => (selectedProjectId ? projects.filter((p) => String(p.id) === selectedProjectId) : projects),
    [projects, selectedProjectId]
  );

  const load = useCallback(async () => {
    const params: Record<string, unknown> = { start, end };
    if (isAdmin && selectedProjectId) params.projectId = Number(selectedProjectId);
    const res = await api.get("/time/locations", { params });
    setPoints(res.data);
  }, [start, end, selectedProjectId, isAdmin]);

  useEffect(() => {
    load().catch(() => setError("Could not load clock locations."));
  }, [load]);

  const loadFlags = useCallback(async () => {
    const params: Record<string, unknown> = { resolved: "false" };
    if (isAdmin && selectedProjectId) params.projectId = Number(selectedProjectId);
    const res = await api.get("/fraud", { params });
    setFlags(res.data);
  }, [selectedProjectId, isAdmin]);

  useEffect(() => {
    loadFlags().catch(() => setError("Could not load fraud flags."));
  }, [loadFlags]);

  const resolveFlag = useCallback(
    async (flagId: number, reason: string, notes: string) => {
      await api.patch(`/fraud/${flagId}/resolve`, { reason, notes: notes || undefined });
      // Once resolved, that punch is no longer "possible fraud" — refetch both
      // so the marker itself disappears from the map, not just its ring.
      await Promise.all([loadFlags(), load()]);
    },
    [loadFlags, load]
  );

  const investigateFlag = useCallback(
    async (flagId: number) => {
      await api.patch(`/fraud/${flagId}/investigate`);
      await loadFlags();
    },
    [loadFlags]
  );

  // Open geo_mismatch flags, keyed by "employeeId:date" so each clock point can
  // look up whether it was the one that triggered the flag.
  const geoFlagsByEmployeeDate = useMemo(() => {
    const map = new Map<string, FraudFlag[]>();
    for (const flag of flags) {
      if (flag.type !== "geo_mismatch" || flag.resolved) continue;
      const key = `${flag.employeeId}:${flag.date}`;
      const existing = map.get(key) ?? [];
      existing.push(flag);
      map.set(key, existing);
    }
    return map;
  }, [flags]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current).setView([39.8283, -98.5795], 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    layerGroupRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;
    layerGroup.clearLayers();

    const bounds: L.LatLngExpression[] = [];

    for (const project of geofenceProjects) {
      if (project.geofenceLat == null || project.geofenceLng == null || project.geofenceRadiusM == null) continue;
      const center: L.LatLngExpression = [project.geofenceLat, project.geofenceLng];
      L.circle(center, {
        radius: project.geofenceRadiusM,
        color: GEOFENCE_COLOR,
        fillColor: GEOFENCE_COLOR,
        fillOpacity: 0.1,
        weight: 2,
      }).addTo(layerGroup);
      L.circleMarker(center, { radius: 5, color: GEOFENCE_COLOR, fillColor: GEOFENCE_COLOR, fillOpacity: 1 })
        .bindTooltip(`${project.name} geofence center (${project.geofenceRadiusM}m radius)`)
        .addTo(layerGroup);
      bounds.push(center);
    }

    for (const pt of points) {
      const color = pt.type === "in" ? CLOCK_IN_COLOR : CLOCK_OUT_COLOR;
      const pointDate = pt.timestamp.slice(0, 10);
      const matchingFlags = geoFlagsByEmployeeDate.get(`${pt.employeeId}:${pointDate}`) ?? [];

      if (matchingFlags.length > 0) {
        L.circleMarker([pt.lat, pt.lng], {
          radius: 11,
          color: FLAGGED_RING_COLOR,
          weight: 3,
          fillOpacity: 0,
        }).addTo(layerGroup);
      }

      const content = document.createElement("div");
      content.style.minWidth = "200px";
      const title = document.createElement("strong");
      title.textContent = pt.employeeName;
      content.appendChild(title);
      content.appendChild(document.createElement("br"));
      content.appendChild(document.createTextNode(pt.type === "in" ? "Clocked in" : "Clocked out"));
      content.appendChild(document.createElement("br"));
      content.appendChild(document.createTextNode(new Date(pt.timestamp).toLocaleString()));

      if (matchingFlags.length > 0) {
        const warning = document.createElement("div");
        warning.style.color = FLAGGED_RING_COLOR;
        warning.style.fontWeight = "bold";
        warning.style.marginTop = "6px";
        warning.textContent = "⚠ Outside project geofence";
        content.appendChild(warning);

        for (const flag of matchingFlags) {
          if (flag.underInvestigation) {
            const investigating = document.createElement("div");
            investigating.style.color = "#6a1b9a";
            investigating.style.fontWeight = "bold";
            investigating.style.marginTop = "4px";
            investigating.textContent = "🔍 Under investigation — cost coding locked";
            content.appendChild(investigating);
          }

          if (canResolve) {
            if (!flag.underInvestigation) {
              const investigateButton = document.createElement("button");
              investigateButton.textContent = "Investigate";
              investigateButton.style.marginTop = "6px";
              investigateButton.style.cursor = "pointer";
              investigateButton.onclick = () => {
                investigateButton.disabled = true;
                investigateButton.textContent = "Flagging...";
                investigateFlag(flag.id).catch(() => setError("Could not flag for investigation."));
              };
              content.appendChild(investigateButton);
            }

            const resolveBox = document.createElement("div");
            resolveBox.style.marginTop = "8px";
            resolveBox.style.borderTop = "1px solid #ddd";
            resolveBox.style.paddingTop = "6px";

            const reasonSelect = document.createElement("select");
            reasonSelect.style.display = "block";
            reasonSelect.style.width = "100%";
            reasonSelect.style.marginBottom = "4px";
            const placeholderOption = document.createElement("option");
            placeholderOption.value = "";
            placeholderOption.textContent = "Resolution reason...";
            reasonSelect.appendChild(placeholderOption);
            for (const r of FRAUD_RESOLUTION_REASONS) {
              const opt = document.createElement("option");
              opt.value = r.value;
              opt.textContent = r.label;
              reasonSelect.appendChild(opt);
            }
            resolveBox.appendChild(reasonSelect);

            const notesInput = document.createElement("input");
            notesInput.type = "text";
            notesInput.placeholder = "Notes (optional)";
            notesInput.style.display = "block";
            notesInput.style.width = "100%";
            notesInput.style.boxSizing = "border-box";
            notesInput.style.marginBottom = "4px";
            resolveBox.appendChild(notesInput);

            const resolveError = document.createElement("div");
            resolveError.style.color = CLOCK_OUT_COLOR;
            resolveError.style.fontSize = "12px";
            resolveError.style.display = "none";
            resolveError.textContent = "Pick a reason first.";
            resolveBox.appendChild(resolveError);

            const resolveButton = document.createElement("button");
            resolveButton.textContent = "Resolve";
            resolveButton.style.cursor = "pointer";
            resolveButton.onclick = () => {
              if (!reasonSelect.value) {
                resolveError.style.display = "block";
                return;
              }
              resolveButton.disabled = true;
              resolveButton.textContent = "Resolving...";
              resolveFlag(flag.id, reasonSelect.value, notesInput.value).catch(() => setError("Could not resolve flag."));
            };
            resolveBox.appendChild(resolveButton);

            content.appendChild(resolveBox);
          }
        }
      }

      L.circleMarker([pt.lat, pt.lng], { radius: 7, color, fillColor: color, fillOpacity: 0.85, weight: 1 })
        .bindPopup(content)
        .addTo(layerGroup);
      bounds.push([pt.lat, pt.lng]);
    }

    if (bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 16 });
    }
  }, [points, geofenceProjects, geoFlagsByEmployeeDate, canResolve, resolveFlag, investigateFlag]);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Map
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Only clock-ins/outs outside a project's geofence appear here for review — punches inside the geofence are
        logged but not shown.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 2, display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
        <TextField
          label="Start"
          type="date"
          size="small"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label="End"
          type="date"
          size="small"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        {isAdmin && (
          <TextField
            select
            label="Project"
            size="small"
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="">All Projects</MenuItem>
            {projects.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name}
              </MenuItem>
            ))}
          </TextField>
        )}

        <Stack direction="row" spacing={1} sx={{ ml: "auto" }}>
          <Chip size="small" label="Clock in" sx={{ bgcolor: CLOCK_IN_COLOR, color: "#fff" }} />
          <Chip size="small" label="Clock out" sx={{ bgcolor: CLOCK_OUT_COLOR, color: "#fff" }} />
          <Chip size="small" label="Geofence" sx={{ bgcolor: GEOFENCE_COLOR, color: "#fff" }} />
          <Chip size="small" label="Flagged" sx={{ bgcolor: FLAGGED_RING_COLOR, color: "#fff" }} />
        </Stack>
      </Paper>

      <Paper sx={{ height: 560, overflow: "hidden" }}>
        <Box ref={mapContainerRef} sx={{ width: "100%", height: "100%" }} />
      </Paper>

      {points.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          No possible fraud activity in this range.
        </Typography>
      )}
    </Box>
  );
}
