import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/utils/cn";
import { IconAlert, IconCheck, IconClose, IconInfo } from "./Icons";

export type ToastTone = "info" | "success" | "error" | "warn";

export interface ToastInput {
  tone?: ToastTone;
  title: string;
  body?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface Toast extends ToastInput {
  id: number;
}

const ToastCtx = createContext<(t: ToastInput) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

const TONE_STYLES: Record<ToastTone, { bar: string; icon: ReactNode; text: string }> = {
  info: { bar: "bg-sky", icon: <IconInfo className="h-3.5 w-3.5" />, text: "text-sky" },
  success: { bar: "bg-mint", icon: <IconCheck className="h-3.5 w-3.5" />, text: "text-mint" },
  error: { bar: "bg-coral", icon: <IconAlert className="h-3.5 w-3.5" />, text: "text-coral" },
  warn: { bar: "bg-cue", icon: <IconAlert className="h-3.5 w-3.5" />, text: "text-cue" },
};

function ToastCard({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const duration = toast.duration ?? (toast.tone === "error" ? 11_000 : 6_000);
  const [armed, setArmed] = useState(false);
  const style = TONE_STYLES[toast.tone ?? "info"];

  useEffect(() => {
    const raf = requestAnimationFrame(() => setArmed(true));
    const timer = setTimeout(onClose, duration);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [duration, onClose]);

  return (
    <div className="pointer-events-auto relative w-[min(92vw,380px)] animate-slide-in overflow-hidden rounded-[4px] border border-line-strong bg-ink-850/95 shadow-[0_18px_50px_-18px_rgba(0,0,0,.9)] backdrop-blur-sm">
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", style.bar)} />
      <div className="flex items-start gap-2.5 py-2.5 pl-4 pr-2.5">
        <span className={cn("mt-[1px]", style.text)}>{style.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold leading-snug text-chalk">{toast.title}</p>
          {toast.body && <p className="mt-1 text-[11.5px] leading-relaxed text-muted break-words">{toast.body}</p>}
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action?.onClick();
                onClose();
              }}
              className="mt-2 font-mono text-[10.5px] uppercase tracking-[.14em] text-cue underline decoration-cue/40 underline-offset-4 transition-colors hover:text-[#ffd79a]"
            >
              {toast.action.label}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="-mr-0.5 rounded-[3px] p-1 text-dim transition-colors hover:bg-white/[.06] hover:text-chalk"
        >
          <IconClose className="h-3 w-3" />
        </button>
      </div>
      <div className="h-[2px] w-full bg-ink-700">
        <div
          className={cn("h-full transition-[width] linear", style.bar)}
          style={{ width: armed ? "0%" : "100%", transitionDuration: `${duration}ms`, opacity: 0.7 }}
        />
      </div>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const push = useCallback((t: ToastInput) => {
    idRef.current += 1;
    const toast: Toast = { id: idRef.current, tone: "info", ...t };
    setToasts((prev) => [...prev.slice(-3), toast]);
  }, []);

  const close = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);
  const value = useMemo(() => push, [push]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex flex-col items-end gap-2">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onClose={() => close(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
