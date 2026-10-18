"use client";

import { Dialog, type DialogProps } from "./Dialog";

export type ModalProps = DialogProps & { size?: "sm" | "md" | "lg" };

export function Modal(props: ModalProps) {
  return <Dialog {...props} variant="modal" />;
}
