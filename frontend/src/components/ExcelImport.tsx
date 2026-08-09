import { useState } from "react";
import { Paper, Typography, Stack, Button, Alert, Box } from "@mui/material";
import api from "../api/client";
import { readFileAsBase64 } from "../utils/file";

interface ImportResult {
  imported: number;
  errors: string[];
}

interface ExcelImportProps {
  title: string;
  endpoint: string;
  templateEndpoint: string;
  templateFilename: string;
  columnsHint: string;
  onImported: () => void;
}

export default function ExcelImport({
  title,
  endpoint,
  templateEndpoint,
  templateFilename,
  columnsHint,
  onImported,
}: ExcelImportProps) {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  const handleDownloadTemplate = async () => {
    const res = await api.get(templateEndpoint, { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = templateFilename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setError("");
    setResult(null);
    try {
      const base64 = await readFileAsBase64(file);
      const res = await api.post(endpoint, { file: base64 });
      setResult(res.data);
      setFile(null);
      onImported();
    } catch (err: any) {
      setError(err.response?.data?.error || "Import failed.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Paper sx={{ p: 2, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Excel file (.xlsx) with a header row containing: {columnsHint}
      </Typography>
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
        <Button variant="text" onClick={handleDownloadTemplate}>
          Download Template
        </Button>
        <Button component="label" variant="outlined">
          {file ? file.name : "Choose File"}
          <input
            type="file"
            hidden
            accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </Button>
        <Button variant="contained" disabled={!file || importing} onClick={handleImport}>
          {importing ? "Importing..." : "Import"}
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      {result && (
        <Alert severity={result.errors.length > 0 ? "warning" : "success"} sx={{ mt: 2 }}>
          Imported {result.imported} row{result.imported === 1 ? "" : "s"}.
          {result.errors.length > 0 && (
            <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2 }}>
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </Box>
          )}
        </Alert>
      )}
    </Paper>
  );
}
