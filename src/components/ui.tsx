import { useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/utils/cn";
import type { JobStatus } from "@/lib/types";
import { IconChevron, IconSpinner } from "./Icons";
import { useReveal } from "@/lib/hooks";

/* --------------------------------- Buttons -------------------------------- */

type Variant = "primary" | "outline" | "ghost" | "danger" | "solid";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-cue text-ink-950 border border-cue hover:bg-[#ffc061] shadow-[0_1px_0_rgba(255,255,255,.25)_inset,0_8px_20px_-12px_rgba(255,177,60,.9)] font-semibold",
  solid: "bg-ink-700 text-chalk border border-line-strong hover:bg-ink-600 hover:border-ink-400",
  outline: "bg-transparent text-chalk/85 border border-line-strong hover:border-cue/60 hover:text-chalk hover:bg-cue/[.06]",
  ghost: "bg-transparent text-muted border border-transparent hover:text-chalk hover:bg-white/[.05]",
  danger: "bg-coral/12 text-coral border border-coral/35 hover:bg-coral/20 hover:border-coral/60",
};

const SIZES: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[11.5px] gap-1.5 rounded-[3px]",
  md: "h-9 px-3.5 text-[13px] gap-2 rounded-[3px]",
  lg: "h-11 px-5 text-sm gap-2 rounded-[4px]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  trailing?: ReactNode;
}

export function Button({
  variant = "outline",
  size = "md",
  loading = false,
  icon,
  trailing,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(
        "group/btn relative inline-flex select-none items-center justify-center whitespace-nowrap font-medium",
        "transition-[transform,background-color,border-color,color,box-shadow] duration-150",
        "active:translate-y-px disabled:pointer-events-none disabled:opacity-40",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <IconSpinner className="h-3.5 w-3.5 animate-spin" /> : icon}
      {children}
      {trailing}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-[3px] border border-transparent text-muted",
        "transition-colors duration-150 hover:border-line-strong hover:bg-white/[.05] hover:text-chalk active:translate-y-px",
        "disabled:pointer-events-none disabled:opacity-35",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ---------------------------------- Chips --------------------------------- */

export type Tone = "cue" | "mint" | "coral" | "sky" | "dim" | "chalk";

const TONES: Record<Tone, string> = {
  cue: "text-cue border-cue/30 bg-cue/10",
  mint: "text-mint border-mint/30 bg-mint/10",
  coral: "text-coral border-coral/30 bg-coral/10",
  sky: "text-sky border-sky/30 bg-sky/10",
  dim: "text-dim border-line bg-white/[.03]",
  chalk: "text-chalk/80 border-line-strong bg-white/[.05]",
};

export function Chip({
  tone = "dim",
  className,
  children,
  icon,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[3px] border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[.13em]",
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export const STATUS_TONE: Record<JobStatus, Tone> = {
  queued: "sky",
  processing: "cue",
  completed: "mint",
  failed: "coral",
  unknown: "dim",
};

export function StatusDot({ status, className }: { status: JobStatus; className?: string }) {
  const color =
    status === "completed"
      ? "bg-mint"
      : status === "failed"
        ? "bg-coral"
        : status === "processing"
          ? "bg-cue"
          : status === "queued"
            ? "bg-sky"
            : "bg-dim";
  return (
    <span className={cn("relative inline-flex h-2 w-2 shrink-0", className)}>
      {(status === "processing" || status === "queued") && (
        <span className={cn("absolute inset-0 rounded-full animate-pulse-ring", color)} />
      )}
      <span className={cn("relative h-2 w-2 rounded-full", color)} />
    </span>
  );
}

/* ---------------------------------- Inputs -------------------------------- */

export function Field({
  label,
  hint,
  children,
  className,
  right,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  right?: ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="label-xs">{label}</span>
        {right}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-[11px] leading-snug text-dim">{hint}</span>}
    </label>
  );
}

const inputBase =
  "w-full rounded-[3px] border border-line-strong bg-ink-900/80 px-3 text-[13px] text-chalk placeholder:text-dim/70 " +
  "transition-colors duration-150 hover:border-ink-400 focus:border-cue/70 focus:bg-ink-900 focus:outline-none " +
  "focus:ring-2 focus:ring-cue/15";

export function TextInput({
  className,
  invalid,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; ref?: React.Ref<HTMLInputElement> }) {
  return <input className={cn(inputBase, "h-9", invalid && "border-coral/60 focus:border-coral focus:ring-coral/15", className)} {...rest} />;
}

export function Select({
  className,
  children,
  ...rest
}: InputHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <div className="relative">
      <select
        className={cn(inputBase, "h-9 appearance-none pr-8", className)}
        {...(rest as React.SelectHTMLAttributes<HTMLSelectElement>)}
      >
        {children}
      </select>
      <IconChevron className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 rotate-90 text-dim" />
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  const id = useId();
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <label htmlFor={id} className="label-xs">
          {label}
        </label>
        <span className="font-mono text-[11px] text-cue tabular-nums">{format ? format(value) : value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer"
      />
    </div>
  );
}

/* --------------------------------- Displays -------------------------------- */

export function Meter({ value, tone = "cue", className }: { value: number; tone?: Tone; className?: string }) {
  const bg =
    tone === "mint" ? "bg-mint" : tone === "coral" ? "bg-coral" : tone === "sky" ? "bg-sky" : "bg-cue";
  return (
    <div className={cn("relative h-1 w-full overflow-hidden rounded-full bg-ink-600", className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-500 ease-out", bg)}
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      />
    </div>
  );
}

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div style={style} className={cn("relative overflow-hidden rounded-[3px] bg-ink-700/60", className)}>
      <div className="absolute inset-y-0 -left-1/3 w-1/3 animate-scan bg-gradient-to-r from-transparent via-white/[.07] to-transparent" />
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[3px] border border-line-strong bg-ink-800 px-1 font-mono text-[10px] text-muted">
      {children}
    </kbd>
  );
}

export function SectionHead({
  eyebrow,
  title,
  sub,
  right,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="label-xs mb-2 text-cue/80">{eyebrow}</div>}
        <h2 className="font-display text-[26px] font-bold leading-[1.05] tracking-[-0.02em] text-chalk">{title}</h2>
        {sub && <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted">{sub}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

export function StatTile({
  label,
  value,
  unit,
  tone = "chalk",
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: Tone;
  className?: string;
}) {
  const color =
    tone === "cue" ? "text-cue" : tone === "mint" ? "text-mint" : tone === "coral" ? "text-coral" : tone === "sky" ? "text-sky" : "text-chalk";
  return (
    <div className={cn("panel px-3.5 py-3", className)}>
      <div className="label-xs">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className={cn("font-display text-[26px] font-bold leading-none tracking-[-0.03em] tabular-nums", color)}>{value}</span>
        {unit && <span className="font-mono text-[10px] uppercase tracking-wider text-dim">{unit}</span>}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("panel flex flex-col items-start gap-3 p-7", className)}>
      {icon && (
        <span className="flex h-10 w-10 items-center justify-center rounded-[4px] border border-line-strong bg-ink-800 text-cue">
          {icon}
        </span>
      )}
      <div>
        <h3 className="font-display text-lg font-semibold tracking-[-0.01em] text-chalk">{title}</h3>
        {body && <div className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted">{body}</div>}
      </div>
      {action}
    </div>
  );
}

export function RawJson({ data, label = "Raw response", defaultOpen = false }: { data: unknown; label?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const text = (() => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  })();
  return (
    <div className="panel overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-white/[.03]"
      >
        <IconChevron className={cn("h-3 w-3 text-dim transition-transform duration-200", open && "rotate-90")} />
        <span className="label-xs text-muted">{label}</span>
        <span className="ml-auto font-mono text-[10px] text-dim">{text.length.toLocaleString()} chars</span>
      </button>
      {open && (
        <pre className="max-h-80 overflow-auto border-t border-line bg-ink-950/70 p-3 font-mono text-[11px] leading-relaxed text-muted">
          {text}
        </pre>
      )}
    </div>
  );
}

export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "li" | "section" | "article";
}) {
  const { ref, visible } = useReveal<HTMLDivElement>(delay);
  return (
    <Tag ref={ref as never} className={cn("reveal", visible && "is-visible", className)}>
      {children}
    </Tag>
  );
}
