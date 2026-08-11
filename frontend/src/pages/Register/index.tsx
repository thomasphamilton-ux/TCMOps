import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Box, Typography, TextField, Button, Alert, Paper, MenuItem, Stack, Avatar } from "@mui/material";
import { useAuth } from "../../context/AuthContext";
import Logo from "../../components/Logo";
import CameraCapture from "../../components/CameraCapture";
import { LANGUAGE_OPTIONS } from "../../constants/languages";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [language, setLanguage] = useState("en");
  const [photo, setPhoto] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!photo) {
      setError("Take a photo before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      await register({ token, name, phone, pin, language, image: photo });
      navigate("/clock");
    } catch (err: any) {
      setError(err.response?.data?.error || "Registration failed. Check your details and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", bgcolor: "grey.100" }}>
        <Paper sx={{ p: 4, width: 360 }}>
          <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
            <Logo size={120} />
          </Box>
          <Alert severity="error">
            Invalid registration link. Scan the QR code posted at your project site to register.
          </Alert>
        </Paper>
      </Box>
    );
  }

  return (
    <Box
      sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", bgcolor: "grey.100", py: 4 }}
    >
      <Paper sx={{ p: 4, width: 360 }} component="form" onSubmit={handleSubmit}>
        <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
          <Logo size={120} />
        </Box>
        <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 3 }}>
          New employee registration
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <TextField label="Full Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth margin="normal" autoFocus required />
        <TextField label="Phone Number" value={phone} onChange={(e) => setPhone(e.target.value)} fullWidth margin="normal" required />
        <TextField
          label="Choose a PIN"
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          fullWidth
          margin="normal"
          required
          helperText="4–8 digits, used to sign in and clock in/out"
        />
        <TextField
          select
          label="Language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          fullWidth
          margin="normal"
        >
          {LANGUAGE_OPTIONS.map((l) => (
            <MenuItem key={l.value} value={l.value}>
              {l.label}
            </MenuItem>
          ))}
        </TextField>

        <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 2, mb: 1 }}>
          <Avatar src={photo ?? undefined} sx={{ width: 56, height: 56 }} />
          <Button variant="outlined" onClick={() => setCameraOpen(true)} type="button">
            {photo ? "Retake Photo" : "Take Photo"}
          </Button>
        </Stack>

        <Button type="submit" variant="contained" fullWidth sx={{ mt: 2 }} disabled={submitting}>
          {submitting ? "Submitting..." : "Register"}
        </Button>
      </Paper>

      <CameraCapture
        open={cameraOpen}
        title="Take a Photo"
        onCancel={() => setCameraOpen(false)}
        onCapture={(image) => {
          setPhoto(image);
          setCameraOpen(false);
        }}
      />
    </Box>
  );
}
