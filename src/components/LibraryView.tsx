import { useMemo, useState } from "react";
import { cn } from "@/utils/cn";
import { displaySpeaker, formatDuration, formatNumber, formatRelative, initials, tc } from "@/lib/format";
import type { LibraryEntry, TrackedJob } from "@/lib/types";
import { Button, Chip, EmptyState, IconButton, SectionHead, Select, StatusDot, TextInput, STATUS_TONE } from "./ui";
import { WaveThumb } from "./Ambient";
import {
  IconAlert,
  IconArrowRight,
  IconClose,
  IconLibrary,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconStar,
  IconTrash,
} from "./Icons";

type SortKey = "recent" | "title" | "duration" | "words";
type StatusFilter = "all" | "completed" | "active" | "failed";

export function LibraryView({
  ready,
  entries,
  jobs,
  onOpen,
  onRefresh,
  onRemove,
  onAddById,
  onToggleStar,
  onOpenSettings,
  onGoSearch,
  busyIds,
}: {
  ready: boolean;
  entries: LibraryEntry[];
  jobs: TrackedJob[];
  onOpen: (videoId: string) => void;
  onRefresh: (videoId: string) => void;
  onRemove: (videoId: string) => void;
  onAddById: (videoId: string) => void;
  onToggleStar: (videoId: string) => void;
  onOpenSettings: () => void;
  onGoSearch: (videoId?: string) => void;
  busyIds: Set<string>;
}) {
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [adding, setAdding] = useState(false);
  const [newId, setNewId] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const jobFor = useMemo(() => {
    const map = new Map<string, TrackedJob>();
    for (const j of jobs) if (j.videoId) map.set(j.videoId, j);
    return map;
  }, [jobs]);

  const totals = useMemo(() => {
    const words = entries.reduce((a, e) => a + (e.wordCount ?? 0), 0);
    const runtime = entries.reduce((a, e) => a + (e.duration ?? 0), 0);
    const speakers = new Set(entries.flatMap((e) => e.speakers)).size;
    return { words, runtime, speakers };
  }, [entries]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let list = entries.filter((e) => {
      if (q && !`${e.title} ${e.videoId} ${e.fileName ?? ""}`.toLowerCase().includes(q)) return false;
      if (status === "completed") return e.status === "completed";
      if (status === "failed") return e.status === "failed";
      if (status === "active") return e.status === "processing" || e.status === "queued" || e.status === "unknown";
      return true;
    });
    list = [...list].sort((a, b) => {
      if (a.starred !== b.starred) return a.starred ? -1 : 1;
      switch (sort) {
        case "title":
          return a.title.localeCompare(b.title);
        case "duration":
          return (b.duration ?? 0) - (a.duration ?? 0);
        case "words":
          return (b.wordCount ?? 0) - (a.wordCount ?? 0);
        default:
          return b.addedAt - a.addedAt;
      }
    });
    return list;
  }, [entries, filter, status, sort]);

  const submitId = () => {
    const id = newId.trim();
    if (!id) return;
    onAddById(id);
    setNewId("");
    setAdding(false);
  };

  return (
    <div className="space-y-5">
      <SectionHead
        eyebrow="Library · GET /videos/{video_id}"
        title="Everything this browser has indexed"
        sub="The API exposes no list endpoint, so Cuepoint keeps its own registry: every upload, every id you look up, plus the transcripts it has already fetched."
        right={
          <>
            <Button variant="solid" icon={<IconPlus className="h-3.5 w-3.5" />} onClick={() => setAdding((a) => !a)} disabled={!ready}>
              Add by id
            </Button>
            <Button variant="outline" icon={<IconSearch className="h-3.5 w-3.5" />} onClick={() => onGoSearch()} disabled={!entries.length}>
              Search library
            </Button>
          </>
        }
      />

      <div className="panel grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
        {[
          { label: "Videos", value: formatNumber(entries.length), tone: "text-chalk" },
          { label: "Words transcribed", value: formatNumber(totals.words), tone: "text-cue" },
          { label: "Indexed runtime", value: formatDuration(totals.runtime), tone: "text-mint" },
          { label: "Distinct speakers", value: formatNumber(totals.speakers), tone: "text-sky" },
        ].map((s) => (
          <div key={s.label} className="px-4 py-3.5">
            <div className="label-xs">{s.label}</div>
            <div className={cn("mt-1.5 font-display text-[24px] font-bold leading-none tracking-[-0.03em] tabular-nums", s.tone)}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {adding && (
        <div className="panel flex flex-wrap items-end gap-3 p-3.5 animate-rise">
          <div className="min-w-[240px] flex-1">
            <span className="label-xs mb-1.5 block">video_id</span>
            <TextInput
              autoFocus
              value={newId}
              spellCheck={false}
              placeholder="e.g. 7c1f2a90-…"
              onChange={(e) => setNewId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitId();
                if (e.key === "Escape") setAdding(false);
              }}
              className="font-mono text-[12.5px]"
            />
          </div>
          <Button variant="primary" onClick={submitId} disabled={!newId.trim()}>
            Fetch video
          </Button>
          <Button variant="ghost" onClick={() => setAdding(false)}>
            Cancel
          </Button>
          <p className="w-full text-[11.5px] text-dim">
            Pulls <code className="font-mono text-muted">GET /videos/&#123;video_id&#125;</code> and files the transcript into this library.
          </p>
        </div>
      )}

      {entries.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[200px] flex-1">
            <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dim" />
            <TextInput
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by title, id or file name…"
              className="pl-8"
            />
            {filter && (
              <IconButton label="Clear filter" onClick={() => setFilter("")} className="absolute right-1 top-1/2 -translate-y-1/2">
                <IconClose className="h-3 w-3" />
              </IconButton>
            )}
          </div>
          <div className="flex items-center gap-1">
            {(["all", "completed", "active", "failed"] as StatusFilter[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={cn(
                  "rounded-[3px] border px-2 py-1 font-mono text-[10px] uppercase tracking-[.13em] transition-all duration-150",
                  status === s ? "border-cue/50 bg-cue/10 text-cue" : "border-line text-dim hover:border-line-strong hover:text-muted",
                )}
              >
                {s}
                {s !== "all" && (
                  <span className="ml-1.5 text-dim/70">
                    {entries.filter((e) =>
                      s === "completed"
                        ? e.status === "completed"
                        : s === "failed"
                          ? e.status === "failed"
                          : ["processing", "queued", "unknown"].includes(e.status),
                    ).length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="w-[150px]">
            <option value="recent">Newest first</option>
            <option value="title">Title A→Z</option>
            <option value="duration">Longest runtime</option>
            <option value="words">Most words</option>
          </Select>
        </div>
      )}

      {entries.length === 0 ? (
        <EmptyState
          icon={<IconLibrary className="h-5 w-5" />}
          title={ready ? "No videos indexed yet" : "Connect the API to start building the library"}
          body={
            ready ? (
              <>
                Upload a video from the <span className="text-cue">Ingest</span> tab, or fetch one you already know the{" "}
                <code className="font-mono text-[12px] text-chalk/80">video_id</code> for. Each finished transcript is cached here so
                searching and re-reading it costs nothing.
              </>
            ) : (
              <>Cuepoint talks directly to your deployment — set the base URL and API key to begin.</>
            )
          }
          action={
            ready ? (
              <Button variant="primary" icon={<IconPlus className="h-3.5 w-3.5" />} onClick={() => setAdding(true)}>
                Add a video by id
              </Button>
            ) : (
              <Button variant="primary" icon={<IconArrowRight className="h-3.5 w-3.5" />} onClick={onOpenSettings}>
                Enter credentials
              </Button>
            )
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<IconSearch className="h-5 w-5" />}
          title="Nothing matches those filters"
          body="Try a different status filter or clear the text filter."
          action={
            <Button
              variant="solid"
              onClick={() => {
                setFilter("");
                setStatus("all");
              }}
            >
              Reset filters
            </Button>
          }
        />
      ) : (
        <ul className="panel divide-y divide-line overflow-hidden">
          {visible.map((entry, i) => {
            const job = jobFor.get(entry.videoId);
            const busy = busyIds.has(entry.videoId);
            const active = job && ["uploading", "queued", "processing"].includes(job.phase);
            return (
              <li
                key={entry.videoId}
                className="group relative animate-rise"
                style={{ animationDelay: `${Math.min(i * 28, 340)}ms` }}
              >
                <span className="absolute inset-y-0 left-0 w-[2px] origin-top scale-y-0 bg-cue transition-transform duration-200 group-hover:scale-y-100" />
                <div
                  className={cn(
                    "flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-3 pl-5 transition-colors duration-150 hover:bg-white/[.028]",
                    confirmId === entry.videoId && "pointer-events-none",
                  )}
                  onClick={() => onOpen(entry.videoId)}
                >
                  <div className="flex min-w-[220px] flex-1 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] border border-line-strong bg-ink-800 font-display text-[11px] font-bold text-cue/80">
                      {initials(entry.title)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-display text-[14.5px] font-semibold leading-tight tracking-[-0.01em] text-chalk transition-colors group-hover:text-cue">
                        {entry.title}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 truncate font-mono text-[10.5px] text-dim">
                        <span className="truncate">{entry.videoId}</span>
                        {entry.language && <span className="text-muted/70">· {entry.language}</span>}
                        {entry.fileName && <span className="truncate">· {entry.fileName}</span>}
                      </p>
                    </div>
                  </div>

                  <WaveThumb seed={i + 3} className="hidden w-24 shrink-0 md:flex" />

                  <div className="hidden w-[92px] shrink-0 lg:block">
                    <div className="label-xs">runtime</div>
                    <div className="font-mono text-[12.5px] text-chalk/85 tabular-nums">{entry.duration ? tc(entry.duration) : "—"}</div>
                  </div>
                  <div className="hidden w-[86px] shrink-0 lg:block">
                    <div className="label-xs">cues</div>
                    <div className="font-mono text-[12.5px] text-chalk/85 tabular-nums">{formatNumber(entry.segmentCount)}</div>
                  </div>
                  <div className="hidden w-[92px] shrink-0 xl:block">
                    <div className="label-xs">words</div>
                    <div className="font-mono text-[12.5px] text-chalk/85 tabular-nums">{formatNumber(entry.wordCount)}</div>
                  </div>
                  <div className="hidden w-[110px] shrink-0 xl:block">
                    <div className="label-xs">speakers</div>
                    <div className="flex gap-1">
                      {entry.speakers.length ? (
                        entry.speakers.slice(0, 4).map((s) => (
                          <span key={s} className="rounded-[2px] border border-line bg-white/[.04] px-1 font-mono text-[10px] text-muted">
                            {displaySpeaker(s)}
                          </span>
                        ))
                      ) : (
                        <span className="font-mono text-[11px] text-dim">—</span>
                      )}
                    </div>
                  </div>

                  <div className="flex w-[124px] shrink-0 items-center gap-2">
                    <StatusDot status={entry.status} />
                    <span className="font-mono text-[10px] uppercase tracking-[.12em] text-muted">{active ? job?.phase : entry.status}</span>
                  </div>

                  <div className="hidden w-[86px] shrink-0 text-right sm:block">
                    <div className="font-mono text-[10.5px] text-dim">{formatRelative(entry.addedAt)}</div>
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                    <IconButton
                      label={entry.starred ? "Unpin" : "Pin"}
                      onClick={() => onToggleStar(entry.videoId)}
                      className={cn(entry.starred && "text-cue")}
                    >
                      <IconStar className={cn("h-3.5 w-3.5", entry.starred && "fill-cue/30")} />
                    </IconButton>
                    <IconButton label="Refresh transcript" onClick={() => onRefresh(entry.videoId)} disabled={!ready || busy}>
                      <IconRefresh className={cn("h-3.5 w-3.5", busy && "animate-spin text-cue")} />
                    </IconButton>
                    <IconButton label="Remove from library" onClick={() => setConfirmId(entry.videoId)}>
                      <IconTrash className="h-3.5 w-3.5" />
                    </IconButton>
                  </div>
                </div>

                {active && (
                  <div className="px-5 pb-3">
                    <div className="relative h-[3px] overflow-hidden rounded-full bg-ink-600">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-cue transition-[width] duration-500"
                        style={{ width: `${Math.round((job?.jobProgress ?? job?.uploadProgress ?? 0.08) * 100)}%` }}
                      />
                      <div className="absolute inset-y-0 w-1/4 animate-scan bg-gradient-to-r from-transparent via-cue/60 to-transparent" />
                    </div>
                    <p className="mt-1.5 font-mono text-[10.5px] text-dim">
                      {job?.stage ?? "polling job"} · {job?.attempts ?? 0} polls
                    </p>
                  </div>
                )}

                {entry.status === "failed" && entry.error && (
                  <div className="flex items-start gap-2 border-t border-coral/20 bg-coral/[.06] px-5 py-2">
                    <IconAlert className="mt-px h-3.5 w-3.5 shrink-0 text-coral" />
                    <p className="text-[11.5px] leading-relaxed text-coral/90">{entry.error}</p>
                  </div>
                )}

                {confirmId === entry.videoId && (
                  <div className="absolute inset-0 z-10 flex items-center justify-between gap-3 bg-ink-850/97 px-5 backdrop-blur-[2px]">
                    <p className="text-[12.5px] text-chalk">
                      Remove <span className="font-semibold">{entry.title}</span> from this browser's library? The server copy is untouched.
                    </p>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
                        Keep
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        icon={<IconTrash className="h-3 w-3" />}
                        onClick={() => {
                          onRemove(entry.videoId);
                          setConfirmId(null);
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {entries.length > 0 && (
        <p className="flex items-center gap-2 text-[11.5px] text-dim">
          <Chip tone={STATUS_TONE.completed}>cached</Chip>
          Transcripts already fetched are stored in this browser, so opening them again needs no request.
        </p>
      )}
    </div>
  );
}
