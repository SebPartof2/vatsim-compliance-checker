import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Avatar from "@mui/material/Avatar";
import Link from "@mui/material/Link";
import Button from "@mui/material/Button";
import NextLink from "next/link";
import { auth } from "@/lib/auth";
import { getDiscordAccountId } from "@/lib/db";
import {
  getCidFromDiscordId,
  getVatusaUser,
  ratingInfo,
  resolveFacilityLabel,
  resolveHomeFacilityLabel,
} from "@/lib/vatsim";
import SignOutButton from "@/components/SignOutButton";
import DevCidBar from "@/components/DevCidBar";
import ControllingPanel from "@/components/ControllingPanel";

import { IS_DEV, DEV_CIDS } from "@/lib/dev-mode";

/** Format an ISO timestamp as e.g. "Oct 19, 2025". */
function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Stack spacing={0.5}>
      <Typography variant="overline" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h6" component="div">
        {value}
      </Typography>
    </Stack>
  );
}

function Shell({
  children,
  dev,
  overrideCid,
  overrideDiscordId,
  wide,
}: {
  children: React.ReactNode;
  dev?: boolean;
  overrideCid?: string;
  overrideDiscordId?: string;
  wide?: boolean;
}) {
  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default" }}>
      {dev && (
        <DevCidBar
          defaultCid={overrideCid}
          defaultDiscordId={overrideDiscordId}
        />
      )}
      <AppBar position="static" color="primary" elevation={0}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
            Visiting Compliance
          </Typography>
          {dev && (
            <Button color="inherit" component={NextLink} href="/roster">
              Roster
            </Button>
          )}
          <SignOutButton />
        </Toolbar>
      </AppBar>
      <Container
        maxWidth={wide ? "lg" : "sm"}
        sx={{ py: { xs: 3, sm: 5 } }}
      >
        {children}
      </Container>
    </Box>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ cid?: string; discord?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/");
  }

  const sp = await searchParams;

  // Resolve the viewer's REAL Discord id + CID (independent of any override) —
  // used for the normal path and to authorize dev mode in production.
  const realDiscordId = getDiscordAccountId(session.user.id);
  const realLink = realDiscordId
    ? await getCidFromDiscordId(realDiscordId)
    : null;
  const realCid = realLink?.status === "linked" ? realLink.cid : null;

  // Dev mode: always on in development; in production only for allow-listed CIDs.
  const devEnabled =
    IS_DEV || (realCid != null && DEV_CIDS.includes(realCid));

  // When dev mode is enabled, allow overriding the resolved identity via query
  // params. `?cid=` short-circuits the chain; `?discord=` swaps the Discord id
  // but still runs the VATSIM resolution.
  const overrideCid = devEnabled ? sp.cid?.trim() || undefined : undefined;
  const overrideDiscordId = devEnabled
    ? sp.discord?.trim() || undefined
    : undefined;

  const shellProps = {
    dev: devEnabled,
    overrideCid,
    overrideDiscordId,
  };

  let cid: string;

  if (overrideCid) {
    // Skip Discord/VATSIM resolution entirely.
    cid = overrideCid;
  } else if (overrideDiscordId) {
    // Resolve the overridden Discord id.
    const link = await getCidFromDiscordId(overrideDiscordId);
    if (link.status === "error") {
      return (
        <Shell {...shellProps}>
          <Alert severity="error">
            <AlertTitle>Something went wrong</AlertTitle>
            {link.message} Please try again in a moment.
          </Alert>
        </Shell>
      );
    }
    if (link.status === "not-linked") {
      return (
        <Shell {...shellProps}>
          <Alert severity="warning">
            <AlertTitle>Discord not linked to VATSIM</AlertTitle>
            That Discord account is not linked to VATSIM.
          </Alert>
        </Shell>
      );
    }
    cid = link.cid;
  } else {
    // Normal path — the signed-in viewer, using the already-resolved realLink.
    if (!realDiscordId) {
      return (
        <Shell {...shellProps}>
          <Alert severity="error">
            We couldn&apos;t read your Discord account id. Please sign out and
            try again.
          </Alert>
        </Shell>
      );
    }
    if (!realLink || realLink.status === "error") {
      return (
        <Shell {...shellProps}>
          <Alert severity="error">
            <AlertTitle>Something went wrong</AlertTitle>
            {realLink?.status === "error"
              ? realLink.message
              : "Could not reach VATSIM."}{" "}
            Please try again in a moment.
          </Alert>
        </Shell>
      );
    }
    if (realLink.status === "not-linked") {
      return (
        <Shell {...shellProps}>
          <Alert severity="warning">
            <AlertTitle>Discord not linked to VATSIM</AlertTitle>
            Your Discord account is not linked to VATSIM. Please sign into{" "}
            <Link
              href="https://community.vatsim.net"
              target="_blank"
              rel="noopener"
            >
              community.vatsim.net
            </Link>{" "}
            and link your Discord, then return here.
          </Alert>
        </Shell>
      );
    }
    cid = realLink.cid;
  }

  // 2. Resolve CID -> VATUSA profile.
  const result = await getVatusaUser(cid);

  if (result.status === "not-found") {
    return (
      <Shell {...shellProps}>
        <Alert severity="warning">
          <AlertTitle>No VATUSA record</AlertTitle>
          We found the VATSIM CID ({cid}) but couldn&apos;t find a VATUSA
          profile for it. This tool is for VATUSA controllers. If you would like to use thit tool, sign into the VATUSA website.
        </Alert>
      </Shell>
    );
  }

  if (result.status === "error") {
    return (
      <Shell {...shellProps}>
        <Alert severity="error">
          <AlertTitle>Something went wrong</AlertTitle>
          {result.message} Please try again in a moment.
        </Alert>
      </Shell>
    );
  }

  const user = result.user;
  const visitingFacilities = user.visiting_facilities ?? [];

  // 3. Resolve the home facility and each visiting facility to full names, all
  // in parallel. Best-effort: a failed lookup falls back to the raw code.
  const [facilityLabel, visitingLabels] = await Promise.all([
    resolveHomeFacilityLabel(user.facility, user.cid),
    Promise.all(
      visitingFacilities.map(async (v) => ({
        id: v.id,
        label: await resolveFacilityLabel(v.facility),
        since: v.created_at,
      })),
    ),
  ]);

  const rating = ratingInfo(user.rating);
  const fullName = `${user.fname} ${user.lname}`.trim();
  const initials =
    `${user.fname?.[0] ?? ""}${user.lname?.[0] ?? ""}`.toUpperCase();

  return (
    <Shell wide {...shellProps}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "5fr 7fr" },
          gap: 3,
          alignItems: "start",
        }}
      >
        <Card sx={{ boxShadow: 4 }}>
          <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Avatar sx={{ bgcolor: "primary.main", width: 56, height: 56 }}>
              {initials || "?"}
            </Avatar>
            <Box>
              <Typography variant="h5" component="h1">
                {fullName}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                CID {user.cid}
              </Typography>
            </Box>
          </Stack>

          <Divider sx={{ my: 3 }} />

          <Stack spacing={3}>
            <Field
              label="Rating"
              value={
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip
                    label={user.rating_short ?? rating.short}
                    color="primary"
                    size="small"
                  />
                  <span>{rating.long}</span>
                </Stack>
              }
            />
            <Stack spacing={0.5}>
              <Typography variant="overline" color="text.secondary">
                Home Subdivision
              </Typography>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="baseline"
                spacing={1}
              >
                <Typography variant="h6" component="div">
                  {facilityLabel}
                </Typography>
                {user.facility_join && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ whiteSpace: "nowrap" }}
                  >
                    since {formatDate(user.facility_join)}
                  </Typography>
                )}
              </Stack>
            </Stack>

            <Box>
              <Typography variant="overline" color="text.secondary">
                Visiting Subdivisions
              </Typography>
              {visitingLabels.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No visiting subdivisions.
                </Typography>
              ) : (
                <Stack
                  spacing={1}
                  sx={{
                    mt: 0.5,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 2,
                    p: 1.5,
                  }}
                >
                  {visitingLabels.map((v, i) => (
                    <Box key={v.id}>
                      {i > 0 && <Divider sx={{ mb: 1 }} />}
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        spacing={1}
                      >
                        <Typography variant="body1" sx={{ fontWeight: 500 }}>
                          {v.label}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ whiteSpace: "nowrap" }}
                        >
                          since {formatDate(v.since)}
                        </Typography>
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              )}
            </Box>
            </Stack>
          </CardContent>
        </Card>

        <ControllingPanel
          key={String(user.cid)}
          cid={String(user.cid)}
          home={{ code: user.facility, name: facilityLabel }}
          visiting={visitingFacilities.map((v, i) => ({
            code: v.facility,
            name: visitingLabels[i]?.label ?? v.facility,
          }))}
        />
      </Box>
    </Shell>
  );
}
