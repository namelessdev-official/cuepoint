import { useEffect, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import { hasCredentials, normalizeBaseUrl, probeConnection, type ProbeResult } from "@/lib/api";
import type { Settings } from "@/lib/types";
import { Button, Chip, Field, Kbd, TextInput } from "./ui";
import { IconAlert, IconCheck, IconClose, IconCopy, IconEye, IconEyeOff, IconKey, IconLink } from "./Icons";
import { useToast } from "./Toasts";
import { copyText } from "@/lib/exporters";

const CORS_SNIPPET = `# FastAPI — allow this browser origin
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # or your exact origin
    allow_methods=["GET", "POST"],
    allow_headers=["X-API-Key", "Content-Type"],
)`;

export function ConnectionDrawer({
  open,
  settings,
  onSave,
  onClose,
}: {
  open: boolean;
  settings: Settings;
  onSave: (s: Settings) => void;
  onClose: () => void;
}) {
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [reveal, setReveal] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [copied, setCopied] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);
  const toast = useToast();

  useEffect(() => {
    if (open) {
      setBaseUrl(settings.baseUrl);
      setApiKey(settings.apiKey);
      setProbe(null);
      setTimeout(() => firstField.current?.focus(), 60);
    }
  }, [open, settings.baseUrl, settings.apiKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const dirty = baseUrl !== settings.baseUrl || apiKey !== settings.apiKey;
  const candidate: Settings = { baseUrl: normalizeBaseUrl(baseUrl), apiKey: apiKey.trim() };

  const runProbe = async () => {
    if (!hasCredentials(candidate)) {
      toast({ tone: "warn", title: "Both fields are required", body: "Enter a base URL and an API key first." });
      return;
    }
    setProbing(true);
    setProbe(null);
    const result = await probeConnection(candidate);
    setProbe(result);
    setProbing(false);
  };

  const save = () => {
    onSave(candidate);
    toast({
      tone: "success",
      title: "Connection saved",
      body: `${new URL(candidate.baseUrl).host} · key held in this browser only`,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <button
        type="button"
        aria-label="Close connection settings"
        onClick={onClose}
        className="absolute inset-0 bg-ink-950/70 backdrop-blur-[3px] animate-[rise_.25s_ease-out]"
      />
      <aside
        role="dialog"
        aria-label="API connection"
        className="relative flex h-full w-[min(100vw,520px)] animate-slide-in flex-col border-l border-line-strong bg-ink-900 shadow-[-30px_0_80px_-30px_rgba(0,0,0,.9)]"
      >
        <header className="flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-[3px] border border-cue/30 bg-cue/10 text-cue">
            <IconLink className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[17px] font-bold leading-tight tracking-[-0.01em]">API connection</h2>
            <p className="text-[11.5px] text-dim">Direct from this browser — no proxy, nothing stored server-side.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-[3px] border border-transparent p-1.5 text-muted transition-colors hover:border-line-strong hover:bg-white/[.05] hover:text-chalk"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <Field
            label="Base URL"
            hint="Root of the API — no /videos or /search suffix. Trailing paths are trimmed automatically."
          >
            <TextInput
              ref={firstField}
              value={baseUrl}
              spellCheck={false}
              autoComplete="off"
              placeholder="https://transcript-api.example.com"
              onChange={(e) => setBaseUrl(e.target.value)}
              className="font-mono text-[12.5px]"
            />
          </Field>

          <Field
            label="API key"
            hint={
              <>
                Sent as the <code className="font-mono text-[11px] text-cue/90">X-API-Key</code> request header on every call.
              </>
            }
            right={
              <button
                type="button"
                onClick={() => setReveal((r) => !r)}
                className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[.14em] text-dim transition-colors hover:text-cue"
              >
                {reveal ? <IconEyeOff className="h-3 w-3" /> : <IconEye className="h-3 w-3" />}
                {reveal ? "hide" : "show"}
              </button>
            }
          >
            <TextInput
              value={apiKey}
              type={reveal ? "text" : "password"}
              spellCheck={false}
              autoComplete="off"
              placeholder="••••••••••••••••"
              onChange={(e) => setApiKey(e.target.value)}
              className="font-mono text-[12.5px]"
            />
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="solid" onClick={runProbe} loading={probing} icon={<IconLink className="h-3.5 w-3.5" />}>
              Test connection
            </Button>
            <Button variant="primary" onClick={save} disabled={!hasCredentials(candidate)}>
              {dirty ? "Save & connect" : "Save"}
            </Button>
            {hasCredentials(settings) && (
              <Button
                variant="ghost"
                onClick={() => {
                  onSave({ baseUrl: "", apiKey: "" });
                  setBaseUrl("");
                  setApiKey("");
                  setProbe(null);
                  toast({ tone: "info", title: "Credentials cleared" });
                }}
              >
                Clear
              </Button>
            )}
            <span className="ml-auto flex items-center gap-1.5 text-[11px] text-dim">
              <Kbd>Esc</Kbd> to close
            </span>
          </div>

          {probe && (
            <div
              className={cn(
                "panel animate-rise p-3.5",
                probe.ok ? "border-mint/30" : probe.kind === "auth" ? "border-coral/40" : "border-cue/30",
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn(probe.ok ? "text-mint" : "text-coral")}>
                  {probe.ok ? <IconCheck className="h-4 w-4" /> : <IconAlert className="h-4 w-4" />}
                </span>
                <span className="font-display text-[14px] font-semibold text-chalk">
                  {probe.ok ? "Endpoint reachable" : probe.kind === "auth" ? "Credentials rejected" : "Could not verify"}
                </span>
                {probe.status !== null && <Chip tone={probe.ok ? "mint" : "coral"}>{probe.status}</Chip>}
                <span className="ml-auto font-mono text-[11px] text-dim tabular-nums">{probe.latencyMs} ms</span>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-muted">{probe.message}</p>
              {!probe.ok && probe.kind === "network" && (
                <div className="mt-3 border-t border-line pt-3">
                  <p className="label-xs mb-2">Most common cause · CORS</p>
                  <p className="text-[12px] leading-relaxed text-muted">
                    A browser-only client is blocked unless the API returns permissive CORS headers. Add this to the server:
                  </p>
                  <pre className="mt-2 max-h-44 overflow-auto rounded-[3px] border border-line bg-ink-950/80 p-2.5 font-mono text-[10.5px] leading-relaxed text-muted">
                    {CORS_SNIPPET}
                  </pre>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2"
                    icon={copied ? <IconCheck className="h-3 w-3 text-mint" /> : <IconCopy className="h-3 w-3" />}
                    onClick={async () => {
                      const ok = await copyText(CORS_SNIPPET);
                      setCopied(ok);
                      setTimeout(() => setCopied(false), 1800);
                    }}
                  >
                    {copied ? "Copied" : "Copy snippet"}
                  </Button>
                </div>
              )}
              {!probe.ok && probe.kind === "auth" && (
                <p className="mt-2 border-t border-line pt-2 text-[12px] leading-relaxed text-muted">
                  The server answered, so the base URL is right — the <code className="font-mono text-cue/90">X-API-Key</code>{" "}
                  header was not accepted.
                </p>
              )}
            </div>
          )}

          <div className="panel p-3.5">
            <p className="label-xs mb-2 flex items-center gap-1.5">
              <IconKey className="h-3 w-3" /> Handling of your key
            </p>
            <ul className="space-y-1.5 text-[12px] leading-relaxed text-muted">
              <li>· Stored in <code className="font-mono text-[11px] text-chalk/80">localStorage</code> on this device only.</li>
              <li>· Never logged, never forwarded — requests go straight to your base URL.</li>
              <li>· Clearing the fields above removes it immediately.</li>
            </ul>
          </div>
        </div>
      </aside>
    </div>
  );
}
