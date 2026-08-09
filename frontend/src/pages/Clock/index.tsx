import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  Button,
  Alert,
  Chip,
  Stack,
  List,
  ListItem,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import { useAuth } from "../../context/AuthContext";
import api from "../../api/client";
import CameraCapture from "../../components/CameraCapture";
import SignaturePad from "../../components/SignaturePad";

interface ClockEvent {
  id: number;
  type: "in" | "out";
  timestamp: string;
}

interface DailyTimeRecord {
  id: number;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  clockEvents: ClockEvent[];
}

// Best-effort location for the optional per-project geofence check on the
// backend — never blocks clocking in/out, so any failure (denied permission,
// unsupported browser, timeout) just resolves to null and is silently omitted.
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

export default function ClockPage() {
  const { user } = useAuth();
  const [today, setToday] = useState<DailyTimeRecord | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cameraFor, setCameraFor] = useState<"in" | "out" | null>(null);

  const [attestationText, setAttestationText] = useState("");
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [pendingOutImage, setPendingOutImage] = useState<string | null>(null);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [signatureError, setSignatureError] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    const [dailyRes, attestationRes] = await Promise.all([
      api.get(`/time/daily/${user.id}`),
      api.get("/time/attestation-text"),
    ]);
    setToday(dailyRes.data[0] ?? null);
    setAttestationText(attestationRes.data.text);
  }, [user]);

  useEffect(() => {
    load().catch(() => setError("Could not load today's status."));
  }, [load]);

  const doClockIn = async (image: string) => {
    if (!user) return;
    setBusy(true);
    setError("");
    try {
      const location = await getLocation();
      await api.post("/auth/facial", { image });
      await api.post("/time/clock-in", {
        employeeId: user.id,
        timestamp: new Date().toISOString(),
        image,
        ...(location ? { lat: location.lat, lng: location.lng } : {}),
      });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Clock-in failed.");
    } finally {
      setBusy(false);
    }
  };

  const doClockOut = async (image: string, signature: string) => {
    if (!user) return;
    setBusy(true);
    try {
      const location = await getLocation();
      await api.post("/auth/facial", { image });
      await api.post("/time/clock-out", {
        employeeId: user.id,
        timestamp: new Date().toISOString(),
        image,
        signature,
        ...(location ? { lat: location.lat, lng: location.lng } : {}),
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleCapture = (image: string) => {
    const action = cameraFor;
    setCameraFor(null);
    if (action === "in") void doClockIn(image);
    if (action === "out") {
      setPendingOutImage(image);
      setSignatureData(null);
      setSignatureError("");
      setSignatureOpen(true);
    }
  };

  const closeSignature = () => {
    setSignatureOpen(false);
    setPendingOutImage(null);
    setSignatureData(null);
  };

  const submitSignature = async () => {
    if (!pendingOutImage || !signatureData) return;
    setSignatureError("");
    try {
      await doClockOut(pendingOutImage, signatureData);
      setSignatureOpen(false);
      setPendingOutImage(null);
      setSignatureData(null);
    } catch (err: any) {
      setSignatureError(err.response?.data?.error || "Could not submit clock-out. Try again.");
    }
  };

  const events = today?.clockEvents ?? [];
  const currentlyIn = events.length > 0 && events[events.length - 1].type === "in";

  return (
    <Box sx={{ maxWidth: 480 }}>
      <Typography variant="h4" gutterBottom>
        Clock In / Out
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Stack direction="row" spacing={1} sx={{ mb: 3 }} flexWrap="wrap">
        <Chip
          label={currentlyIn ? "Clocked in" : events.length > 0 ? "Clocked out" : "Not clocked in"}
          color={currentlyIn ? "success" : "default"}
        />
      </Stack>

      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <Button variant="contained" onClick={() => setCameraFor("in")} disabled={busy || currentlyIn}>
          Clock In
        </Button>
        <Button variant="outlined" onClick={() => setCameraFor("out")} disabled={busy || !currentlyIn}>
          Clock Out
        </Button>
      </Stack>

      {events.length > 0 && (
        <>
          <Typography variant="subtitle1">Today's activity</Typography>
          <List dense>
            {events.map((e) => (
              <ListItem key={e.id} disableGutters>
                <ListItemText
                  primary={`${e.type === "in" ? "Clocked in" : "Clocked out"} — ${new Date(
                    e.timestamp
                  ).toLocaleTimeString()}`}
                />
              </ListItem>
            ))}
          </List>
        </>
      )}

      <CameraCapture
        open={cameraFor !== null}
        title={cameraFor === "in" ? "Clock In — Take a photo" : "Clock Out — Take a photo"}
        onCancel={() => setCameraFor(null)}
        onCapture={handleCapture}
      />

      <Dialog open={signatureOpen} onClose={closeSignature} maxWidth="sm" fullWidth>
        <DialogTitle>Sign to Clock Out</DialogTitle>
        <DialogContent>
          {signatureError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {signatureError}
            </Alert>
          )}
          <Typography variant="body2" sx={{ mb: 2 }}>
            {attestationText}
          </Typography>
          <SignaturePad onChange={setSignatureData} />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeSignature}>Cancel</Button>
          <Button variant="contained" onClick={submitSignature} disabled={!signatureData || busy}>
            {busy ? "Submitting..." : "Attest & Clock Out"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
