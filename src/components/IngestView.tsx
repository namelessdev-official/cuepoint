import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import { formatBytes, formatDuration, tc } from "@/lib/format";
import type { PipelinePhase, RequestLogEntry, TrackedJob, UploadMeta } from "@/lib/types";
import { Button, Chip, Field, Meter, Reveal, SectionHead, Select, Slider, StatTile, TextInput, StatusDot } from "./ui";
import { Equaliser, WaveThumb } from "./Ambient";
import {
  IconAlert,
  IconArrowRight,
  IconCheck,
  IconClock,
  IconClose,
  IconCode,
  IconFilm,
  IconLink,
  IconRefresh,
  IconSearch,
  IconUpload,
} from "./Icons";

const LANGUAGES = [
  ["", "Auto-detect"],
  ["en", "English"],
  ["es", "Spanish"],
  ["fr", "French"],
  ["de", "German"],
  ["pt", "Portuguese"],
  ["it", "Italian"],
  ["nl", "Dutch"],
  ["pl", "Polish"],
  ["tr", "Turkish"],
  ["ru", "Russian"],
  ["uk", "Ukrainian"],
  ["ar", "Arabic"],
  ["hi", "Hindi"],
  ["zh", "Chinese"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
  ["sv", "Swedish"],
  ["no", "Norwegian"],
  ["da", "Danish"],
  ["fi", "Finnish"],
];

interface MediaMeta {
  duration: number | null;
  width: number | null;
  height: number | null;
}

function readMediaMeta(file: File): Promise<MediaMeta> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("video/") && !file.type.startsWith("audio/")) {
      resolve({ duration: null, width: null, height: null });
      return;
    }
    const url = URL.createObjectURL(file);
    const el = document.createElement(file.type.startsWith("audio/") ? "audio" : "video");
    el.preload = "metadata";
    const done = (meta: MediaMeta) => {
      URL.revokeObjectURL(url);
      resolve(meta);
    };
    el.onloadedmetadata = () =>
      done({
        duration: Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null,
        width: (el as HTMLVideoElement).videoWidth || null,
        height: (el as HTMLVideoElement).videoHeight || null,
      });
    el.onerror = () => done({ duration: null, width: null, height: null });
    setTimeout(() => done({ duration: null, width: null, height: null }), 6000);
    el.src = url;
  });
}

const PHASES: Array<{ key: PipelinePhase | "indexed"; label: string }> = [
  { key: "uploading", label: "Upload" },
  { key: "queued", label: "Queued" },
  { key: "processing", label: "Transcribe" },
  { key: "indexed", label: "Indexed" },
];

function phaseIndex(job: TrackedJob): number {
  if (job.phase === "completed") return 4;
  if (job.phase === "failed" || job.phase === "cancelled") return -1;
  if (job.phase === "uploading") return 1;
  if (job.phase === "queued") return 2;
  return 3;
}

function JobRow({
  job,
  onCancel,
  onOpenVideo,
  onResume,
}: {
  job: TrackedJob;
  onCancel: (key: string) => void;
  onOpenVideo: (videoId: string) => void;
  onResume: (job: TrackedJob) => void;
}) {
  const idx = phaseIndex(job);
  const active = job.phase === "uploading" || job.phase === "queued" || job.phase === "processing";
  const pct = job.phase === "uploading" ? (job.uploadProgress ?? 0) : (job.jobProgress ?? (job.phase === "completed" ? 1 : 0.06));

  return (
    <li className="panel animate-rise px-3.5 py-3 transition-colors hover:border-line-strong">
      <div className="flex items-start gap-3">
        <span className="mt-0.5">
          {job.phase === "failed" ? (
            <StatusDot status="failed" />
          ) : job.phase === "completed" ? (
            <StatusDot status="completed" />
          ) : (
            <Equaliser bars={4} className="h-3.5" tone="text-cue" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="truncate font-display text-[14.5px] font-semibold tracking-[-0.01em] text-chalk">{job.title}</p>
            <Chip
              tone={
                job.phase === "completed" ? "mint" : job.phase === "failed" ? "coral" : job.phase === "cancelled" ? "dim" : "cue"
              }
            >
              {job.phase}
            </Chip>
          </div>
          <p className="mt-0.5 truncate font-mono text-[10.5px] text-dim">
            {job.fileName ? `${job.fileName} · ${formatBytes(job.fileSize)}` : "—"}
            {job.mediaDuration ? ` · ${formatDuration(job.mediaDuration)}` : ""}
            {job.jobId ? ` · job ${job.jobId.slice(0, 12)}` : ""}
          </p>

          <div className="mt-2.5 flex items-center gap-1.5">
            {PHASES.map((p, i) => {
              const state = idx < 0 ? "dead" : i < idx ? "done" : i === idx ? "current" : "todo";
              return (
                <span key={p.key} className="flex flex-1 flex-col gap-1">
                  <span
                    className={cn(
                      "h-[3px] w-full rounded-full transition-colors duration-500",
                      state === "done" && "bg-mint",
                      state === "current" && (active ? "bg-cue" : "bg-ink-500"),
                      state === "todo" && "bg-ink-600",
                      state === "dead" && "bg-coral/50",
                    )}
                  />
                  <span
                    className={cn(
                      "font-mono text-[9px] uppercase tracking-[.12em] transition-colors",
                      state === "todo" || state === "dead" ? "text-dim/70" : "text-muted",
                    )}
                  >
                    {p.label}
                  </span>
                </span>
              );
            })}
          </div>

          {active && (
            <div className="mt-2.5">
              <Meter value={pct} tone={job.phase === "uploading" ? "sky" : "cue"} />
              <p className="mt-1.5 flex items-center justify-between font-mono text-[10.5px] text-dim">
                <span className="truncate">
                  {job.stage ?? (job.phase === "uploading" ? "streaming bytes…" : `polling /jobs/${job.jobId ?? "…"}`)}
                </span>
                <span className="tabular-nums">
                  {job.phase === "uploading" ? `${Math.round((job.uploadProgress ?? 0) * 100)}%` : `${job.attempts} polls`}
                </span>
              </p>
            </div>
          )}

          {job.phase === "failed" && (
            <div className="mt-2.5 flex items-start gap-2 rounded-[3px] border border-coral/25 bg-coral/[.07] p-2">
              <IconAlert className="mt-px h-3.5 w-3.5 shrink-0 text-coral" />
              <p className="flex-1 text-[11.5px] leading-relaxed text-coral/90">{job.error ?? "Job failed."}</p>
            </div>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {job.phase === "completed" && job.videoId && (
              <Button size="sm" variant="primary" icon={<IconArrowRight className="h-3 w-3" />} onClick={() => onOpenVideo(job.videoId!)}>
                Open transcript
              </Button>
            )}
            {(job.phase === "failed" || job.phase === "cancelled") && job.jobId && (
              <Button size="sm" variant="solid" icon={<IconRefresh className="h-3 w-3" />} onClick={() => onResume(job)}>
                Resume watching
              </Button>
            )}
            {active && (
              <Button size="sm" variant="ghost" icon={<IconClose className="h-3 w-3" />} onClick={() => onCancel(job.key)}>
                Cancel
              </Button>
            )}
            <span className="ml-auto font-mono text-[10px] text-dim tabular-nums">
              <IconClock className="mr-1 inline h-3 w-3" />
              {formatDuration((Date.now() - job.startedAt) / 1000)} elapsed
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}

export function IngestView({
  ready,
  jobs,
  log,
  onUpload,
  onCancel,
  onResume,
  onOpenSettings,
  onOpenVideo,
  onGoLibrary,
  indexedCount,
}: {
  ready: boolean;
  jobs: TrackedJob[];
  log: RequestLogEntry[];
  onUpload: (file: File, meta: UploadMeta) => void;
  onCancel: (key: string) => void;
  onResume: (job: TrackedJob) => void;
  onOpenSettings: () => void;
  onOpenVideo: (videoId: string) => void;
  onGoLibrary: () => void;
  indexedCount: number;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<MediaMeta>({ duration: null, width: null, height: null });
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState("");
  const [speakersAuto, setSpeakersAuto] = useState(true);
  const [speakers, setSpeakers] = useState(2);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) {
      setMeta({ duration: null, width: null, height: null });
      return;
    }
    let alive = true;
    void readMediaMeta(file).then((m) => alive && setMeta(m));
    return () => {
      alive = false;
    };
  }, [file]);

  const accept = (f: File | undefined | null) => {
    if (!f) return;
    setFile(f);
    setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim().slice(0, 300));
  };

  const submit = () => {
    if (!file) return;
    onUpload(file, {
      title: title.trim() || null,
      language: language || null,
      numSpeakers: speakersAuto ? null : Math.min(32, Math.max(1, speakers)),
      mediaDuration: meta.duration,
    });
    setFile(null);
    setTitle("");
  };

  const active = useMemo(() => jobs.filter((j) => ["uploading", "queued", "processing"].includes(j.phase)), [jobs]);
  const done = useMemo(() => jobs.filter((j) => !["uploading", "queued", "processing"].includes(j.phase)), [jobs]);

  return (
    <div className="space-y-6">
      <SectionHead
        eyebrow="Ingest · POST /videos"
        title={
          <>
            Drop a video.
            <br />
            Get a timecoded transcript.
          </>
        }
        sub="Multipart upload straight from this browser, then Cuepoint watches the job, pulls the transcript and files it into your searchable library."
        right={
          <>
            <StatTile label="Videos indexed" value={indexedCount} tone="mint" />
            <StatTile label="In flight" value={active.length} tone={active.length ? "cue" : "dim"} />
          </>
        }
      />

      {!ready && (
        <div className="panel relative overflow-hidden border-cue/35 p-5">
          <div className="absolute inset-y-0 left-0 w-[3px] bg-cue" />
          <div className="flex flex-wrap items-center gap-4 pl-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-[4px] border border-cue/30 bg-cue/10 text-cue">
              <IconLink className="h-5 w-5" />
            </span>
            <div className="min-w-[240px] flex-1">
              <h3 className="font-display text-[17px] font-bold tracking-[-0.01em] text-chalk">Connect your API first</h3>
              <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-muted">
                Cuepoint ships with no hard-coded endpoint. Provide the base URL and the <code className="font-mono text-cue/90">X-API-Key</code>{" "}
                value for your deployment — they stay in this browser.
              </p>
            </div>
            <Button variant="primary" size="lg" icon={<IconLink className="h-4 w-4" />} onClick={onOpenSettings}>
              Enter base URL & key
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        {/* ------------------------------ dropzone ------------------------------ */}
        <div className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragging(false);
              accept(e.dataTransfer.files?.[0]);
            }}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            className={cn(
              "panel group relative cursor-pointer overflow-hidden px-6 py-10 text-center transition-all duration-200",
              "hover:border-cue/45 hover:bg-cue/[.03]",
              dragging && "scale-[1.008] border-cue bg-cue/[.07] shadow-[0_0_60px_-20px_rgba(255,177,60,.7)]",
            )}
          >
            <div className="sprockets absolute inset-y-0 left-0 w-[10px] opacity-40" />
            <div className="sprockets absolute inset-y-0 right-0 w-[10px] opacity-40" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cue/50 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

            <div className="relative mx-auto flex max-w-lg flex-col items-center">
              <span
                className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-[5px] border transition-all duration-200",
                  dragging ? "scale-110 border-cue bg-cue/15 text-cue" : "border-line-strong bg-ink-800 text-cue/85 group-hover:scale-105",
                )}
              >
                <IconUpload className="h-6 w-6" />
              </span>
              <p className="mt-4 font-display text-[20px] font-bold leading-tight tracking-[-0.015em] text-chalk">
                {dragging ? "Release to load" : "Drag a video or audio file here"}
              </p>
              <p className="mt-1.5 text-[12.5px] text-muted">
                or <span className="text-cue underline decoration-cue/40 underline-offset-4">browse your device</span> — MP4, MOV, WebM, MP3, WAV, M4A
              </p>
              <WaveThumb seed={7} className="mt-6 h-6 w-full max-w-sm opacity-70" />
              <input
                ref={inputRef}
                type="file"
                accept="video/*,audio/*"
                className="hidden"
                onChange={(e) => {
                  accept(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          {file && (
            <div className="panel animate-rise p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-[3px] border border-line-strong bg-ink-800 text-cue">
                  <IconFilm className="h-5 w-5" />
                </span>
                <div className="min-w-[180px] flex-1">
                  <p className="truncate font-display text-[15px] font-semibold text-chalk">{file.name}</p>
                  <p className="mt-0.5 font-mono text-[10.5px] text-dim">
                    {formatBytes(file.size)} · {file.type || "unknown type"}
                    {meta.duration ? ` · ${tc(meta.duration)} (${formatDuration(meta.duration)})` : ""}
                    {meta.width ? ` · ${meta.width}×${meta.height}` : ""}
                  </p>
                </div>
                <Button variant="ghost" size="sm" icon={<IconClose className="h-3 w-3" />} onClick={() => setFile(null)}>
                  Remove
                </Button>
              </div>

              <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
                <Field label="Title" hint="Optional · max 300 chars · defaults to the file name." className="sm:col-span-2">
                  <TextInput value={title} maxLength={300} placeholder="Interview — Q3 review" onChange={(e) => setTitle(e.target.value)} />
                </Field>
                <Field label="Language" hint="Blank lets the engine auto-detect.">
                  <Select value={language} onChange={(e) => setLanguage(e.target.value)}>
                    {LANGUAGES.map(([code, name]) => (
                      <option key={code || "auto"} value={code}>
                        {name}
                        {code ? ` (${code})` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="label-xs">Speaker diarisation</span>
                    <button
                      type="button"
                      onClick={() => setSpeakersAuto((a) => !a)}
                      className={cn(
                        "relative h-[18px] w-[34px] rounded-full border transition-colors duration-200",
                        speakersAuto ? "border-mint/50 bg-mint/25" : "border-line-strong bg-ink-700",
                      )}
                      aria-pressed={speakersAuto}
                      aria-label="Toggle automatic speaker count"
                    >
                      <span
                        className={cn(
                          "absolute top-[2px] h-[12px] w-[12px] rounded-full transition-all duration-200",
                          speakersAuto ? "left-[19px] bg-mint" : "left-[2px] bg-dim",
                        )}
                      />
                    </button>
                  </div>
                  {speakersAuto ? (
                    <p className="rounded-[3px] border border-line bg-ink-900/60 px-3 py-2 text-[11.5px] text-muted">
                      Automatic — <code className="font-mono text-[11px] text-dim">num_speakers</code> is omitted from the request.
                    </p>
                  ) : (
                    <div className="rounded-[3px] border border-line bg-ink-900/60 px-3 py-2">
                      <Slider label="num_speakers" min={1} max={32} value={speakers} onChange={setSpeakers} format={(v) => `${v}`} />
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3.5">
                <Button variant="primary" size="lg" disabled={!ready} icon={<IconUpload className="h-4 w-4" />} onClick={submit}>
                  Start transcription
                </Button>
                {!ready ? (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="font-mono text-[11px] uppercase tracking-[.14em] text-coral underline decoration-coral/40 underline-offset-4"
                  >
                    connect the API to enable upload
                  </button>
                ) : (
                  <code className="font-mono text-[11px] text-dim">
                    POST /videos · multipart: file{title.trim() ? ", title" : ""}
                    {language ? ", language" : ""}
                    {!speakersAuto ? ", num_speakers" : ""}
                  </code>
                )}
              </div>
            </div>
          )}

          {/* flow rail */}
          <Reveal className="panel p-4">
            <p className="label-xs mb-3">Pipeline</p>
            <ol className="grid gap-3 sm:grid-cols-3">
              {[
                { n: "01", ep: "POST /videos", t: "Upload", d: "Multipart form with file, title, language and num_speakers. Returns 202 plus a job id." },
                { n: "02", ep: "GET /jobs/{job_id}", t: "Watch", d: "Cuepoint polls until the job reports completed or failed, showing progress as it goes." },
                { n: "03", ep: "GET /search?q=", t: "Search", d: "Query every transcript at once, or one video, and jump straight to the matching timecode." },
              ].map((s) => (
                <li
                  key={s.n}
                  className="group relative overflow-hidden rounded-[3px] border border-line bg-ink-900/50 p-3 transition-all duration-200 hover:-translate-y-px hover:border-cue/35"
                >
                  <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-cue/60 via-cue/10 to-transparent opacity-60 transition-opacity group-hover:opacity-100" />
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-cue">{s.n}</span>
                    <span className="font-display text-[13.5px] font-semibold text-chalk">{s.t}</span>
                  </div>
                  <code className="mt-1 block truncate font-mono text-[10.5px] text-mint/80">{s.ep}</code>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">{s.d}</p>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>

        {/* ------------------------------- monitor ------------------------------ */}
        <div className="space-y-4">
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-[15px] font-semibold tracking-[-0.01em] text-chalk">Job monitor</h3>
              {jobs.length > 0 && (
                <button
                  type="button"
                  onClick={onGoLibrary}
                  className="font-mono text-[10px] uppercase tracking-[.14em] text-dim transition-colors hover:text-cue"
                >
                  library →
                </button>
              )}
            </div>

            {jobs.length === 0 ? (
              <div className="panel flex flex-col items-start gap-2 px-4 py-6">
                <span className="flex items-center gap-2 text-dim">
                  <IconClock className="h-4 w-4" />
                  <span className="label-xs">idle</span>
                </span>
                <p className="text-[12.5px] leading-relaxed text-muted">
                  Nothing running. Uploads and their polling sessions appear here live — you can navigate away and they keep going.
                </p>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {[...active, ...done].map((job) => (
                  <JobRow key={job.key} job={job} onCancel={onCancel} onOpenVideo={onOpenVideo} onResume={onResume} />
                ))}
              </ul>
            )}
          </section>

          <section className="panel overflow-hidden">
            <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
              <IconCode className="h-3.5 w-3.5 text-dim" />
              <h3 className="label-xs text-muted">Request trace</h3>
              <span className="ml-auto font-mono text-[10px] text-dim">{log.length}</span>
            </div>
            {log.length === 0 ? (
              <p className="px-3.5 py-4 text-[12px] leading-relaxed text-dim">
                Every call this console makes is listed here with its status and round-trip time.
              </p>
            ) : (
              <ul className="max-h-[260px] divide-y divide-line overflow-y-auto">
                {log.slice(0, 40).map((entry) => (
                  <li key={entry.id} className="flex items-center gap-2 px-3.5 py-1.5 font-mono text-[10.5px] transition-colors hover:bg-white/[.03]">
                    <span className={cn("w-8 shrink-0", entry.method === "POST" ? "text-cue" : "text-sky")}>{entry.method}</span>
                    <span className="min-w-0 flex-1 truncate text-muted" title={entry.path}>
                      {entry.path}
                    </span>
                    <span className={cn("shrink-0 tabular-nums", entry.ok ? "text-mint" : "text-coral")}>{entry.status ?? "ERR"}</span>
                    <span className="w-12 shrink-0 text-right tabular-nums text-dim">{entry.ms}ms</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel p-3.5">
            <p className="label-xs mb-2 flex items-center gap-1.5">
              <IconSearch className="h-3 w-3" /> What happens next
            </p>
            <ul className="space-y-1.5 text-[12px] leading-relaxed text-muted">
              <li className="flex gap-2">
                <IconCheck className="mt-[3px] h-3 w-3 shrink-0 text-mint" />
                Completed transcripts are cached locally so re-opening a video is instant.
              </li>
              <li className="flex gap-2">
                <IconCheck className="mt-[3px] h-3 w-3 shrink-0 text-mint" />
                Search spans every video you have indexed, with word-level context you control.
              </li>
              <li className="flex gap-2">
                <IconCheck className="mt-[3px] h-3 w-3 shrink-0 text-mint" />
                Export any transcript as SRT, WebVTT, Markdown, JSON or plain text.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}


