import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import { ApiError, search as searchApi } from "@/lib/api";
import { copyText, download, hitsToCsv } from "@/lib/exporters";
import { displaySpeaker, highlightParts, speakerColor, tc, tcPrecise } from "@/lib/format";
import type { LibraryEntry, SearchResponse, Settings } from "@/lib/types";
import { Button, Chip, EmptyState, IconButton, RawJson, SectionHead, Slider, Select, Skeleton, StatusDot } from "./ui";
import { IconAlert, IconArrowRight, IconCheck, IconClock, IconCopy, IconDownload, IconLink, IconSearch, IconSpeaker } from "./Icons";
import { useToast } from "./Toasts";

const SPEAKER_TEXT: Record<string, string> = {
  cue: "text-cue",
  mint: "text-mint",
  sky: "text-sky",
  coral: "text-coral",
  chalk: "text-chalk/80",
};

function Snippet({ text, query }: { text: string; query: string }) {
  const parts = highlightParts(text, query);
  return (
    <span className="text-[13.5px] leading-[1.75] text-chalk/88">
      {parts.map((p, i) =>
        p.hit ? (
          <mark key={i} className="mark-hit font-medium">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </span>
  );
}

export function SearchView({
  ready,
  settings,
  entries,
  history,
  initialQuery = "",
  initialVideoId = null,
  onJump,
  onOpenSettings,
  onQueryRun,
}: {
  ready: boolean;
  settings: Settings;
  entries: LibraryEntry[];
  history: string[];
  initialQuery?: string;
  initialVideoId?: string | null;
  onJump: (videoId: string, time: number | null, query: string) => void;
  onOpenSettings: () => void;
  onQueryRun: (q: string) => void;
}) {
  const [q, setQ] = useState(initialQuery);
  const [videoFilter, setVideoFilter] = useState<string>(initialVideoId ?? "");
  const [limit, setLimit] = useState(20);
  const [contextWords, setContextWords] = useState(12);
  const [live, setLive] = useState(true);
  const [grouped, setGrouped] = useState(false);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const run = useCallback(
    async (query: string, opts: { silent?: boolean } = {}) => {
      const trimmed = query.trim();
      if (!trimmed || !ready) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      if (!opts.silent) setLoading(true);
      setError(null);
      const started = performance.now();
      try {
        const res = await searchApi(
          settings,
          { q: trimmed, videoId: videoFilter || null, limit, contextWords },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setResult(res);
        setLatency(Math.round(performance.now() - started));
        onQueryRun(trimmed);
      } catch (err) {
        if (controller.signal.aborted || (err instanceof ApiError && err.kind === "abort")) return;
        const message = err instanceof ApiError ? err.message : String(err);
        setError(message);
        setResult(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [ready, settings, videoFilter, limit, contextWords, onQueryRun],
  );

  // Live (debounced) searching — aborts the previous in-flight request.
  useEffect(() => {
    if (!live || !ready) return;
    if (q.trim().length < 2) return;
    const id = setTimeout(() => void run(q), 420);
    return () => clearTimeout(id);
  }, [q, live, ready, run]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const el = document.getElementById("cue-search-input");
    if (el) el.focus();
  }, []);

  const grouped_results = useMemo(() => {
    if (!result) return [] as Array<{ key: string; title: string; videoId: string | null; hits: SearchResponse["results"] }>;
    const map = new Map<string, { title: string; videoId: string | null; hits: SearchResponse["results"] }>();
    for (const hit of result.results) {
      const key = hit.videoId ?? hit.videoTitle ?? "unknown";
      const entry = entries.find((e) => e.videoId === hit.videoId);
      const bucket = map.get(key) ?? { title: entry?.title ?? hit.videoTitle ?? hit.videoId ?? "Unattributed", videoId: hit.videoId, hits: [] };
      bucket.hits.push(hit);
      map.set(key, bucket);
    }
    return Array.from(map.entries()).map(([key, v]) => ({ key, ...v }));
  }, [result, entries]);

  const maxScore = useMemo(() => {
    if (!result) return 0;
    return Math.max(0, ...result.results.map((r) => r.score ?? 0));
  }, [result]);

  const copy = async (id: string, text: string) => {
    const ok = await copyText(text);
    setCopied(ok ? id : null);
    setTimeout(() => setCopied(null), 1600);
    if (!ok) toast({ tone: "error", title: "Clipboard blocked by the browser" });
  };

  const HitRow = ({ hit, index }: { hit: SearchResponse["results"][number]; index: number }) => {
    const scoped = !!videoFilter || grouped;
    return (
      <li
        className="group relative animate-rise"
        style={{ animationDelay: `${Math.min(index * 22, 320)}ms` }}
      >
        <span className="absolute inset-y-0 left-0 w-[2px] origin-top scale-y-0 bg-cue transition-transform duration-200 group-hover:scale-y-100" />
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3.5 pl-5 transition-colors duration-150 hover:bg-white/[.028]">
          <button
            type="button"
            onClick={() => hit.videoId && onJump(hit.videoId, hit.start, q.trim())}
            disabled={!hit.videoId}
            title={hit.videoId ? "Open the transcript at this timecode" : "No video id on this hit"}
            className={cn(
              "shrink-0 rounded-[3px] border px-2 py-1 font-mono text-[12.5px] tabular-nums transition-all duration-150",
              hit.videoId
                ? "border-cue/25 bg-cue/[.07] text-cue hover:border-cue/70 hover:bg-cue/15 active:translate-y-px"
                : "cursor-not-allowed border-line bg-white/[.02] text-dim",
            )}
          >
            {hit.start !== null ? tc(hit.start) : "--:--"}
          </button>

          <div className="min-w-[260px] flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              {hit.speaker && (
                <span className={cn("font-mono text-[10px] uppercase tracking-[.13em]", SPEAKER_TEXT[speakerColor(hit.speaker)] ?? "text-muted")}>
                  <IconSpeaker className="mr-1 inline h-2.5 w-2.5" />
                  {displaySpeaker(hit.speaker)}
                </span>
              )}
              {!scoped && hit.videoId && (
                <Chip tone="dim" className="max-w-[220px] truncate normal-case tracking-normal">
                  {entries.find((e) => e.videoId === hit.videoId)?.title ?? hit.videoTitle ?? hit.videoId.slice(0, 12)}
                </Chip>
              )}
              {hit.end !== null && hit.start !== null && hit.end - hit.start > 0 && (
                <span className="font-mono text-[10px] text-dim">{(hit.end - hit.start).toFixed(1)}s</span>
              )}
              {hit.score !== null && (
                <span className="ml-auto flex items-center gap-1.5" title={`Relevance ${hit.score}`}>
                  <span className="h-[3px] w-14 overflow-hidden rounded-full bg-ink-600">
                    <span
                      className="block h-full rounded-full bg-mint transition-[width] duration-500"
                      style={{ width: `${maxScore ? Math.max(6, (hit.score / maxScore) * 100) : 50}%` }}
                    />
                  </span>
                  <span className="font-mono text-[10px] text-dim tabular-nums">{hit.score.toFixed(3).replace(/0+$/, "")}</span>
                </span>
              )}
            </div>

            {(hit.before || hit.after) && (
              <p className="mb-1 font-mono text-[10px] uppercase tracking-[.13em] text-dim">
                {hit.before ? "± context returned by the API" : "context"}
              </p>
            )}
            <p className="break-words">
              {hit.before && <span className="text-[13px] text-dim">{hit.before} </span>}
              <Snippet text={hit.text} query={q.trim()} />
              {hit.after && <span className="text-[13px] text-dim"> {hit.after}</span>}
            </p>
            <p className="mt-1 font-mono text-[10.5px] text-dim tabular-nums opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              {hit.start !== null ? tcPrecise(hit.start) : "no timestamp"}
              {hit.end !== null ? ` → ${tcPrecise(hit.end)}` : ""}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <IconButton label="Copy line" onClick={() => void copy(hit.id, hit.text)}>
              {copied === hit.id ? <IconCheck className="h-3.5 w-3.5 text-mint" /> : <IconCopy className="h-3.5 w-3.5" />}
            </IconButton>
            <IconButton
              label="Copy timecode"
              disabled={hit.start === null}
              onClick={() => hit.start !== null && void copy(`${hit.id}-tc`, tcPrecise(hit.start))}
            >
              <IconClock className="h-3.5 w-3.5" />
            </IconButton>
            {hit.videoId && (
              <IconButton label="Open in transcript" onClick={() => onJump(hit.videoId!, hit.start, q.trim())} className="hover:text-cue">
                <IconArrowRight className="h-3.5 w-3.5" />
              </IconButton>
            )}
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-5">
      <SectionHead
        eyebrow="Search · GET /search"
        title="Find the moment, not the file"
        sub="Full-text across every indexed transcript. Each hit carries the timecode it was spoken at, the speaker, and exactly as much surrounding context as you ask for."
        right={
          result && result.results.length > 0 ? (
            <Button
              variant="solid"
              icon={<IconDownload className="h-3.5 w-3.5" />}
              onClick={() => {
                download(`cuepoint-search-${q.trim().replace(/\W+/g, "-").slice(0, 30) || "results"}.csv`, hitsToCsv(result.results, q.trim()), "text/csv;charset=utf-8");
                toast({ tone: "success", title: "CSV exported", body: `${result.results.length} hits with timecodes.` });
              }}
            >
              Export CSV
            </Button>
          ) : undefined
        }
      />

      {/* --------------------------------- query bar -------------------------------- */}
      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 p-3">
          <div className="relative min-w-[260px] flex-1">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cue" />
            <input
              id="cue-search-input"
              ref={inputRef}
              value={q}
              disabled={!ready}
              maxLength={300}
              placeholder={ready ? "Search every transcript — try a name, a phrase, a topic…" : "Connect the API to search"}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void run(q);
                }
                if (e.key === "Escape") setQ("");
              }}
              className={cn(
                "h-11 w-full rounded-[3px] border border-line-strong bg-ink-900/85 pl-10 pr-24 font-sans text-[15px] text-chalk placeholder:text-dim/70",
                "transition-colors duration-150 hover:border-ink-400 focus:border-cue/70 focus:outline-none focus:ring-2 focus:ring-cue/15",
              )}
            />
            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
              {loading && <StatusDot status="processing" />}
              {q.length > 0 && (
                <span className="font-mono text-[10px] text-dim tabular-nums">{q.length}/300</span>
              )}
              <button
                type="button"
                onClick={() => void run(q)}
                disabled={!q.trim() || !ready || loading}
                className="rounded-[3px] border border-cue/40 bg-cue/12 px-2 py-1 font-mono text-[10px] uppercase tracking-[.13em] text-cue transition-colors hover:bg-cue/20 disabled:opacity-35"
              >
                run
              </button>
            </div>
          </div>

          <Select value={videoFilter} onChange={(e) => setVideoFilter(e.target.value)} className="w-[190px]">
            <option value="">All videos</option>
            {entries.map((e) => (
              <option key={e.videoId} value={e.videoId}>
                {e.title.slice(0, 28)}
              </option>
            ))}
          </Select>

          <button
            type="button"
            onClick={() => setLive((l) => !l)}
            className={cn(
              "flex h-9 items-center gap-2 rounded-[3px] border px-2.5 font-mono text-[10px] uppercase tracking-[.13em] transition-colors",
              live ? "border-mint/40 bg-mint/10 text-mint" : "border-line text-dim hover:text-muted",
            )}
            title="Search as you type (debounced, previous requests aborted)"
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", live ? "bg-mint animate-pulse-ring" : "bg-dim")} />
            live
          </button>
        </div>

        <div className="grid gap-4 border-t border-line px-3 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Slider label="limit" min={1} max={100} value={limit} onChange={setLimit} />
          <Slider label="context_words" min={0} max={50} value={contextWords} onChange={setContextWords} />
          <div className="flex items-end gap-3 pb-1">
            <span className="font-mono text-[10px] leading-relaxed text-dim">
              GET /search?q={q.trim() ? encodeURIComponent(q.trim()).slice(0, 22) : "…"}
              {videoFilter ? `&video_id=${videoFilter.slice(0, 8)}…` : ""}
              &limit={limit}&context_words={contextWords}
            </span>
          </div>
        </div>
      </div>

      {!ready && (
        <EmptyState
          icon={<IconLink className="h-5 w-5" />}
          title="Search needs a connection"
          body="Point Cuepoint at your deployment — base URL plus X-API-Key — and results will stream in as you type."
          action={
            <Button variant="primary" onClick={onOpenSettings}>
              Enter credentials
            </Button>
          }
        />
      )}

      {ready && !result && !loading && !error && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
          <EmptyState
            icon={<IconSearch className="h-5 w-5" />}
            title="Ask the archive a question"
            body={
              <>
                Results come back as timestamped cues, ranked by the server. Click any timecode to land on that exact moment in the
                transcript — with playback if you attach the media.
              </>
            }
            action={
              <div className="mt-1 flex flex-wrap gap-1.5">
                {["budget", "next quarter", "roadmap", "customer", "deadline", "why"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setQ(s);
                      void run(s);
                    }}
                    className="rounded-[3px] border border-line px-2 py-1 font-mono text-[10.5px] text-muted transition-all duration-150 hover:-translate-y-px hover:border-cue/50 hover:text-cue"
                  >
                    {s}
                  </button>
                ))}
              </div>
            }
          />
          <div className="panel p-4">
            <p className="label-xs mb-2.5">Recent queries</p>
            {history.length === 0 ? (
              <p className="text-[12px] leading-relaxed text-dim">Your last twelve searches are kept in this browser only.</p>
            ) : (
              <ul className="space-y-1">
                {history.map((h) => (
                  <li key={h}>
                    <button
                      type="button"
                      onClick={() => {
                        setQ(h);
                        void run(h);
                      }}
                      className="group flex w-full items-center gap-2 rounded-[3px] px-2 py-1.5 text-left transition-colors hover:bg-white/[.04]"
                    >
                      <IconClock className="h-3 w-3 shrink-0 text-dim transition-colors group-hover:text-cue" />
                      <span className="truncate text-[12.5px] text-muted transition-colors group-hover:text-chalk">{h}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {loading && !result && (
        <div className="panel space-y-3 p-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-7 w-16 shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="panel border-coral/35 p-4">
          <div className="flex items-start gap-3">
            <IconAlert className="mt-0.5 h-4 w-4 shrink-0 text-coral" />
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-[15px] font-semibold text-chalk">Search failed</h3>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{error}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="solid" onClick={() => void run(q)}>
                  Retry
                </Button>
                <Button size="sm" variant="ghost" onClick={onOpenSettings}>
                  Check connection
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h3 className="font-display text-[15px] font-semibold tracking-[-0.01em] text-chalk">
              <span className="text-cue tabular-nums">{result.results.length}</span>{" "}
              <span className="text-muted">
                {result.results.length === 1 ? "cue" : "cues"} for “{q.trim()}”
              </span>
            </h3>
            {result.total !== null && result.total !== result.results.length && (
              <Chip tone="dim">{result.total} total matches</Chip>
            )}
            {latency !== null && <Chip tone={latency > 800 ? "cue" : "mint"}>{latency} ms</Chip>}
            {result.tookMs !== null && <Chip tone="dim">server {Math.round(result.tookMs)} ms</Chip>}
            <div className="ml-auto flex items-center gap-1.5">
              <span className="label-xs">group by video</span>
              <button
                type="button"
                onClick={() => setGrouped((g) => !g)}
                className={cn(
                  "relative h-[18px] w-[34px] rounded-full border transition-colors duration-200",
                  grouped ? "border-cue/50 bg-cue/25" : "border-line-strong bg-ink-700",
                )}
                aria-pressed={grouped}
                aria-label="Group results by video"
              >
                <span
                  className={cn(
                    "absolute top-[2px] h-[12px] w-[12px] rounded-full transition-all duration-200",
                    grouped ? "left-[19px] bg-cue" : "left-[2px] bg-dim",
                  )}
                />
              </button>
            </div>
          </div>

          {result.results.length === 0 ? (
            <EmptyState
              icon={<IconSearch className="h-5 w-5" />}
              title={`No cues match “${q.trim()}”`}
              body={
                <ul className="space-y-1">
                  <li>· Try a shorter or stemmed term — “budget” rather than “budgeting the quarter”.</li>
                  <li>· Raise <code className="font-mono text-cue/90">context_words</code> if the server matches on surrounding words.</li>
                  {videoFilter && <li>· You are scoped to one video — switch back to “All videos”.</li>}
                  <li>· Transcription spelling of names and jargon can differ from what you typed.</li>
                </ul>
              }
            />
          ) : grouped ? (
            <div className="space-y-4">
              {grouped_results.map((group) => (
                <section key={group.key}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="h-px flex-1 bg-line" />
                    <button
                      type="button"
                      onClick={() => group.videoId && onJump(group.videoId, group.hits[0]?.start ?? null, q.trim())}
                      className="font-display text-[13px] font-semibold text-chalk transition-colors hover:text-cue"
                    >
                      {group.title}
                    </button>
                    <Chip tone="cue">{group.hits.length}</Chip>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                  <ul className="panel divide-y divide-line overflow-hidden">
                    {group.hits.map((hit, i) => (
                      <HitRow key={hit.id} hit={hit} index={i} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <ul className="panel divide-y divide-line overflow-hidden">
              {result.results.map((hit, i) => (
                <HitRow key={hit.id} hit={hit} index={i} />
              ))}
            </ul>
          )}

          <RawJson data={result.raw} label="Raw /search payload" />
        </div>
      )}
    </div>
  );
}
