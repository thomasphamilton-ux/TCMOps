import { useState, useEffect, useCallback, useMemo, type FormEvent } from "react";
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
import { useAuth } from "../../context/AuthContext";

interface PayInquiry {
  id: number;
  employeeId: number;
  subject: string;
  message: string;
  resolved: boolean;
  response: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

interface UserOption {
  id: number;
  name: string;
}

// Same set the backend allows to resolve an inquiry (see
// backend/plugins/pay-inquiries/index.ts) — the "leadership" this feature
// routes an inquiry to: the employee's foreman, their project's
// supervisor/manager, and admin.
const LEADERSHIP_ROLES = ["admin", "manager", "supervisor", "foreman"];

export default function PayInquiriesPage() {
  const { user: authUser } = useAuth();
  const canManage = !!authUser && LEADERSHIP_ROLES.includes(authUser.role);
  const [inquiries, setInquiries] = useState<PayInquiry[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [error, setError] = useState("");

  const [form, setForm] = useState({ subject: "", message: "" });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const res = await api.get("/pay-inquiries");
    setInquiries(res.data);
  }, []);

  useEffect(() => {
    load().catch(() => setError("Could not load pay inquiries."));
  }, [load]);

  useEffect(() => {
    if (!canManage) return;
    api
      .get("/users")
      .then((res) => setUsers(res.data))
      .catch(() => setError("Could not load users."));
  }, [canManage]);

  const employeeNameById = useMemo(() => new Map<number, string>(users.map((u) => [u.id, u.name])), [users]);

  const mine = inquiries.filter((i) => i.employeeId === authUser?.id);
  // The server already scopes /pay-inquiries to what this role may see (own
  // team for foreman, own project for supervisor/manager, everything for
  // admin) — this just splits "my own" out from "everyone else's" for display.
  const others = canManage ? inquiries.filter((i) => i.employeeId !== authUser?.id) : [];

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.post("/pay-inquiries", form);
      setForm({ subject: "", message: "" });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not submit inquiry.");
    } finally {
      setSubmitting(false);
    }
  };

  const [responding, setResponding] = useState<PayInquiry | null>(null);
  const [responseText, setResponseText] = useState("");
  const [respondError, setRespondError] = useState("");
  const [respondSaving, setRespondSaving] = useState(false);

  const openRespond = (inquiry: PayInquiry) => {
    setResponding(inquiry);
    setResponseText("");
    setRespondError("");
  };

  const closeRespond = () => setResponding(null);

  const submitResponse = async () => {
    if (!responding) return;
    setRespondSaving(true);
    setRespondError("");
    try {
      await api.patch(`/pay-inquiries/${responding.id}/resolve`, { response: responseText });
      setResponding(null);
      await load();
    } catch (err: any) {
      setRespondError(err.response?.data?.error || "Could not send response.");
    } finally {
      setRespondSaving(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Pay Inquiries
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 3 }} component="form" onSubmit={handleCreate}>
        <Typography variant="h6" gutterBottom>
          Submit a Pay Inquiry
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Questions or disputes about your pay go to your team's leadership for review.
        </Typography>
        <Stack spacing={2} sx={{ maxWidth: 480 }}>
          <TextField
            label="Subject"
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            required
          />
          <TextField
            label="Message"
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            required
            multiline
            minRows={3}
          />
          <Button type="submit" variant="contained" disabled={submitting} sx={{ alignSelf: "flex-start" }}>
            Submit
          </Button>
        </Stack>
      </Paper>

      <Typography variant="h6" gutterBottom>
        My Inquiries
      </Typography>
      <Paper sx={{ mb: 4, overflowX: "auto" }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Submitted</TableCell>
              <TableCell>Subject</TableCell>
              <TableCell>Message</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Response</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {mine.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Typography variant="body2" color="text.secondary">
                    You haven't submitted any pay inquiries.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {mine.map((i) => (
              <TableRow key={i.id}>
                <TableCell>{new Date(i.createdAt).toLocaleString()}</TableCell>
                <TableCell>{i.subject}</TableCell>
                <TableCell sx={{ maxWidth: 280, whiteSpace: "pre-wrap" }}>{i.message}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={i.resolved ? "Resolved" : "Open"}
                    color={i.resolved ? "success" : "warning"}
                  />
                </TableCell>
                <TableCell sx={{ maxWidth: 280, whiteSpace: "pre-wrap" }}>{i.response ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      {canManage && (
        <>
          <Typography variant="h6" gutterBottom>
            Team Pay Inquiries
          </Typography>
          <Paper sx={{ overflowX: "auto" }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Submitted</TableCell>
                  <TableCell>Employee</TableCell>
                  <TableCell>Subject</TableCell>
                  <TableCell>Message</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Response</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {others.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <Typography variant="body2" color="text.secondary">
                        No pay inquiries from your team.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
                {others.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{new Date(i.createdAt).toLocaleString()}</TableCell>
                    <TableCell>{employeeNameById.get(i.employeeId) ?? `Employee #${i.employeeId}`}</TableCell>
                    <TableCell>{i.subject}</TableCell>
                    <TableCell sx={{ maxWidth: 280, whiteSpace: "pre-wrap" }}>{i.message}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={i.resolved ? "Resolved" : "Open"}
                        color={i.resolved ? "success" : "warning"}
                      />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 280, whiteSpace: "pre-wrap" }}>{i.response ?? "—"}</TableCell>
                    <TableCell align="right">
                      {!i.resolved && (
                        <Button size="small" onClick={() => openRespond(i)}>
                          Respond
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </>
      )}

      <Dialog open={responding !== null} onClose={closeRespond} maxWidth="xs" fullWidth>
        <DialogTitle>
          Respond — {responding && (employeeNameById.get(responding.employeeId) ?? `Employee #${responding.employeeId}`)}
        </DialogTitle>
        <DialogContent>
          {respondError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {respondError}
            </Alert>
          )}
          {responding && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Box>
                <Typography variant="subtitle2">{responding.subject}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
                  {responding.message}
                </Typography>
              </Box>
              <TextField
                label="Response"
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                required
                multiline
                minRows={3}
                autoFocus
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeRespond}>Cancel</Button>
          <Button variant="contained" onClick={submitResponse} disabled={respondSaving || !responseText.trim()}>
            {respondSaving ? "Sending..." : "Send & Resolve"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
