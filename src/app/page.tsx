import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import { auth } from "@/lib/auth";
import DiscordSignInButton from "@/components/DiscordSignInButton";
import ThemeToggle from "@/components/ThemeToggle";

export default async function LoginPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) {
    redirect("/dashboard");
  }

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        p: 2,
        position: "relative",
        // Theme-aware wash so this reads correctly in both schemes.
        background: (theme) =>
          `radial-gradient(1200px 600px at 50% -10%, ${theme.palette.primary.main}26 0%, ${theme.palette.background.default} 60%)`,
      }}
    >
      <Box sx={{ position: "absolute", top: 12, right: 12 }}>
        <ThemeToggle />
      </Box>
      <Card sx={{ width: "100%", maxWidth: 420, boxShadow: 6 }}>
        <CardContent sx={{ p: 4 }}>
          <Stack spacing={1} alignItems="center" textAlign="center">
            <Typography variant="h4" component="h1">
              Visiting Compliance
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Check whether you meet the VATUSA visiting controller
              requirements.
            </Typography>
          </Stack>

          <Divider sx={{ my: 3 }} />

          <DiscordSignInButton />

          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            textAlign="center"
            sx={{ mt: 3 }}
          >
            We use Discord to identify you, then match your account to VATSIM.
            Make sure your Discord is linked at community.vatsim.net.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
