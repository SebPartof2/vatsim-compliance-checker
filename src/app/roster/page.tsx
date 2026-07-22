import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import { auth } from "@/lib/auth";
import { resolveViewer } from "@/lib/dev-mode";
import { getVatusaUser } from "@/lib/vatsim";
import SignOutButton from "@/components/SignOutButton";
import NavLinkButton from "@/components/NavLinkButton";
import ThemeToggle from "@/components/ThemeToggle";
import RosterReportView from "@/components/RosterReportView";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default" }}>
      <AppBar position="static" color="primary" elevation={0}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
            Roster Report
          </Typography>
          <NavLinkButton href="/dashboard">Dashboard</NavLinkButton>
          <ThemeToggle />
          <SignOutButton />
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 5 } }}>
        {children}
      </Container>
    </Box>
  );
}

export default async function RosterPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/");
  }

  const { realCid, devEnabled } = await resolveViewer(session.user.id);

  if (!devEnabled) {
    return (
      <Shell>
        <Alert severity="warning">
          <AlertTitle>Not available</AlertTitle>
          Roster reports are limited to developers.
        </Alert>
      </Shell>
    );
  }

  // Default the facility field to the viewer's own home facility.
  let defaultFacility = "";
  if (realCid) {
    const me = await getVatusaUser(realCid);
    if (me.status === "ok") defaultFacility = me.user.facility;
  }

  return (
    <Shell>
      <RosterReportView defaultFacility={defaultFacility} />
    </Shell>
  );
}
