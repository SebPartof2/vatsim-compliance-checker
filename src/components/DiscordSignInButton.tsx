"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import { signIn } from "@/lib/auth-client";

/** SVG Discord mark (inline so we don't depend on a remote asset). */
function DiscordIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 127.14 96.36" fill="currentColor">
      <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z" />
    </svg>
  );
}

export default function DiscordSignInButton() {
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setLoading(true);
    await signIn.social({
      provider: "discord",
      callbackURL: "/dashboard",
    });
    // The call above triggers a redirect; keep the spinner up meanwhile.
  }

  return (
    <Button
      variant="contained"
      color="secondary"
      size="large"
      fullWidth
      disabled={loading}
      onClick={handleSignIn}
      startIcon={
        loading ? (
          <CircularProgress size={20} color="inherit" />
        ) : (
          <DiscordIcon />
        )
      }
    >
      {loading ? "Redirecting…" : "Sign in with Discord"}
    </Button>
  );
}
