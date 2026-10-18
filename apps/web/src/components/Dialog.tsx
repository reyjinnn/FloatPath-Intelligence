"use client";

import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";
import { XIcon } from "../icons";

let openDialogs = 0;
let previousOverflow = "";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  dismissible?: boolean;
}

export function Dialog({ open, onClose, title, subtitle, children, footer, dismissible = true, variant, size = "md", width }: DialogProps & {
  variant: "modal" | "drawer";
  size?: "sm" | "md" | "lg";
  width?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const subtitleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (openDialogs++ === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    dialog.showModal();
    return () => {
      dialog.close();
      if (--openDialogs === 0) document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <dialog
      ref={ref}
      className={`${variant}-backdrop ${variant === "modal" ? `modal-${size}` : ""}`}
      aria-labelledby={titleId}
      aria-describedby={subtitle ? subtitleId : undefined}
      aria-modal="true"
      style={width ? { "--drawer-width": width } as CSSProperties : undefined}
      onCancel={event => { event.preventDefault(); if (dismissible) onClose(); }}
      onClick={event => { if (event.target === event.currentTarget && dismissible) onClose(); }}
    >
      <div className={variant === "modal" ? "modal-container" : "drawer-panel"}>
        <header className={`${variant}-header`}>
          <div>
            <h2 id={titleId} className={`${variant}-title`}>{title}</h2>
            {subtitle && <p id={subtitleId} className={`${variant}-subtitle`}>{subtitle}</p>}
          </div>
          <button type="button" className={`${variant}-close-btn`} disabled={!dismissible} onClick={onClose} aria-label={variant === "modal" ? "Close dialog" : "Close panel"}>
            <XIcon size={18} />
          </button>
        </header>
        <div className={`${variant}-body`}>{children}</div>
        {footer && <footer className={`${variant}-footer`}>{footer}</footer>}
      </div>
    </dialog>
  );
}
