"use client";

import { useEffect, useState } from "react";
import { useColorScheme } from "@mui/material/styles";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";

/** Light/dark toggle. Defaults to the system scheme until the user picks one. */
export default function ThemeToggle() {
  const { mode, systemMode, setMode } = useColorScheme();
  const [mounted, setMounted] = useState(false);

  // The resolved scheme isn't known during SSR; render a stable placeholder
  // first so hydration doesn't mismatch.
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <IconButton color="inherit" disabled>
        <DarkModeIcon />
      </IconButton>
    );
  }

  const resolved = mode === "system" ? systemMode : mode;
  const isDark = resolved === "dark";

  return (
    <Tooltip title={isDark ? "Switch to light mode" : "Switch to dark mode"}>
      <IconButton
        color="inherit"
        onClick={() => setMode(isDark ? "light" : "dark")}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      >
        {isDark ? <LightModeIcon /> : <DarkModeIcon />}
      </IconButton>
    </Tooltip>
  );
}
