"use client";

import { useEffect, useState, createContext, useContext, useCallback, useMemo, type ReactNode } from "react";
import { CheckIcon, AlertTriangleIcon, InfoIcon, XIcon } from "../icons";

export type ToastType = "success" | "error" | "info" | "warning";
export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

type ToastInput = Omit<ToastItem, "id">;
interface ToastContextType {
  addToast: (toast: ToastInput) => void;
  removeToast: (id: string) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const removeToast = useCallback((id: string) => setToasts(prev => prev.filter(t => t.id !== id)), []);
  const addToast = useCallback((toast: ToastInput) => {
    const item = { ...toast, id: crypto.randomUUID(), duration: toast.duration ?? (toast.type === "error" ? 0 : 6000) };
    setToasts(prev => [...prev.filter(t => t.title !== item.title || t.message !== item.message).slice(-3), item]);
  }, []);
  const value = useMemo(() => ({
    addToast, removeToast,
    success: (title: string, message?: string) => addToast({ type: "success", title, message }),
    error: (title: string, message?: string) => addToast({ type: "error", title, message }),
    info: (title: string, message?: string) => addToast({ type: "info", title, message }),
    warning: (title: string, message?: string) => addToast({ type: "warning", title, message }),
  }), [addToast, removeToast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-container" aria-label="Notifications">
        {toasts.map(toast => <ToastCard key={toast.id} toast={toast} onClose={removeToast} />)}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast requires ToastProvider");
  return context;
}

function ToastCard({ toast, onClose }: { toast: ToastItem; onClose: (id: string) => void }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!toast.duration || paused) return;
    const timer = setTimeout(() => onClose(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [toast.duration, toast.id, onClose, paused]);
  const Icon = toast.type === "success" ? CheckIcon : toast.type === "info" ? InfoIcon : AlertTriangleIcon;
  return (
    <div className={`toast-card toast-${toast.type}`} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
      <span className="toast-icon"><Icon size={18} /></span>
      <div className="toast-content" aria-live={toast.type === "error" ? "assertive" : "polite"} aria-atomic="true">
        <div className="toast-title">{toast.title}</div>
        {toast.message && <div className="toast-message">{toast.message}</div>}
      </div>
      <button type="button" className="toast-close" onClick={() => onClose(toast.id)} aria-label={`Close notification: ${toast.title}`}><XIcon size={16} /></button>
    </div>
  );
}
