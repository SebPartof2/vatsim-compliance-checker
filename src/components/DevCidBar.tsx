"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { alpha } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";

/**
 * Development-only control that overrides the identity the dashboard resolves.
 *
 * - "Override CID" skips the Discord -> VATSIM lookup entirely.
 * - "Override Discord ID" replaces the signed-in user's Discord id and still
 *   runs the VATSIM resolution (useful for testing the not-linked path).
 *
 * A CID override takes precedence over a Discord id override. Rendered only
 * when the server detects `NODE_ENV === "development"`.
 */
export default function DevCidBar({
  defaultCid,
  defaultDiscordId,
}: {
  defaultCid?: string;
  defaultDiscordId?: string;
}) {
  const router = useRouter();
  const [cid, setCid] = useState(defaultCid ?? "");
  const [discordId, setDiscordId] = useState(defaultDiscordId ?? "");

  function apply() {
    const params = new URLSearchParams();
    if (cid.trim()) params.set("cid", cid.trim());
    if (discordId.trim()) params.set("discord", discordId.trim());
    const qs = params.toString();
    router.push(qs ? `/dashboard?${qs}` : "/dashboard");
    router.refresh();
  }

  function reset() {
    setCid("");
    setDiscordId("");
    router.push("/dashboard");
    router.refresh();
  }

  const onlyDigits = (v: string) => v.replace(/[^0-9]/g, "");

  return (
    <Box
      sx={{
        // Tinted rather than solid so it reads in both color schemes.
        bgcolor: (theme) => alpha(theme.palette.warning.main, 0.18),
      }}
    >
      <Paper
        elevation={0}
        square
        sx={{
          bgcolor: "transparent",
          px: 2,
          py: 1,
          borderBottom: "1px solid",
          borderColor: "warning.main",
        }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          alignItems={{ xs: "stretch", sm: "center" }}
          sx={{ maxWidth: 900, mx: "auto" }}
        >
          <Chip
            label="DEV"
            color="warning"
            size="small"
            sx={{ fontWeight: 700, alignSelf: "center" }}
          />
          <TextField
            size="small"
            label="Override CID"
            placeholder="e.g. 1897191"
            value={cid}
            onChange={(e) => setCid(onlyDigits(e.target.value))}
            onKeyDown={(e) => e.key === "Enter" && apply()}
            sx={{ bgcolor: "background.paper", borderRadius: 1 }}
          />
          <TextField
            size="small"
            label="Override Discord ID"
            placeholder="e.g. 1141377570479296584"
            value={discordId}
            onChange={(e) => setDiscordId(onlyDigits(e.target.value))}
            onKeyDown={(e) => e.key === "Enter" && apply()}
            sx={{ bgcolor: "background.paper", borderRadius: 1, flexGrow: 1 }}
          />
          <Button variant="contained" color="warning" onClick={apply}>
            Apply
          </Button>
          <Button color="inherit" onClick={reset}>
            Reset
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
