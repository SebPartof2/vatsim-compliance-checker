"use client";

import Button from "@mui/material/Button";
import Link from "next/link";

/**
 * App-bar nav button. This lives in a Client Component because MUI's
 * `component={Link}` prop is a function, which cannot be passed across the
 * Server -> Client Component boundary.
 */
export default function NavLinkButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Button color="inherit" component={Link} href={href}>
      {children}
    </Button>
  );
}
