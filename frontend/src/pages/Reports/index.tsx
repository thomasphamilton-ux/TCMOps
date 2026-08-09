import { useState, type FormEvent } from "react";
import { Box, Typography, TextField, MenuItem, Button, Alert, Paper, Link as MuiLink } from "@mui/material";
import api from "../../api/client";

export default function ReportsPage() {
  const [type, setType] = useState<"daily" | "weekly">("weekly");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [result, setResult] = useState<{ excelUrl: string | null; pdfUrl: string | null } | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const apiBase = (api.defaults.baseURL || "").replace(/\/$/, "");

  const handleGenerate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setResult(null);
    try {
      const res = await api.post("/exports", {
        type,
        startDate,
        endDate: type === "daily" ? startDate : endDate,
      });
      setResult({ excelUrl: res.data.excelUrl, pdfUrl: res.data.pdfUrl });
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not generate export.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 480 }}>
      <Typography variant="h4" gutterBottom>
        Exports
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 3 }} component="form" onSubmit={handleGenerate}>
        <TextField
          select
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value as "daily" | "weekly")}
          fullWidth
          margin="normal"
        >
          <MenuItem value="daily">Daily</MenuItem>
          <MenuItem value="weekly">Weekly</MenuItem>
        </TextField>
        <TextField
          label={type === "daily" ? "Date" : "Start Date"}
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          fullWidth
          margin="normal"
          InputLabelProps={{ shrink: true }}
          required
        />
        {type === "weekly" && (
          <TextField
            label="End Date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            fullWidth
            margin="normal"
            InputLabelProps={{ shrink: true }}
            required
          />
        )}
        <Button type="submit" variant="contained" fullWidth sx={{ mt: 2 }} disabled={submitting}>
          {submitting ? "Generating..." : "Generate Export"}
        </Button>
      </Paper>

      {result && (
        <Box sx={{ mt: 3, display: "flex", gap: 2 }}>
          {result.excelUrl && (
            <MuiLink href={`${apiBase}${result.excelUrl}`} target="_blank" rel="noopener">
              Download Excel
            </MuiLink>
          )}
          {result.pdfUrl && (
            <MuiLink href={`${apiBase}${result.pdfUrl}`} target="_blank" rel="noopener">
              Download PDF
            </MuiLink>
          )}
        </Box>
      )}
    </Box>
  );
}
