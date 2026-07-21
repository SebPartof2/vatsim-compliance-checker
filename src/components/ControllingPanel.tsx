"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import ListSubheader from "@mui/material/ListSubheader";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TablePagination from "@mui/material/TablePagination";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";
import LinearProgress from "@mui/material/LinearProgress";
import Skeleton from "@mui/material/Skeleton";
import RefreshIcon from "@mui/icons-material/Refresh";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import { ratingInfo, type AtcSession } from "@/lib/vatsim";
import {
  getCurrencyRequirement,
  requiredHours,
  currentPeriodWindow,
  type PeriodWindow,
} from "@/lib/currency";

type SessionDTO = AtcSession;

interface Facility {
  code: string;
  name: string;
}

type CurrencyRow =
  | {
      code: string;
      name: string;
      isHome: boolean;
      unknown: true;
      win: PeriodWindow;
      ms: number;
    }
  | {
      code: string;
      name: string;
      isHome: boolean;
      unknown: false;
      win: PeriodWindow;
      ms: number;
      requiredMs: number;
      met: boolean;
    };

const ONE_HOUR_MS = 3_600_000;

/** Categorical palette (validated, slot order). Home = slot 1. */
const CATEGORICAL = [
  "#2a78d6", // blue (home)
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
];
const OTHER_COLOR = "#898781"; // muted grey

interface Period {
  key: string;
  group: string;
  label: string;
  start: number | null; // epoch ms, inclusive
  end: number | null; // epoch ms, exclusive
}

interface FacilityStat {
  id: string;
  name: string;
  matched: boolean;
  ms: number;
  count: number;
}

function durationMs(s: SessionDTO): number {
  if (!s.end) return 0;
  const d = new Date(s.end).getTime() - new Date(s.start).getTime();
  return Number.isNaN(d) || d < 0 ? 0 : d;
}

function formatHM(ms: number): string {
  const totalMinutes = Math.round(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

function formatStart(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function prefixOf(callsign: string): string {
  return (callsign ?? "").split("_")[0].toUpperCase();
}

/** Build the available time periods from the session data + the current date. */
function buildPeriods(sessions: SessionDTO[]): Period[] {
  const now = new Date();
  const nowMs = now.getTime();
  const currentYear = now.getFullYear();
  const periods: Period[] = [];

  periods.push({
    key: "all",
    group: "General",
    label: "All time",
    start: null,
    end: null,
  });
  periods.push({
    key: "ytd",
    group: "General",
    label: `Year to date (${currentYear})`,
    start: new Date(currentYear, 0, 1).getTime(),
    end: null,
  });

  // Quarters of the current year that have already started.
  for (let q = 0; q < 4; q++) {
    const start = new Date(currentYear, q * 3, 1);
    if (start.getTime() > nowMs) continue;
    periods.push({
      key: `q${q + 1}-${currentYear}`,
      group: "This year",
      label: `Q${q + 1} ${currentYear}`,
      start: start.getTime(),
      end: new Date(currentYear, q * 3 + 3, 1).getTime(),
    });
  }

  // One period per year that has at least one session.
  const years = new Set<number>();
  for (const s of sessions) {
    const t = new Date(s.start);
    if (!Number.isNaN(t.getTime())) years.add(t.getFullYear());
  }
  for (const year of [...years].sort((a, b) => b - a)) {
    periods.push({
      key: `year-${year}`,
      group: "By year",
      label: `${year}`,
      start: new Date(year, 0, 1).getTime(),
      end: new Date(year + 1, 0, 1).getTime(),
    });
  }

  return periods;
}

function inPeriod(s: SessionDTO, p: Period): boolean {
  const t = new Date(s.start).getTime();
  if (Number.isNaN(t)) return false;
  if (p.start != null && t < p.start) return false;
  if (p.end != null && t >= p.end) return false;
  return true;
}

/** Quarters present in the data (started ones only), most recent first. */
function buildQuarters(sessions: SessionDTO[]): Period[] {
  const now = new Date();
  const nowMs = now.getTime();
  const years = new Set<number>();
  for (const s of sessions) {
    const t = new Date(s.start);
    if (!Number.isNaN(t.getTime())) years.add(t.getFullYear());
  }
  // Always include the current year so the current quarter is selectable.
  years.add(now.getFullYear());

  const quarters: Period[] = [];
  for (const year of [...years].sort((a, b) => b - a)) {
    for (let q = 3; q >= 0; q--) {
      const start = new Date(year, q * 3, 1);
      if (start.getTime() > nowMs) continue; // skip future quarters
      quarters.push({
        key: `${year}-q${q + 1}`,
        group: "Quarter",
        label: `Q${q + 1} ${year}`,
        start: start.getTime(),
        end: new Date(year, q * 3 + 3, 1).getTime(),
      });
    }
  }
  return quarters;
}

function currentQuarterKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-q${Math.floor(now.getMonth() / 3) + 1}`;
}

interface Slice {
  label: string;
  value: number;
  color: string;
}

/** Dependency-free SVG donut. */
function Donut({
  slices,
  size = 168,
  thickness = 26,
  center,
}: {
  slices: Slice[];
  size?: number;
  thickness?: number;
  center?: React.ReactNode;
}) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <Box sx={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {total > 0 ? (
            slices.map((s, i) => {
              const len = (s.value / total) * circ;
              const gap = slices.length > 1 ? 2 : 0;
              const dash = Math.max(len - gap, 0.001);
              const el = (
                <circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={thickness}
                  strokeDasharray={`${dash} ${circ - dash}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += len;
              return el;
            })
          ) : (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="#e1e0d9"
              strokeWidth={thickness}
            />
          )}
        </g>
      </svg>
      {center != null && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            textAlign: "center",
          }}
        >
          {center}
        </Box>
      )}
    </Box>
  );
}

export default function ControllingPanel({
  cid,
  home,
  visiting,
}: {
  cid: string;
  home: Facility;
  visiting: Facility[];
}) {
  const [sessions, setSessions] = useState<SessionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodKey, setPeriodKey] = useState("ytd");
  const [quarterKey, setQuarterKey] = useState(currentQuarterKey());
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions?cid=${encodeURIComponent(cid)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Error ${res.status}`);
      setSessions(data.items);
    } catch (e) {
      setError((e as Error).message);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [cid]);

  useEffect(() => {
    load();
  }, [load]);

  const periods = useMemo(() => buildPeriods(sessions), [sessions]);
  const period = useMemo(
    () => periods.find((p) => p.key === periodKey) ?? periods[0],
    [periods, periodKey],
  );

  const filtered = useMemo(
    () => (period ? sessions.filter((s) => inPeriod(s, period)) : sessions),
    [sessions, period],
  );

  const { totalMs, facilities } = useMemo(() => {
    let totalMs = 0;
    const map = new Map<string, FacilityStat>();
    for (const s of filtered) {
      const ms = durationMs(s);
      totalMs += ms;
      const id = s.artcc?.id ?? prefixOf(s.callsign);
      const existing = map.get(id);
      if (existing) {
        existing.ms += ms;
        existing.count += 1;
      } else {
        map.set(id, {
          id,
          name: s.artcc?.name ?? "Unmatched facility",
          matched: Boolean(s.artcc),
          ms,
          count: 1,
        });
      }
    }
    const facilities = [...map.values()].sort((a, b) => b.ms - a.ms);
    return { totalMs, facilities };
  }, [filtered]);

  // ---- Visiting compliance (per quarter) ----
  const quarters = useMemo(() => buildQuarters(sessions), [sessions]);
  const quarter = useMemo(
    () => quarters.find((q) => q.key === quarterKey) ?? quarters[0],
    [quarters, quarterKey],
  );

  const compliance = useMemo(() => {
    const inQ = quarter
      ? sessions.filter((s) => inPeriod(s, quarter))
      : [];

    let totalMs = 0;
    let homeMs = 0;
    const visitingMs = new Map<string, number>();
    for (const s of inQ) {
      const ms = durationMs(s);
      totalMs += ms;
      const id = s.artcc?.id;
      if (id && id === home.code) {
        homeMs += ms;
      } else if (id && visiting.some((v) => v.code === id)) {
        visitingMs.set(id, (visitingMs.get(id) ?? 0) + ms);
      }
    }
    const accountedVisitingMs = [...visitingMs.values()].reduce(
      (a, b) => a + b,
      0,
    );
    const nonHomeMs = totalMs - homeMs;
    const otherMs = nonHomeMs - accountedVisitingMs;

    const requiredMs = totalMs / 2 + ONE_HOUR_MS;
    const compliant = totalMs > 0 && homeMs >= requiredMs;
    // margin = home - nonHome - 2h. >=0 headroom for visiting; <0 home deficit.
    const marginMs = homeMs - nonHomeMs - 2 * ONE_HOUR_MS;

    // Pie slices: home, each visiting facility with time, then "Other".
    const slices: Slice[] = [];
    if (homeMs > 0) {
      slices.push({ label: home.name, value: homeMs, color: CATEGORICAL[0] });
    }
    let ci = 1;
    for (const v of visiting) {
      const ms = visitingMs.get(v.code) ?? 0;
      if (ms > 0) {
        slices.push({
          label: v.name,
          value: ms,
          color: CATEGORICAL[ci % CATEGORICAL.length] ?? OTHER_COLOR,
        });
        ci += 1;
      }
    }
    if (otherMs > 0) {
      slices.push({ label: "Other", value: otherMs, color: OTHER_COLOR });
    }

    const homePct = totalMs > 0 ? (homeMs / totalMs) * 100 : 0;
    return {
      totalMs,
      homeMs,
      nonHomeMs,
      requiredMs,
      compliant,
      marginMs,
      homePct,
      slices,
    };
  }, [sessions, quarter, home, visiting]);

  // ---- Currency compliance (per rostered facility, shared quarter) ----
  const currency = useMemo<CurrencyRow[]>(() => {
    // Reference date drives which quarter/half each facility is measured over.
    const selected = quarters.find((q) => q.key === quarterKey);
    const ref =
      selected && selected.start != null
        ? new Date(selected.start)
        : new Date();

    const rostered = [
      { code: home.code, name: home.name, isHome: true },
      ...visiting.map((v) => ({ code: v.code, name: v.name, isHome: false })),
    ];

    const seen = new Set<string>();
    const rows: CurrencyRow[] = [];
    for (const f of rostered) {
      const code = f.code.toUpperCase();
      if (code === "ZZN" || seen.has(code)) continue; // ZZN = international, no roster
      seen.add(code);

      const req = getCurrencyRequirement(code);
      // Unknown requirement -> assume a quarter window just to show hours.
      const win = currentPeriodWindow(req?.period ?? "quarter", ref);

      let ms = 0;
      for (const s of sessions) {
        if (s.artcc?.id !== code) continue;
        const t = new Date(s.start).getTime();
        if (t >= win.start && t < win.end) ms += durationMs(s);
      }

      const hours = req ? requiredHours(req, f.isHome) : null;
      if (hours == null) {
        rows.push({ code, name: f.name, isHome: f.isHome, unknown: true, win, ms });
        continue;
      }

      const requiredMs = hours * ONE_HOUR_MS;
      rows.push({
        code,
        name: f.name,
        isHome: f.isHome,
        unknown: false,
        win,
        ms,
        requiredMs,
        met: ms >= requiredMs,
      });
    }
    return rows;
  }, [sessions, home, visiting, quarters, quarterKey]);

  // Reset paging whenever the filter or page size changes.
  useEffect(() => {
    setPage(0);
  }, [periodKey, rowsPerPage]);

  const pageRows = filtered.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage,
  );

  // Render the period picker with grouped options.
  const groups = ["General", "This year", "By year"];
  const periodItems: React.ReactNode[] = [];
  for (const g of groups) {
    const inGroup = periods.filter((p) => p.group === g);
    if (inGroup.length === 0) continue;
    periodItems.push(<ListSubheader key={`h-${g}`}>{g}</ListSubheader>);
    for (const p of inGroup) {
      periodItems.push(
        <MenuItem key={p.key} value={p.key}>
          {p.label}
        </MenuItem>,
      );
    }
  }

  const quarterItems = quarters.map((q) => (
    <MenuItem key={q.key} value={q.key}>
      {q.label}
    </MenuItem>
  ));

  // Until the first fetch resolves we have no sessions to reason about. Show a
  // dedicated loading state rather than zeros/empties, which — combined with the
  // real home facility — could read as a misleading (wrong) result.
  const initialLoading = loading && sessions.length === 0;
  const loadError = !!error && sessions.length === 0;

  return (
    <Stack spacing={3}>
      {/* Visiting compliance */}
      <Card sx={{ boxShadow: 4 }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={1}
            sx={{ mb: 2 }}
          >
            <Typography variant="h6">Visiting Compliance</Typography>
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel id="quarter-label">Quarter</InputLabel>
              <Select
                labelId="quarter-label"
                label="Quarter"
                value={quarter?.key ?? ""}
                onChange={(e) => setQuarterKey(e.target.value)}
              >
                {quarterItems}
              </Select>
            </FormControl>
          </Stack>

          {initialLoading ? (
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={3}
              alignItems="center"
            >
              <Skeleton variant="circular" width={168} height={168} />
              <Box sx={{ flexGrow: 1, width: "100%" }}>
                <Skeleton variant="rounded" width={130} height={32} />
                <Skeleton width="90%" sx={{ mt: 1.5 }} />
                <Skeleton width="60%" />
                <Skeleton width="100%" height={24} sx={{ mt: 1.5 }} />
                <Skeleton width="100%" height={24} />
              </Box>
            </Stack>
          ) : loadError ? (
            <Alert severity="error">{error}</Alert>
          ) : compliance.totalMs === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
              No controlling time in this quarter.
            </Typography>
          ) : (
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={3}
              alignItems="center"
            >
              <Donut
                slices={compliance.slices}
                center={
                  <Box>
                    <Typography
                      variant="h5"
                      sx={{ fontWeight: 700, lineHeight: 1 }}
                    >
                      {compliance.homePct.toFixed(0)}%
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      home
                    </Typography>
                  </Box>
                }
              />

              <Box sx={{ flexGrow: 1, minWidth: 0, width: "100%" }}>
                <Chip
                  icon={
                    compliance.compliant ? (
                      <CheckCircleIcon />
                    ) : (
                      <CancelIcon />
                    )
                  }
                  label={
                    compliance.compliant ? "Compliant" : "Not compliant"
                  }
                  color={compliance.compliant ? "success" : "error"}
                  sx={{ fontWeight: 700, mb: 1 }}
                />
                <Typography variant="body2" sx={{ mb: 1.5 }}>
                  {compliance.compliant ? (
                    <>
                      You can spend up to{" "}
                      <strong>{formatHM(compliance.marginMs)}</strong> more time
                      at visiting facilities this quarter before dropping below
                      the requirement.
                    </>
                  ) : (
                    <>
                      You need <strong>{formatHM(-compliance.marginMs)}</strong>{" "}
                      more time at your home facility this quarter to become
                      compliant.
                    </>
                  )}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mb: 1 }}
                >
                  Home must be ≥ 50% + 1h of total time ({formatHM(compliance.homeMs)} of{" "}
                  {formatHM(compliance.totalMs)}).
                </Typography>

                {/* Legend */}
                <Stack spacing={0.5}>
                  {compliance.slices.map((s) => (
                    <Stack
                      key={s.label}
                      direction="row"
                      alignItems="center"
                      spacing={1}
                    >
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: "3px",
                          bgcolor: s.color,
                          flexShrink: 0,
                        }}
                      />
                      <Typography variant="body2" noWrap sx={{ flexGrow: 1 }}>
                        {s.label}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, whiteSpace: "nowrap" }}
                      >
                        {formatHM(s.value)}{" "}
                        <Typography
                          component="span"
                          variant="caption"
                          color="text.secondary"
                        >
                          {((s.value / compliance.totalMs) * 100).toFixed(0)}%
                        </Typography>
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </Box>
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* Currency compliance */}
      <Card sx={{ boxShadow: 4 }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="h6">Currency Compliance</Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mb: 1.5, mt: 0.5 }}
          >
            Minimum controlling time required to remain on each roster, for the
            quarter selected above. Half-year rosters use the half containing it.
          </Typography>

          {initialLoading ? (
            <Stack spacing={1.5}>
              {[0, 1].map((i) => (
                <Box key={i}>
                  <Skeleton width="60%" />
                  <Skeleton
                    variant="rounded"
                    height={6}
                    sx={{ borderRadius: 3, mt: 0.5 }}
                  />
                </Box>
              ))}
            </Stack>
          ) : loadError ? (
            <Alert severity="error">{error}</Alert>
          ) : currency.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
              No rostered facilities.
            </Typography>
          ) : (
            <Stack spacing={1.75}>
              {currency.map((row) => {
                const met = row.unknown === false ? row.met : false;
                // Chip color: green = current, red = not met, grey = unknown.
                const chipColor = row.unknown
                  ? "default"
                  : met
                    ? "success"
                    : "error";

                const header = (
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{ minWidth: 0 }}
                  >
                    <Chip label={row.code} size="small" color={chipColor} />
                    <Typography variant="body2" noWrap>
                      {row.name}
                    </Typography>
                    {row.isHome && (
                      <Chip label="Home" size="small" variant="outlined" />
                    )}
                  </Stack>
                );

                if (row.unknown) {
                  return (
                    <Box key={row.code}>
                      <Stack
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                        spacing={1}
                        sx={{ mb: 0.5 }}
                      >
                        {header}
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ fontWeight: 600, whiteSpace: "nowrap" }}
                        >
                          {formatHM(row.ms)}
                        </Typography>
                      </Stack>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: "block", fontStyle: "italic" }}
                      >
                        {row.win.label} · Unknown currency requirement
                      </Typography>
                    </Box>
                  );
                }

                const pct =
                  row.requiredMs > 0
                    ? Math.min(100, (row.ms / row.requiredMs) * 100)
                    : 100;
                const remainingMs = Math.max(0, row.requiredMs - row.ms);
                return (
                  <Box key={row.code}>
                    <Stack
                      direction="row"
                      alignItems="center"
                      justifyContent="space-between"
                      spacing={1}
                      sx={{ mb: 0.5 }}
                    >
                      {header}
                      <Stack
                        direction="row"
                        spacing={0.75}
                        alignItems="center"
                        sx={{ whiteSpace: "nowrap" }}
                      >
                        {row.met ? (
                          <CheckCircleIcon color="success" fontSize="small" />
                        ) : (
                          <CancelIcon color="error" fontSize="small" />
                        )}
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {formatHM(row.ms)} / {formatHM(row.requiredMs)}
                        </Typography>
                      </Stack>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={pct}
                      color={row.met ? "success" : "error"}
                      sx={{ height: 6, borderRadius: 3 }}
                    />
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", mt: 0.25 }}
                    >
                      {row.win.label} ·{" "}
                      {row.met
                        ? "Current"
                        : `Need ${formatHM(remainingMs)} more`}
                    </Typography>
                  </Box>
                );
              })}
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <Card sx={{ boxShadow: 4 }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={1}
            sx={{ mb: 1 }}
          >
            <Typography variant="h6">Statistics</Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel id="period-label">Time period</InputLabel>
                <Select
                  labelId="period-label"
                  label="Time period"
                  value={period?.key ?? "all"}
                  onChange={(e) => setPeriodKey(e.target.value)}
                >
                  {periodItems}
                </Select>
              </FormControl>
              <Tooltip title="Refresh">
                <span>
                  <IconButton onClick={load} disabled={loading} size="small">
                    <RefreshIcon />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          </Stack>

          <Box sx={{ height: 4, mb: 1 }}>
            {loading && !initialLoading && <LinearProgress />}
          </Box>

          {error && !initialLoading ? (
            <Alert severity="error" sx={{ mb: 1 }}>
              {error}
            </Alert>
          ) : null}

          {/* Combined total */}
          <Stack
            direction="row"
            spacing={3}
            alignItems="baseline"
            sx={{ mb: 2 }}
          >
            <Box>
              <Typography variant="overline" color="text.secondary">
                Total time
              </Typography>
              {initialLoading ? (
                <Skeleton width={120} height={41} />
              ) : (
                <Typography variant="h4" sx={{ fontWeight: 700 }}>
                  {formatHM(totalMs)}
                </Typography>
              )}
            </Box>
            <Box>
              <Typography variant="overline" color="text.secondary">
                Sessions
              </Typography>
              {initialLoading ? (
                <Skeleton width={36} height={32} />
              ) : (
                <Typography variant="h5">{filtered.length}</Typography>
              )}
            </Box>
            <Box>
              <Typography variant="overline" color="text.secondary">
                Facilities
              </Typography>
              {initialLoading ? (
                <Skeleton width={36} height={32} />
              ) : (
                <Typography variant="h5">{facilities.length}</Typography>
              )}
            </Box>
          </Stack>

          <Divider sx={{ mb: 1.5 }} />

          <Typography variant="overline" color="text.secondary">
            By facility
          </Typography>
          {initialLoading ? (
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              {[0, 1, 2].map((i) => (
                <Box key={i}>
                  <Skeleton width="70%" />
                  <Skeleton
                    variant="rounded"
                    height={6}
                    sx={{ borderRadius: 3, mt: 0.5 }}
                  />
                </Box>
              ))}
            </Stack>
          ) : loadError ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
              Couldn&apos;t load sessions.
            </Typography>
          ) : facilities.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
              No sessions in this period.
            </Typography>
          ) : (
            <Stack spacing={1.25} sx={{ mt: 1 }}>
              {facilities.map((f) => {
                const pct = totalMs > 0 ? (f.ms / totalMs) * 100 : 0;
                return (
                  <Box key={f.id}>
                    <Stack
                      direction="row"
                      alignItems="center"
                      justifyContent="space-between"
                      spacing={1}
                      sx={{ mb: 0.25 }}
                    >
                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        sx={{ minWidth: 0 }}
                      >
                        <Chip
                          label={f.id}
                          size="small"
                          color={f.matched ? "primary" : "default"}
                        />
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          noWrap
                        >
                          {f.name}
                        </Typography>
                      </Stack>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, whiteSpace: "nowrap" }}
                      >
                        {formatHM(f.ms)}{" "}
                        <Typography
                          component="span"
                          variant="caption"
                          color="text.secondary"
                        >
                          · {pct.toFixed(1)}% ({f.count})
                        </Typography>
                      </Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={pct}
                      sx={{ height: 6, borderRadius: 3 }}
                    />
                  </Box>
                );
              })}
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* Sessions list (filtered by the same period) */}
      <Card sx={{ boxShadow: 4 }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Controlling Sessions
          </Typography>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Callsign</TableCell>
                  <TableCell>ARTCC</TableCell>
                  <TableCell>Start</TableCell>
                  <TableCell align="right">Duration</TableCell>
                  <TableCell align="right">Rating</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {initialLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={5}>
                        <Skeleton height={28} />
                      </TableCell>
                    </TableRow>
                  ))
                ) : pageRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                      <Typography variant="body2" color="text.secondary">
                        {loadError
                          ? "Couldn't load sessions."
                          : "No sessions in this period."}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  pageRows.map((s) => (
                    <TableRow key={s.id} hover>
                      <TableCell sx={{ fontWeight: 500 }}>
                        {s.callsign}
                      </TableCell>
                      <TableCell>
                        {s.artcc ? (
                          <Tooltip title={s.artcc.name}>
                            <Chip
                              label={s.artcc.id}
                              size="small"
                              color="primary"
                            />
                          </Tooltip>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            —
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{formatStart(s.start)}</TableCell>
                      <TableCell align="right">
                        {formatHM(durationMs(s))}
                      </TableCell>
                      <TableCell align="right">
                        <Chip
                          label={ratingInfo(s.rating).short}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            component="div"
            count={filtered.length}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[25, 50, 100]}
          />
        </CardContent>
      </Card>
    </Stack>
  );
}
