"use client";

import { Dialog, type DialogProps } from "./Dialog";

export type DrawerProps = DialogProps & { width?: string };

export function Drawer({ width = "480px", ...props }: DrawerProps) {
  return <Dialog {...props} width={width} variant="drawer" />;
}
