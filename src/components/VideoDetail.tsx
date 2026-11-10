import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import { copyText, download, slugify, toMarkdown, toJson, toSRT, toTranscriptTxt, toVTT } from "@/lib/exporters";
import {
  countWords,
  displaySpeaker,
  formatDateTime,
  formatDuration,
  formatNumber,
  highlightParts,
  speakerColor,
  tc,
  tcPrecise,
  wordsPerMinute,
} from "@/lib/format";
import type { LibraryEntry, Segment, TrackedJob, VideoRecord } from "@/lib/types";
import { Button, Chip, EmptyState, IconButton, Meter, RawJson, Select, Skeleton, StatusDot, TextInput } from "./ui";
import { Equaliser } from "./Ambient";
import { Player, type PlayerHandle } from "./Player";
import {
  IconAlert,
  IconArrowRight,
  IconCheck,
  IconClock,
  IconClose,
  IconCode,
  IconCopy,
  IconDownload,
  IconFilm,
  IconLink,
  IconRefresh,
  IconSearch,
  IconSpeaker,
  IconTrash,
  IconWave,
} from "./Icons";
import { useToast } from "./Toasts";

const SPEAKER_TEXT: Record<string, string> = {
  cue: "text-cue",
  mint: "text-mint",
  sky: "text-sky",
  coral: "text-coral",
  chalk: "text-chalk/80",
};

const PAGE = 120;

function findActiveIndex(segments: Segment[], t: number): number {
  let lo = 0;
  let hi = segments.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const start = segments[mid].start ?? 0;
    if (start <= t) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best;
}

export function VideoDetail({
  ready,
  entry,
  video,
  loading,
  error,
  mediaUrl,
  activeJob,
  focus,
  onBack,
  onRefresh,
  onRemove,
  onOpenSettings,
  onAttachMedia,
  onSetMediaUrl,
  onSearchAll,
  onFocusHandled,
}: {
  ready: boolean;
  entry: LibraryEntry | null;
  video: VideoRecord | null;
  loading: boolean;
  error: string | null;
  mediaUrl: string | null;
  activeJob: TrackedJob | null;
  focus: { time: number | null; query: string | null } | null;
  onBack: () => void;
  onRefresh: () => void;
  onRemove: () => void;
  onOpenSettings: () => void;
  onAttachMedia: (file: File) => void;
  onSetMediaUrl: (url: string | null) => void;
  onSearchAll: (query: string) => void;
  onFocusHandled: () => void;
}) {
  const [filter, setFilter] = useState("");
  const [highlight, setHighlight] = useState<string | null>(null);
  const [speakerFilter, setSpeakerFilter] = useState<string | null>(null);
  const [visible, setVisible] = useState(PAGE);
  const [current, setCurrent] = useState(0);
  const [follow, setFollow] = useState(true);
  const [compact, setCompact] = useState(false);
  const [menu, setMenu] = useState(false);
  const [jump, setJump] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [urlDraft, setUrlDraft] = useState(entry?.mediaUrl ?? "");
  const [copiedSeg, setCopiedSeg] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const playerRef = useRef<PlayerHandle>(null);
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const segments = video?.segments ?? [];

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return segments.filter((s) => {
      if (speakerFilter && s.speaker !== speakerFilter) return false;
      if (q && !s.text.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [segments, filter, speakerFilter]);

  const page = useMemo(() => shown.slice(0, visible), [shown, visible]);

  useEffect(() => setVisible(PAGE), [filter, speakerFilter, video?.id]);
  useEffect(() => setUrlDraft(entry?.mediaUrl ?? ""), [entry?.videoId, entry?.mediaUrl]);

  const activeIndex = useMemo(() => (mediaUrl && segments.length ? findActiveIndex(segments, current) : -1), [mediaUrl, segments, current]);

  const scrollToSegment = useCallback((seg: Segment, doFlash = true) => {
    const node = rowRefs.current.get(seg.id);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    if (doFlash) {
      setFlash(seg.id);
      setTimeout(() => setFlash(null), 1600);
    }
  }, []);

  // Jump-in from search results.
  useEffect(() => {
    if (!focus || !segments.length) return;
    setFilter("");
    setSpeakerFilter(null);
    if (focus.query) setHighlight(focus.query);
    let target: Segment | undefined;
    if (focus.time !== null) {
      const idx = findActiveIndex(segments, focus.time);
      target = segments[Math.max(0, idx)];
    } else if (focus.query) {
      target = segments.find((s) => s.text.toLowerCase().includes(focus.query!.toLowerCase()));
    }
    if (target) {
      const needPage = segments.findIndex((s) => s.id === target!.id);
      if (needPage >= PAGE) setVisible(Math.ceil((needPage + 1) / PAGE) * PAGE);
      if (focus.time !== null) playerRef.current?.seek(focus.time);
      requestAnimationFrame(() => setTimeout(() => scrollToSegment(target!, true), 120));
    }
    onFocusHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, segments.length]);

  // Follow playback.
  useEffect(() => {
    if (!follow || !mediaUrl || activeIndex < 0) return;
    const seg = segments[activeIndex];
    if (!seg) return;
    const node = rowRefs.current.get(seg.id);
    const box = listRef.current;
    if (!node || !box) return;
    const nodeTop = node.offsetTop;
    const viewTop = box.scrollTop;
    const viewBottom = viewTop + box.clientHeight;
    if (nodeTop < viewTop + 40 || nodeTop > viewBottom - 80) {
      box.scrollTo({ top: nodeTop - box.clientHeight / 2.6, behavior: "smooth" });
    }
  }, [activeIndex, follow, mediaUrl, segments]);

  const speakerStats = useMemo(() => {
    const map = new Map<string, { cues: number; words: number }>();
    for (const s of segments) {
      const key = s.speaker ?? "";
      const cur = map.get(key) ?? { cues: 0, words: 0 };
      cur.cues += 1;
      cur.words += countWords(s.text);
      map.set(key, cur);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].words - a[1].words);
  }, [segments]);

  const copy = async (id: string, text: string) => {
    const ok = await copyText(text);
    if (ok) {
      setCopiedSeg(id);
      setTimeout(() => setCopiedSeg(null), 1500);
    } else toast({ tone: "error", title: "Clipboard blocked by the browser" });
  };

  const doExport = (kind: "srt" | "vtt" | "md" | "json" | "txt") => {
    if (!video) return;
    const name = slugify(video.title);
    if (!segments.length) {
      toast({ tone: "warn", title: "Nothing to export", body: "This video has no transcript cues yet." });
      return;
    }
    switch (kind) {
      case "srt":
        download(`${name}.srt`, toSRT(segments), "application/x-subrip;charset=utf-8");
        break;
      case "vtt":
        download(`${name}.vtt`, toVTT(video), "text/vtt;charset=utf-8");
        break;
      case "md":
        download(`${name}.md`, toMarkdown(video), "text/markdown;charset=utf-8");
        break;
      case "json":
        download(`${name}.json`, toJson(video), "application/json;charset=utf-8");
        break;
      case "txt":
        download(`${name}.txt`, toTranscriptTxt(video), "text/plain;charset=utf-8");
        break;
    }
    setMenu(false);
    toast({ tone: "success", title: `${kind.toUpperCase()} exported`, body: `${segments.length} cues · ${name}` });
  };

  const doJump = () => {
    const t = parseJump(jump);
    if (t === null) {
      toast({ tone: "warn", title: "Unreadable timecode", body: "Use mm:ss, hh:mm:ss or plain seconds." });
      return;
    }
    const idx = findActiveIndex(segments, t);
    const seg = segments[Math.max(0, idx)];
    playerRef.current?.seek(t);
    if (seg) scrollToSegment(seg);
    setJump("");
  };

  const title = video?.title ?? entry?.title ?? "Video";
  const wpm = wordsPerMinute(segments, video?.duration ?? null);
  const working = loading || (activeJob && ["uploading", "queued", "processing"].includes(activeJob.phase));

  return (
    <div className="space-y-5">
      {/* ---------------------------------- header --------------------------------- */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="group inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[.14em] text-dim transition-colors hover:text-cue"
          >
            <IconArrowRight className="h-3 w-3 rotate-180 transition-transform duration-200 group-hover:-translate-x-0.5" />
            library
          </button>
          <span className="h-3 w-px bg-line" />
          <StatusDot status={entry?.status ?? video?.status ?? "unknown"} />
          <span className="font-mono text-[10.5px] uppercase tracking-[.13em] text-muted">
            {activeJob && ["queued", "processing"].includes(activeJob.phase) ? activeJob.phase : (entry?.status ?? "unknown")}
          </span>
          {entry?.starred && <Chip tone="cue">pinned</Chip>}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-[32px] font-bold leading-[1.02] tracking-[-0.03em] text-chalk sm:text-[38px]">
              {title}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-[11px] text-dim">
              <button
                type="button"
                onClick={() => void copy("video-id", video?.id ?? entry?.videoId ?? "")}
                className="group inline-flex items-center gap-1.5 transition-colors hover:text-cue"
                title="Copy video_id"
              >
                <span className="text-muted/80">{copiedSeg === "video-id" ? "copied" : (video?.id ?? entry?.videoId ?? "—")}</span>
                {copiedSeg === "video-id" ? <IconCheck className="h-3 w-3 text-mint" /> : <IconCopy className="h-3 w-3 opacity-40 group-hover:opacity-100" />}
              </button>
              {video?.language && <span>· lang {video.language}</span>}
              {video?.createdAt && <span>· created {formatDateTime(video.createdAt)}</span>}
              {entry?.fileName && <span>· {entry.fileName}</span>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Button
                variant="solid"
                icon={<IconDownload className="h-3.5 w-3.5" />}
                onClick={() => setMenu((m) => !m)}
                disabled={!segments.length}
                trailing={<IconArrowRight className={cn("h-3 w-3 rotate-90 transition-transform", menu && "-rotate-90")} />}
              >
                Export
              </Button>
              {menu && (
                <>
                  <button type="button" className="fixed inset-0 z-20 cursor-default" aria-label="Close menu" onClick={() => setMenu(false)} />
                  <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-56 animate-rise overflow-hidden rounded-[4px] border border-line-strong bg-ink-850 shadow-[0_24px_60px_-24px_rgba(0,0,0,.95)]">
                    {(
                      [
                        ["srt", "SubRip (.srt)", "Player-ready subtitles"],
                        ["vtt", "WebVTT (.vtt)", "HTML5 <track> compatible"],
                        ["md", "Markdown (.md)", "Timecoded bullet list"],
                        ["txt", "Plain text (.txt)", "One cue per line"],
                        ["json", "JSON (.json)", "Structured, with words"],
                      ] as const
                    ).map(([kind, label, hint]) => (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => doExport(kind)}
                        className="flex w-full items-baseline gap-2 border-b border-line px-3 py-2 text-left transition-colors last:border-0 hover:bg-cue/[.08]"
                      >
                        <span className="text-[12.5px] text-chalk">{label}</span>
                        <span className="ml-auto font-mono text-[9.5px] text-dim">{hint}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <Button variant="outline" icon={<IconRefresh className={cn("h-3.5 w-3.5", loading && "animate-spin")} />} onClick={onRefresh} disabled={!ready || loading}>
              Refresh
            </Button>
            {confirmRemove ? (
              <span className="flex items-center gap-1.5 rounded-[3px] border border-coral/35 bg-coral/10 px-2 py-1">
                <span className="text-[11.5px] text-coral">Remove?</span>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    onRemove();
                    setConfirmRemove(false);
                  }}
                >
                  Yes
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
                  No
                </Button>
              </span>
            ) : (
              <IconButton label="Remove from library" onClick={() => setConfirmRemove(true)}>
                <IconTrash className="h-3.5 w-3.5" />
              </IconButton>
            )}
          </div>
        </div>

        <div className="panel grid grid-cols-2 divide-line sm:grid-cols-3 lg:grid-cols-6 lg:divide-x">
          {[
            { label: "runtime", value: video?.duration ? tc(video.duration) : "—", sub: formatDuration(video?.duration ?? null) },
            { label: "cues", value: formatNumber(segments.length || entry?.segmentCount), sub: "timestamped" },
            { label: "words", value: formatNumber(video?.wordCount ?? entry?.wordCount), sub: "transcribed" },
            { label: "speakers", value: formatNumber(speakerStats.filter(([k]) => k).length || entry?.speakers.length), sub: "diarised" },
            { label: "pace", value: wpm ? formatNumber(wpm) : "—", sub: "words / min" },
            { label: "avg cue", value: segments.length ? `${(segments.reduce((a, s) => a + countWords(s.text), 0) / segments.length).toFixed(1)}` : "—", sub: "words" },
          ].map((s) => (
            <div key={s.label} className="px-3.5 py-2.5">
              <div className="label-xs">{s.label}</div>
              <div className="mt-1 font-display text-[19px] font-bold leading-none tracking-[-0.02em] text-chalk tabular-nums">{s.value}</div>
              <div className="mt-1 font-mono text-[9.5px] uppercase tracking-[.1em] text-dim">{s.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="panel flex flex-wrap items-center gap-3 border-coral/35 p-4">
          <IconAlert className="h-4 w-4 shrink-0 text-coral" />
          <p className="min-w-[200px] flex-1 text-[12.5px] leading-relaxed text-coral/90">{error}</p>
          <Button size="sm" variant="solid" onClick={onRefresh} disabled={!ready}>
            Retry
          </Button>
          <Button size="sm" variant="ghost" onClick={onOpenSettings}>
            Connection
          </Button>
        </div>
      )}

      {working && !segments.length && (
        <div className="panel p-5">
          <div className="flex items-center gap-2.5">
            <Equaliser bars={5} className="h-4" />
            <h3 className="font-display text-[16px] font-semibold tracking-[-0.01em] text-chalk">
              {activeJob?.phase === "uploading" ? "Uploading…" : "Transcription in progress"}
            </h3>
            {activeJob?.jobId && <Chip tone="dim">job {activeJob.jobId.slice(0, 12)}</Chip>}
          </div>
          <div className="mt-3.5">
            <Meter value={activeJob ? (activeJob.jobProgress ?? activeJob.uploadProgress ?? 0.05) : 0.05} />
          </div>
          <p className="mt-2 font-mono text-[11px] text-dim">
            {activeJob?.stage ?? `polling GET /jobs/${activeJob?.jobId ?? "…"}`} · {activeJob?.attempts ?? 0} polls
          </p>
          <div className="mt-4 space-y-2.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-6 w-14 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-full" style={{ opacity: 1 - i * 0.15 }} />
                  <Skeleton className="h-3 w-2/3" style={{ opacity: 1 - i * 0.15 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,352px)]">
        {/* -------------------------------- transcript ------------------------------- */}
        <div className="min-w-0 space-y-3">
          <div className="panel flex flex-wrap items-center gap-2.5 p-2.5">
            <div className="relative min-w-[190px] flex-1">
              <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dim" />
              <TextInput
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter cues in this transcript…"
                className="h-8 pl-8 text-[12.5px]"
              />
              {filter && (
                <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
                  <span className="font-mono text-[10px] text-cue tabular-nums">{shown.length}</span>
                  <IconButton label="Clear filter" onClick={() => setFilter("")}>
                    <IconClose className="h-3 w-3" />
                  </IconButton>
                </span>
              )}
            </div>

            {speakerStats.filter(([k]) => k).length > 1 && (
              <Select
                value={speakerFilter ?? ""}
                onChange={(e) => setSpeakerFilter(e.target.value || null)}
                className="h-8 w-[132px] text-[12px]"
              >
                <option value="">All speakers</option>
                {speakerStats
                  .filter(([k]) => k)
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {displaySpeaker(k)} · {v.cues} cues
                    </option>
                  ))}
              </Select>
            )}

            <button
              type="button"
              onClick={() => setCompact((c) => !c)}
              className={cn(
                "h-8 rounded-[3px] border px-2.5 font-mono text-[10px] uppercase tracking-[.13em] transition-colors",
                compact ? "border-cue/45 bg-cue/10 text-cue" : "border-line text-dim hover:text-muted",
              )}
            >
              {compact ? "compact" : "comfortable"}
            </button>
            <button
              type="button"
              onClick={() => setFollow((f) => !f)}
              disabled={!mediaUrl}
              className={cn(
                "h-8 rounded-[3px] border px-2.5 font-mono text-[10px] uppercase tracking-[.13em] transition-colors disabled:opacity-35",
                follow && mediaUrl ? "border-mint/45 bg-mint/10 text-mint" : "border-line text-dim hover:text-muted",
              )}
              title="Keep the transcript scrolled to the playhead"
            >
              follow
            </button>
            <Button
              size="sm"
              variant="ghost"
              icon={<IconSearch className="h-3 w-3" />}
              onClick={() => onSearchAll(filter.trim() || title)}
              disabled={!ready}
              className="h-8"
            >
              Search library
            </Button>
          </div>

          {!video && loading && (
            <div className="panel space-y-3 p-4">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="h-6 w-14 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {video && !segments.length && !working && (
            <EmptyState
              icon={<IconWave className="h-5 w-5" />}
              title="The server returned no cues for this video"
              body={
                <>
                  Nothing resembling a transcript was found in the response. Open the raw payload below to inspect what came back —
                  Cuepoint understands <code className="font-mono text-[12px] text-chalk/80">segments</code>,{" "}
                  <code className="font-mono text-[12px] text-chalk/80">utterances</code>,{" "}
                  <code className="font-mono text-[12px] text-chalk/80">words</code>, <code className="font-mono text-[12px] text-chalk/80">cues</code>{" "}
                  and a few more shapes.
                </>
              }
              action={
                <Button variant="solid" onClick={onRefresh} disabled={!ready}>
                  Fetch again
                </Button>
              }
            />
          )}

          {page.length > 0 && (
            <div ref={listRef} className="panel relative max-h-[68vh] overflow-y-auto">
              <div className="sprockets pointer-events-none absolute inset-y-0 left-0 w-[10px] opacity-30" />
              <ul className="divide-y divide-line/70">
                {page.map((seg) => {
                  const isActive = mediaUrl && segments.indexOf(seg) === activeIndex;
                  const q = filter.trim() || highlight;
                  const parts = q ? highlightParts(seg.text, q) : [{ text: seg.text, hit: false }];
                  return (
                    <li
                      key={seg.id}
                      ref={(node) => {
                        if (node) rowRefs.current.set(seg.id, node);
                        else rowRefs.current.delete(seg.id);
                      }}
                      className={cn(
                        "group relative flex gap-3 pl-4 pr-3 transition-colors duration-200",
                        compact ? "py-1.5" : "py-2.5",
                        isActive ? "bg-cue/[.07]" : "hover:bg-white/[.025]",
                        flash === seg.id && "bg-cue/15 ring-1 ring-inset ring-cue/60",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute inset-y-0 left-0 w-[2px] transition-colors duration-200",
                          isActive ? "bg-cue" : "bg-transparent group-hover:bg-line-strong",
                        )}
                      />
                      <div className="w-[62px] shrink-0 pt-[1px]">
                        <button
                          type="button"
                          onClick={() => {
                            if (seg.start !== null) playerRef.current?.seek(seg.start);
                            void copy(`tc-${seg.id}`, seg.start !== null ? tcPrecise(seg.start) : seg.text);
                          }}
                          className={cn(
                            "block w-full rounded-[3px] px-1 py-0.5 text-left font-mono tabular-nums transition-colors",
                            compact ? "text-[10.5px]" : "text-[11.5px]",
                            isActive ? "bg-cue/20 text-cue" : "text-cue/75 hover:bg-cue/12 hover:text-cue",
                          )}
                          title={seg.start !== null ? "Seek to this cue" : "No timestamp"}
                        >
                          {seg.start !== null ? tc(seg.start) : "--:--"}
                        </button>
                        {seg.start !== null && seg.end !== null && seg.end > seg.start && (
                          <span className="mt-0.5 block font-mono text-[9px] text-dim tabular-nums">
                            {(seg.end - seg.start).toFixed(1)}s
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        {seg.speaker && (
                          <div className={cn("mb-0.5 font-mono text-[9.5px] uppercase tracking-[.14em]", SPEAKER_TEXT[speakerColor(seg.speaker)] ?? "text-muted")}>
                            <IconSpeaker className="mr-1 inline h-2.5 w-2.5" />
                            {displaySpeaker(seg.speaker)}
                          </div>
                        )}
                        <p
                          className={cn(
                            "text-[14px] leading-[1.7] text-chalk/88 transition-colors group-hover:text-chalk",
                            compact && "text-[13px] leading-[1.55]",
                          )}
                        >
                          {parts.map((p, idx) =>
                            p.hit ? (
                              <mark key={idx} className="mark-hit font-medium">
                                {p.text}
                              </mark>
                            ) : (
                              <span key={idx}>{p.text}</span>
                            ),
                          )}
                        </p>
                        {seg.words.length > 0 && !compact && (
                          <div className="mt-1.5 flex flex-wrap gap-x-1 gap-y-0.5">
                            {seg.words.slice(0, 40).map((w, wi) => (
                              <button
                                key={`${seg.id}-w-${wi}`}
                                type="button"
                                onClick={() => w.start !== null && playerRef.current?.seek(w.start)}
                                title={w.start !== null ? tcPrecise(w.start) : undefined}
                                className={cn(
                                  "rounded-[2px] px-0.5 font-mono text-[10.5px] transition-colors",
                                  mediaUrl && w.start !== null && current >= w.start && current <= (w.end ?? w.start + 0.4)
                                    ? "bg-cue/25 text-cue"
                                    : "text-dim hover:bg-white/[.06] hover:text-muted",
                                )}
                              >
                                {w.text}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex shrink-0 items-start gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                        <IconButton label="Copy cue" onClick={() => void copy(seg.id, seg.text)}>
                          {copiedSeg === seg.id ? <IconCheck className="h-3.5 w-3.5 text-mint" /> : <IconCopy className="h-3.5 w-3.5" />}
                        </IconButton>
                        <IconButton
                          label="Search this line across the library"
                          onClick={() => onSearchAll(seg.text.split(/\s+/).slice(0, 6).join(" "))}
                        >
                          <IconSearch className="h-3.5 w-3.5" />
                        </IconButton>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {shown.length > page.length && (
                <div className="sticky bottom-0 border-t border-line bg-ink-850/95 px-4 py-2.5 backdrop-blur-sm">
                  <Button size="sm" variant="solid" className="w-full" onClick={() => setVisible((v) => v + PAGE)}>
                    Show {Math.min(PAGE, shown.length - page.length)} more cues
                    <span className="ml-2 font-mono text-[10px] text-dim">
                      {page.length}/{shown.length}
                    </span>
                  </Button>
                </div>
              )}
            </div>
          )}

          {video && (
            <RawJson data={video.raw} label={`Raw /videos/${video.id.slice(0, 16)} payload`} />
          )}
        </div>

        {/* ---------------------------------- rail ---------------------------------- */}
        <aside className="space-y-4 lg:sticky lg:top-[76px] lg:self-start">
          <Player
            ref={playerRef}
            src={mediaUrl}
            title={title}
            duration={video?.duration ?? entry?.duration}
            markers={(highlight || filter ? shown : segments).map((s) => s.start).filter((t): t is number => t !== null)}
            onTime={setCurrent}
            fallback={
              <Button size="sm" variant="solid" icon={<IconFilm className="h-3.5 w-3.5" />} onClick={() => fileRef.current?.click()}>
                Attach the original file
              </Button>
            }
          />

          <div className="panel space-y-3 p-3.5">
            <p className="label-xs">Playback source</p>
            {mediaUrl ? (
              <div className="flex items-center gap-2">
                <StatusDot status="completed" />
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-mint">
                  {mediaUrl.startsWith("blob:") ? "local file · this session only" : mediaUrl}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    onSetMediaUrl(null);
                    setUrlDraft("");
                  }}
                >
                  Detach
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <TextInput
                  value={urlDraft}
                  spellCheck={false}
                  placeholder="https://…/recording.mp4"
                  onChange={(e) => setUrlDraft(e.target.value)}
                  className="h-8 font-mono text-[11.5px]"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="solid"
                    disabled={!/^https?:\/\/.+/.test(urlDraft.trim())}
                    onClick={() => {
                      onSetMediaUrl(urlDraft.trim());
                      toast({ tone: "success", title: "Media URL attached", body: "Saved with this library entry." });
                    }}
                  >
                    Use URL
                  </Button>
                  <Button size="sm" variant="ghost" icon={<IconFilm className="h-3 w-3" />} onClick={() => fileRef.current?.click()}>
                    Local file
                  </Button>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="video/*,audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onAttachMedia(f);
                    e.target.value = "";
                  }}
                />
              </div>
            )}
          </div>

          <div className="panel space-y-2.5 p-3.5">
            <p className="label-xs">Jump to timecode</p>
            <div className="flex gap-2">
              <TextInput
                value={jump}
                placeholder="mm:ss or 00:01:23.400"
                onChange={(e) => setJump(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doJump()}
                className="h-8 font-mono text-[12px]"
              />
              <Button size="sm" variant="primary" onClick={doJump} disabled={!segments.length} className="h-8">
                Go
              </Button>
            </div>
            <p className="text-[11px] leading-relaxed text-dim">
              Scrolls the transcript to the nearest cue and seeks the player when media is attached.
            </p>
          </div>

          {speakerStats.length > 0 && (
            <div className="panel p-3.5">
              <p className="label-xs mb-2.5">Speakers</p>
              <ul className="space-y-1.5">
                {speakerStats.map(([key, v]) => (
                  <li key={key || "none"}>
                    <button
                      type="button"
                      disabled={!key}
                      onClick={() => setSpeakerFilter((s) => (s === key ? null : key))}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-[3px] border px-2 py-1.5 text-left transition-all duration-150 disabled:cursor-default",
                        speakerFilter === key ? "border-cue/50 bg-cue/[.08]" : "border-transparent hover:border-line hover:bg-white/[.03]",
                      )}
                    >
                      <span className={cn("h-2 w-2 rounded-full", key ? `bg-current ${SPEAKER_TEXT[speakerColor(key)]}` : "bg-dim")} />
                      <span className="font-mono text-[11.5px] text-chalk/85">{key ? displaySpeaker(key) : "Unassigned"}</span>
                      <span className="ml-auto font-mono text-[10.5px] text-dim tabular-nums">
                        {v.cues} cues · {formatNumber(v.words)}w
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {video && video.shape.length > 0 && (
            <div className="panel p-3.5">
              <p className="label-xs mb-2 flex items-center gap-1.5">
                <IconCode className="h-3 w-3" /> Response shape
              </p>
              <div className="flex flex-wrap gap-1">
                {video.shape.map((k) => (
                  <span key={k} className="rounded-[2px] border border-line bg-ink-900/60 px-1.5 py-0.5 font-mono text-[10px] text-muted">
                    {k}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-dim">
                Cuepoint maps unknown payloads onto a common cue model — these are the keys the server actually sent.
              </p>
            </div>
          )}

          {entry && (
            <div className="panel p-3.5">
              <p className="label-xs mb-2 flex items-center gap-1.5">
                <IconClock className="h-3 w-3" /> Registry
              </p>
              <dl className="space-y-1 font-mono text-[10.5px]">
                {[
                  ["added", formatDateTime(entry.addedAt)],
                  ["updated", formatDateTime(entry.updatedAt)],
                  ["job", entry.jobId ?? "—"],
                  ["language", entry.language ?? "—"],
                  ["num_speakers", entry.numSpeakers ? String(entry.numSpeakers) : "auto"],
                  ["source file", entry.fileName ?? "—"],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <dt className="w-[92px] shrink-0 text-dim">{k}</dt>
                    <dd className="min-w-0 flex-1 truncate text-muted" title={v}>
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>
              {!ready && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="mt-2.5 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[.13em] text-cue hover:underline"
                >
                  <IconLink className="h-3 w-3" /> connect to refresh
                </button>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function parseJump(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  if (t.includes(":")) {
    const parts = t.split(":").map((p) => Number(p));
    if (parts.some((p) => !Number.isFinite(p))) return null;
    return parts.reduce((acc, p) => acc * 60 + p, 0);
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
