import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Button,
  Alert,
  FormControlLabel,
  Checkbox,
} from "@mui/material";
import { FRAUD_RESOLUTION_REASONS } from "../constants/fraudResolutionReasons";

interface ResolveFlagDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string, notes: string, denyHours: boolean) => Promise<void>;
}

export default function ResolveFlagDialog({ open, onClose, onSubmit }: ResolveFlagDialogProps) {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [denyHours, setDenyHours] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setReason("");
      setNotes("");
      setDenyHours(false);
      setError("");
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!reason) return;
    setSubmitting(true);
    setError("");
    try {
      await onSubmit(reason, notes, denyHours);
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not resolve flag.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Resolve Fraud Flag</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <TextField
          select
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          fullWidth
          required
          sx={{ mt: 1, mb: 2 }}
        >
          {FRAUD_RESOLUTION_REASONS.map((r) => (
            <MenuItem key={r.value} value={r.value}>
              {r.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          fullWidth
          multiline
          minRows={2}
          sx={{ mb: 1 }}
        />
        <FormControlLabel
          control={<Checkbox checked={denyHours} onChange={(e) => setDenyHours(e.target.checked)} />}
          label="Deny hours for this day"
          title="Keeps the cost-coded entries for audit but excludes them from report/dashboard totals"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!reason || submitting}>
          {submitting ? "Resolving..." : "Resolve"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
