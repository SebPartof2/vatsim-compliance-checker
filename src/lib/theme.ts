"use client";

import { createTheme } from "@mui/material/styles";

/** App theme. VATSIM-ish blues with a clean, modern surface treatment. */
const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#29a5e3" },
    secondary: { main: "#5865F2" }, // Discord blurple
    background: { default: "#f4f6f8", paper: "#ffffff" },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily:
      'var(--font-roboto), system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    h4: { fontWeight: 700 },
    h5: { fontWeight: 600 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { textTransform: "none", fontWeight: 600 } },
    },
  },
});

export default theme;
