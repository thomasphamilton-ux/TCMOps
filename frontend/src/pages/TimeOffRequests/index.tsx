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
  MenuItem,
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
import SignaturePad from "../../components/SignaturePad";

interface TimeOffRequest {
  id: number;
  employeeId: number;
  startDate: string;
  endDate: string;
  hoursPerDay: number;
  type: "vacation" | "unpaid" | "turnaround" | "other";
  notes: string | null;
  status: "pending_foreman" | "pending_supervisor" | "pending_manager" | "approved" | "denied";
  foremanApprovedBy: number | null;
  foremanApprovedAt: string | null;
  supervisorApprovedBy: number | null;
  supervisorApprovedAt: string | null;
  managerApprovedBy: number | null;
  managerApprovedAt: string | null;
  deniedBy: number | null;
  deniedAt: string | null;
  denialReason: string | null;
  createdAt: string;
}

interface UserOption {
  id: number;
  name: string;
  ptoBalanceHours: number | null;
}

// Matches the backend's role gates (see backend/plugins/time-off-requests/index.ts):
// foreman-approve reachable by any of these, supervisor-approve/export-pdf by
// LEADERSHIP_NON_FOREMAN_ROLES, manager-approve by LEADERSHIP_MANAGER_ROLES only.
const LEADERSHIP_ROLES = ["admin", "manager", "supervisor", "foreman"];
const LEADERSHIP_NON_FOREMAN_ROLES = ["admin", "manager", "supervisor"];
const LEADERSHIP_MANAGER_ROLES = ["admin", "manager"];

const PENDING_STATUSES = ["pending_foreman", "pending_supervisor", "pending_manager"];

// Base turnaround entitlement — must match TURNAROUND_BASE_DAYS in
// backend/plugins/time-off-requests/service.ts. A turnaround longer than
// this also needs a manager's sign-off.
const TURNAROUND_BASE_DAYS = 4;

const TYPE_LABELS: Record<TimeOffRequest["type"], string> = {
  vacation: "Vacation",
  unpaid: "Unpaid",
  turnaround: "Turnaround",
  other: "Other",
};

const STATUS_LABELS: Record<TimeOffRequest["status"], string> = {
  pending_foreman: "Pending Foreman",
  pending_supervisor: "Pending Supervisor",
  pending_manager: "Pending Manager",
  approved: "Approved",
  denied: "Denied",
};

const STATUS_COLORS: Record<TimeOffRequest["status"], "warning" | "info" | "success" | "error"> = {
  pending_foreman: "warning",
  pending_supervisor: "info",
  pending_manager: "info",
  approved: "success",
  denied: "error",
};

function daysInRange(start: string, end: string): number {
  const startMs = new Date(`${start}T00:00:00Z`).getTime();
  const endMs = new Date(`${end}T00:00:00Z`).getTime();
  return Math.round((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1;
}

function needsManagerApproval(r: Pick<TimeOffRequest, "type" | "startDate" | "endDate">): boolean {
  return r.type === "turnaround" && daysInRange(r.startDate, r.endDate) > TURNAROUND_BASE_DAYS;
}

export default function TimeOffRequestsPage() {
  const { user: authUser } = useAuth();
  const canManage = !!authUser && LEADERSHIP_ROLES.includes(authUser.role);
  const canActSupervisorStage = !!authUser && LEADERSHIP_NON_FOREMAN_ROLES.includes(authUser.role);
  const canManagerApprove = !!authUser && LEADERSHIP_MANAGER_ROLES.includes(authUser.role);

  const [requests, setRequests] = useState<TimeOffRequest[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [error, setError] = useState("");

  const [form, setForm] = useState({ startDate: "", endDate: "", hoursPerDay: "8", type: "vacation", notes: "" });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const res = await api.get("/time-off-requests");
    setRequests(res.data);
  }, []);

  useEffect(() => {
    load().catch(() => setError("Could not load time off requests."));
  }, [load]);

  useEffect(() => {
    if (!canManage) return;
    api
      .get("/users")
      .then((res) => setUsers(res.data))
      .catch(() => setError("Could not load users."));
  }, [canManage]);

  const userById = useMemo(() => new Map<number, UserOption>(users.map((u) => [u.id, u])), [users]);

  const mine = requests.filter((r) => r.employeeId === authUser?.id);
  const others = canManage ? requests.filter((r) => r.employeeId !== authUser?.id) : [];

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.post("/time-off-requests", {
        startDate: form.startDate,
        endDate: form.endDate,
        hoursPerDay: Number(form.hoursPerDay),
        type: form.type,
        notes: form.notes || undefined,
      });
      setForm({ startDate: "", endDate: "", hoursPerDay: "8", type: "vacation", notes: "" });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not submit request.");
    } finally {
      setSubmitting(false);
    }
  };

  // Unified approve dialog for both stages — which endpoint it calls is
  // derived from the request's current status when opened.
  const [approving, setApproving] = useState<TimeOffRequest | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [approveError, setApproveError] = useState("");
  const [approveSaving, setApproveSaving] = useState(false);

  const openApprove = (request: TimeOffRequest) => {
    setApproving(request);
    setSignature(null);
    setApproveError("");
  };

  const closeApprove = () => setApproving(null);

  const submitApprove = async () => {
    if (!approving || !signature) return;
    setApproveSaving(true);
    setApproveError("");
    try {
      const stage =
        approving.status === "pending_foreman"
          ? "foreman-approve"
          : approving.status === "pending_supervisor"
            ? "supervisor-approve"
            : "manager-approve";
      await api.patch(`/time-off-requests/${approving.id}/${stage}`, { signature });
      setApproving(null);
      await load();
    } catch (err: any) {
      setApproveError(err.response?.data?.error || "Could not save approval.");
    } finally {
      setApproveSaving(false);
    }
  };

  const [denying, setDenying] = useState<TimeOffRequest | null>(null);
  const [denyReason, setDenyReason] = useState("");
  const [denyError, setDenyError] = useState("");
  const [denySaving, setDenySaving] = useState(false);

  const openDeny = (request: TimeOffRequest) => {
    setDenying(request);
    setDenyReason("");
    setDenyError("");
  };

  const closeDeny = () => setDenying(null);

  const submitDeny = async () => {
    if (!denying) return;
    setDenySaving(true);
    setDenyError("");
    try {
      await api.patch(`/time-off-requests/${denying.id}/deny`, { reason: denyReason });
      setDenying(null);
      await load();
    } catch (err: any) {
      setDenyError(err.response?.data?.error || "Could not deny request.");
    } finally {
      setDenySaving(false);
    }
  };

  const [exportingId, setExportingId] = useState<number | null>(null);

  const exportPdf = async (request: TimeOffRequest) => {
    setExportingId(request.id);
    setError("");
    try {
      const res = await api.get(`/time-off-requests/${request.id}/export-pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `time-off-request-${request.id}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not export PDF.");
    } finally {
      setExportingId(null);
    }
  };

  const renderRequestRow = (r: TimeOffRequest, showEmployee: boolean) => {
    const employee = userById.get(r.employeeId);
    const total = r.hoursPerDay * daysInRange(r.startDate, r.endDate);
    return (
      <TableRow key={r.id}>
        {showEmployee && <TableCell>{employee?.name ?? `Employee #${r.employeeId}`}</TableCell>}
        <TableCell>
          {r.startDate} → {r.endDate}
        </TableCell>
        <TableCell>{TYPE_LABELS[r.type]}</TableCell>
        <TableCell align="right">{r.hoursPerDay.toFixed(1)}</TableCell>
        <TableCell align="right">{total.toFixed(1)}</TableCell>
        {showEmployee && (
          <TableCell align="right">
            {r.type === "vacation" ? (employee?.ptoBalanceHours != null ? employee.ptoBalanceHours.toFixed(1) : "—") : "—"}
          </TableCell>
        )}
        <TableCell>
          <Chip size="small" label={STATUS_LABELS[r.status]} color={STATUS_COLORS[r.status]} />
        </TableCell>
        <TableCell>
          {r.status === "denied" ? (
            <Typography variant="body2" color="text.secondary">
              {r.denialReason}
            </Typography>
          ) : (
            <Stack spacing={0.25}>
              <Typography variant="caption" color="text.secondary">
                Foreman: {r.foremanApprovedAt ? new Date(r.foremanApprovedAt).toLocaleDateString() : "—"}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Supervisor: {r.supervisorApprovedAt ? new Date(r.supervisorApprovedAt).toLocaleDateString() : "—"}
              </Typography>
              {needsManagerApproval(r) && (
                <Typography variant="caption" color="text.secondary">
                  Manager: {r.managerApprovedAt ? new Date(r.managerApprovedAt).toLocaleDateString() : "—"}
                </Typography>
              )}
            </Stack>
          )}
        </TableCell>
        {showEmployee && (
          <TableCell align="right">
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              {r.status === "pending_foreman" && (
                <Button size="small" onClick={() => openApprove(r)}>
                  Sign & Approve
                </Button>
              )}
              {r.status === "pending_supervisor" && canActSupervisorStage && (
                <Button size="small" onClick={() => openApprove(r)}>
                  Sign & Approve
                </Button>
              )}
              {r.status === "pending_manager" && canManagerApprove && (
                <Button size="small" onClick={() => openApprove(r)}>
                  Sign & Approve
                </Button>
              )}
              {PENDING_STATUSES.includes(r.status) && (
                <Button size="small" color="error" onClick={() => openDeny(r)}>
                  Deny
                </Button>
              )}
              {r.status === "approved" && canActSupervisorStage && (
                <Button size="small" onClick={() => exportPdf(r)} disabled={exportingId === r.id}>
                  {exportingId === r.id ? "Exporting..." : "Export PDF"}
                </Button>
              )}
            </Stack>
          </TableCell>
        )}
      </TableRow>
    );
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Time Off Requests
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 3 }} component="form" onSubmit={handleCreate}>
        <Typography variant="h6" gutterBottom>
          Submit a Time Off Request
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Goes to your team's foreman for signature, then your supervisor, before it's ready for payroll.
        </Typography>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "flex-start" }}>
          <TextField
            label="From"
            type="date"
            value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            required
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="To"
            type="date"
            value={form.endDate}
            onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            required
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Hours per day"
            type="number"
            value={form.hoursPerDay}
            onChange={(e) => setForm({ ...form, hoursPerDay: e.target.value })}
            required
            inputProps={{ step: "0.5", min: 0.5, max: 8 }}
            sx={{ width: 150 }}
          />
          <TextField
            select
            label="Type"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="vacation">Vacation</MenuItem>
            <MenuItem value="unpaid">Unpaid</MenuItem>
            <MenuItem value="turnaround">Turnaround</MenuItem>
            <MenuItem value="other">Other</MenuItem>
          </TextField>
          <TextField
            label="Notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            sx={{ minWidth: 220 }}
          />
          <Button type="submit" variant="contained" disabled={submitting} sx={{ mt: 0.5 }}>
            Submit
          </Button>
        </Box>
        {form.type === "vacation" && (
          <Alert severity="info" sx={{ mt: 2, maxWidth: 560 }}>
            Paid time off is subject to a review of available PTO balance, approval is not a guarantee of payment of
            PTO Hours.
          </Alert>
        )}
        {form.type === "turnaround" && (
          <Alert severity="info" sx={{ mt: 2, maxWidth: 560 }}>
            Turnaround requests must be at least {TURNAROUND_BASE_DAYS} days and include a Saturday and a Sunday. Per
            diem is paid during turnaround. Any additional days off beyond the {TURNAROUND_BASE_DAYS}-day turnaround
            also require a manager's approval.
          </Alert>
        )}
      </Paper>

      <Typography variant="h6" gutterBottom>
        My Requests
      </Typography>
      <Paper sx={{ mb: 4, overflowX: "auto" }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Dates</TableCell>
              <TableCell>Type</TableCell>
              <TableCell align="right">Hrs/Day</TableCell>
              <TableCell align="right">Total Hrs</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Signatures</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {mine.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography variant="body2" color="text.secondary">
                    You haven't submitted any time off requests.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {mine.map((r) => renderRequestRow(r, false))}
          </TableBody>
        </Table>
      </Paper>

      {canManage && (
        <>
          <Typography variant="h6" gutterBottom>
            Team Requests
          </Typography>
          <Paper sx={{ overflowX: "auto" }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Employee</TableCell>
                  <TableCell>Dates</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Hrs/Day</TableCell>
                  <TableCell align="right">Total Hrs</TableCell>
                  <TableCell align="right">PTO Balance</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Signatures</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {others.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <Typography variant="body2" color="text.secondary">
                        No time off requests from your team.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
                {others.map((r) => renderRequestRow(r, true))}
              </TableBody>
            </Table>
          </Paper>
        </>
      )}

      <Dialog open={approving !== null} onClose={closeApprove} maxWidth="xs" fullWidth>
        <DialogTitle>
          {approving?.status === "pending_foreman"
            ? "Foreman Approval"
            : approving?.status === "pending_supervisor"
              ? "Supervisor Approval"
              : "Manager Approval"}{" "}
          — {approving && (userById.get(approving.employeeId)?.name ?? `Employee #${approving.employeeId}`)}
        </DialogTitle>
        <DialogContent>
          {approveError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {approveError}
            </Alert>
          )}
          {approving && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Box>
                <Typography variant="body2">
                  {TYPE_LABELS[approving.type]}: {approving.startDate} → {approving.endDate} (
                  {approving.hoursPerDay.toFixed(1)} hrs/day)
                </Typography>
                {approving.notes && (
                  <Typography variant="body2" color="text.secondary">
                    {approving.notes}
                  </Typography>
                )}
                {approving.type === "vacation" && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    PTO balance:{" "}
                    {userById.get(approving.employeeId)?.ptoBalanceHours != null
                      ? `${userById.get(approving.employeeId)!.ptoBalanceHours!.toFixed(1)} hrs`
                      : "not tracked"}
                  </Typography>
                )}
                {approving.status === "pending_supervisor" && needsManagerApproval(approving) && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    This turnaround exceeds the {TURNAROUND_BASE_DAYS}-day base entitlement — a manager will also
                    need to approve after you.
                  </Typography>
                )}
              </Box>
              <Typography variant="subtitle2">Sign to approve</Typography>
              <SignaturePad onChange={setSignature} />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeApprove}>Cancel</Button>
          <Button variant="contained" onClick={submitApprove} disabled={approveSaving || !signature}>
            {approveSaving ? "Saving..." : "Approve"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={denying !== null} onClose={closeDeny} maxWidth="xs" fullWidth>
        <DialogTitle>
          Deny Request — {denying && (userById.get(denying.employeeId)?.name ?? `Employee #${denying.employeeId}`)}
        </DialogTitle>
        <DialogContent>
          {denyError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {denyError}
            </Alert>
          )}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Reason"
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              required
              multiline
              minRows={3}
              autoFocus
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDeny}>Cancel</Button>
          <Button variant="contained" color="error" onClick={submitDeny} disabled={denySaving || !denyReason.trim()}>
            {denySaving ? "Saving..." : "Deny"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
