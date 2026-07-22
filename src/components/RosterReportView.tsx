"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import LinearProgress from "@mui/material/LinearProgress";
import CircularProgress from "@mui/material/CircularProgress";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";

interface MemberCurrency {
  cid: number;
  name: string;
  ratingShort: string;
  membership: "home" | "visit";
  status: "pending" | "done" | "error";
  ms?: number;
  requiredMs?: number | null;
  met?: boolean | null;
  error?: string;
}

interface ReportJob {
  facility: string;
  quarterKey: string;
  windowLabel: string;
  status: "running" | "done" | "error";
  total: number;
  completed: number;
  members: MemberCurrency[];
  error?: string;
}

interface QueueStats {
  high: number;
  low: number;
  usedInWindow: number;
  maxPerWindow: number;
}

function formatHM(ms: number): string {
  const total = Math.round(ms / 60000);
  return `${Math.floor(total / 60)}h ${total % 60}m`;
}

/** Quarter options: current quarter and the previous seven. */
function quarterOptions(): { key: string; label: string }[] {
  const now = new Date();
  const out: { key: string; label: string }[] = [];
  let y = now.getFullYear();
  let q = Math.floor(now.getMonth() / 3);
  for (let i = 0; i < 8; i++) {
    out.push({ key: `${y}-q${q + 1}`, label: `Q${q + 1} ${y}` });
    q -= 1;
    if (q < 0) {
      q = 3;
      y -= 1;
    }
  }
  return out;
}

export default function RosterReportView({
  defaultFacility,
}: {
  defaultFacility: string;
}) {
  const quarters = quarterOptions();
  const [facilityInput, setFacilityInput] = useState(defaultFacility);
  const [quarter, setQuarter] = useState(quarters[0].key);
  const [job, setJob] = useState<ReportJob | null>(null);
  const [queue, setQueue] = useState<QueueStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Facility/quarter the currently displayed job belongs to.
  const active = useRef<{ facility: string; quarter: string } | null>(null);

  const poll = useCallback(async () => {
    const a = active.current;
    if (!a) return;
    try {
      const res = await fetch(
        `/api/roster/report?facility=${encodeURIComponent(a.facility)}&quarter=${encodeURIComponent(a.quarter)}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Error ${res.status}`);
      setJob(data.job);
      setQueue(data.queue);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // Poll while a job is running.
  useEffect(() => {
    if (!job || job.status !== "running") return;
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [job, poll]);

  async function start() {
    const facility = facilityInput.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,4}$/.test(facility)) {
      setError("Enter a valid facility code, e.g. HCF or ZNY.");
      return;
    }
    setBusy(true);
    setError(null);
    setJob(null);
    active.current = { facility, quarter };
    try {
      const res = await fetch("/api/roster/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facility, quarter }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Error ${res.status}`);
      setJob(data.job);
      setQueue(data.queue);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const pct =
    job && job.total > 0 ? (job.completed / job.total) * 100 : 0;
  const remaining = job ? job.total - job.completed : 0;
  // Background work gets a slice of the rate limit, so estimate conservatively.
  const etaMin = remaining > 0 ? Math.ceil(remaining / 5) : 0;

  return (
    <Stack spacing={3}>
      <Card sx={{ boxShadow: 4 }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="h6" sx={{ mb: 0.5 }}>
            Roster Currency Report
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mb: 2 }}
          >
            Checks every home and visiting controller on a facility&apos;s
            roster. This runs in the background at low priority so it never
            blocks normal page loads — leave the page and come back; results are
            kept for an hour.
          </Typography>

          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            alignItems={{ xs: "stretch", sm: "center" }}
          >
            <TextField
              size="small"
              label="Facility"
              placeholder="HCF"
              value={facilityInput}
              onChange={(e) =>
                setFacilityInput(e.target.value.toUpperCase().slice(0, 4))
              }
              sx={{ maxWidth: 140 }}
            />
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel id="roster-quarter">Quarter</InputLabel>
              <Select
                labelId="roster-quarter"
                label="Quarter"
                value={quarter}
                onChange={(e) => setQuarter(e.target.value)}
              >
                {quarters.map((q) => (
                  <MenuItem key={q.key} value={q.key}>
                    {q.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button variant="contained" onClick={start} disabled={busy}>
              {busy ? "Starting…" : "Run report"}
            </Button>
          </Stack>

          {error ? (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          ) : null}

          {job ? (
            <Box sx={{ mt: 2 }}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ mb: 0.5 }}
              >
                <Typography variant="body2">
                  {job.facility} · {job.windowLabel || job.quarterKey} ·{" "}
                  {job.completed}/{job.total || "?"} checked
                  {job.status === "running" && etaMin > 0
                    ? ` · ~${etaMin} min left`
                    : ""}
                </Typography>
                {job.status === "running" ? (
                  <CircularProgress size={18} />
                ) : job.status === "done" ? (
                  <Chip label="Complete" color="success" size="small" />
                ) : (
                  <Chip label="Failed" color="error" size="small" />
                )}
              </Stack>
              <LinearProgress
                variant={job.total > 0 ? "determinate" : "indeterminate"}
                value={pct}
                sx={{ height: 6, borderRadius: 3 }}
              />
              {job.error ? (
                <Alert severity="error" sx={{ mt: 1 }}>
                  {job.error}
                </Alert>
              ) : null}
              {queue ? (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mt: 0.5 }}
                >
                  VATSIM queue: {queue.usedInWindow}/{queue.maxPerWindow} used
                  this minute · {queue.high} interactive, {queue.low} background
                  waiting
                </Typography>
              ) : null}
            </Box>
          ) : null}
        </CardContent>
      </Card>

      {job && job.members.length > 0 ? (
        <Card sx={{ boxShadow: 4 }}>
          <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Controller</TableCell>
                    <TableCell>CID</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell align="right">Rating</TableCell>
                    <TableCell align="right">Time</TableCell>
                    <TableCell align="right">Required</TableCell>
                    <TableCell align="right">Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {job.members.map((m) => (
                    <TableRow key={m.cid} hover>
                      <TableCell sx={{ fontWeight: 500 }}>{m.name}</TableCell>
                      <TableCell>{m.cid}</TableCell>
                      <TableCell>
                        <Chip
                          label={m.membership === "home" ? "Home" : "Visitor"}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="right">{m.ratingShort}</TableCell>
                      <TableCell align="right">
                        {m.status === "done" && m.ms != null
                          ? formatHM(m.ms)
                          : "—"}
                      </TableCell>
                      <TableCell align="right">
                        {m.status !== "done"
                          ? "—"
                          : m.requiredMs == null
                            ? "Unknown"
                            : formatHM(m.requiredMs)}
                      </TableCell>
                      <TableCell align="right">
                        {m.status === "pending" ? (
                          <Typography variant="caption" color="text.secondary">
                            Pending…
                          </Typography>
                        ) : m.status === "error" ? (
                          <Chip label="Error" size="small" color="warning" />
                        ) : m.met == null ? (
                          <Chip label="Unknown" size="small" />
                        ) : m.met ? (
                          <CheckCircleIcon color="success" fontSize="small" />
                        ) : (
                          <CancelIcon color="error" fontSize="small" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      ) : null}
    </Stack>
  );
}
