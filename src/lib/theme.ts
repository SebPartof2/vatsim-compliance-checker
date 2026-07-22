"use client";

import { createTheme } from "@mui/material/styles";

/**
 * App theme with light + dark color schemes.
 *
 * Uses MUI's CSS-variables mode so the scheme can switch without a re-render
 * and can be applied before first paint (see InitColorSchemeScript in layout).
 */
const theme = createTheme({
  cssVariables: { colorSchemeSelector: "class" },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: "#29a5e3" },
        secondary: { main: "#5865F2" }, // Discord blurple
        background: { default: "#f4f6f8", paper: "#ffffff" },
      },
    },
    dark: {
      palette: {
        primary: { main: "#4fb8ec" },
        secondary: { main: "#7983f5" },
        background: { default: "#0f1417", paper: "#171e24" },
      },
    },
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
