import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import { ApiError, getVideo, pollJob, probeConnection, setRequestLogger, uploadVideo, type ProbeResult } from "@/lib/api";
import { formatBytes, formatDuration } from "@/lib/format";
import { useHotkeys, useNow } from "@/lib/hooks";
import { loadCache, loadHistory, loadLibrary, loadSettings, pushHistory, saveCache, saveLibrary, saveSettings, type CachedVideo } from "@/lib/storage";
import type { LibraryEntry, RequestLogEntry, Settings, TrackedJob, UploadMeta, VideoRecord } from "@/lib/types";
import { Ambient, Equaliser } from "@/components/Ambient";
import { ConnectionDrawer } from "@/components/ConnectionDrawer";
import { IconLibrary, IconSearch, IconUpload, IconClose, IconAlert, IconCue } from "@/components/Icons";
import { IngestView } from "@/components/IngestView";
import { LibraryView } from "@/components/LibraryView";
import { SearchView } from "@/components/SearchView";
import { VideoDetail } from "@/components/VideoDetail";
import { ToastProvider, useToast } from "@/components/Toasts";
import { Button, Chip, Kbd, StatusDot } from "@/components/ui";

type ViewName = "ingest" | "library" | "search" | "video";

const NAV: Array<{ key: ViewName; label: string; hint: string; icon: (p: { className?: string }) => React.ReactElement }> = [
  { key: "ingest", label: "Ingest", hint: "Upload & watch jobs", icon: IconUpload },
  { key: "library", label: "Library", hint: "Indexed transcripts", icon: IconLibrary },
  { key: "search", label: "Search", hint: "Timestamped results", icon: IconSearch },
];

function Logo() {
  return (
    <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] border border-cue/40 bg-gradient-to-b from-cue/25 to-cue/[.04]">
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-cue" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
        <path d="M5 4.5v15" />
        <path d="M9.8 8.6v6.8l5.8-3.4z" fill="currentColor" stroke="none" />
        <path d="M19.4 4.5v15" strokeDasharray="1.6 3" opacity=".75" />
      </svg>
      <span className="absolute -right-px -top-px h-1.5 w-1.5 rounded-full bg-cue shadow-[0_0_10px_2px_rgba(255,177,60,.6)]" />
    </span>
  );
}

function Console() {
  const toast = useToast();
  const now = useNow(20_000);

  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [probing, setProbing] = useState(false);
  const [drawer, setDrawer] = useState(false);

  const [library, setLibrary] = useState<LibraryEntry[]>(() => loadLibrary());
  const [jobs, setJobs] = useState<TrackedJob[]>([]);
  const [videos, setVideos] = useState<Record<string, VideoRecord>>(() => {
    const cache = loadCache();
    const out: Record<string, VideoRecord> = {};
    for (const [id, c] of Object.entries(cache)) {
      out[id] = {
        id: c.videoId,
        title: c.title,
        language: c.language,
        duration: c.duration,
        status: "completed",
        createdAt: null,
        segments: c.segments,
        speakers: c.speakers,
        wordCount: c.wordCount,
        shape: [],
        fetchedAt: c.savedAt,
        raw: { cached: true, title: c.title },
      };
    }
    return out;
  });
  const [videoErrors, setVideoErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [log, setLog] = useState<RequestLogEntry[]>([]);
  const [history, setHistory] = useState<string[]>(() => loadHistory());

  const [view, setView] = useState<ViewName>("ingest");
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ time: number | null; query: string | null } | null>(null);
  const [searchSeed, setSearchSeed] = useState<{ q: string; videoId: string | null; nonce: number }>({ q: "", videoId: null, nonce: 0 });
  const [media, setMedia] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState(false);

  const aborters = useRef<Map<string, AbortController>>(new Map());
  const logId = useRef(0);
  const resumed = useRef(false);
  const dragDepth = useRef(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const ready = !!settings.baseUrl.trim() && !!settings.apiKey.trim();
  const host = useMemo(() => {
    try {
      return new URL(settings.baseUrl.startsWith("http") ? settings.baseUrl : `https://${settings.baseUrl}`).host;
    } catch {
      return settings.baseUrl || null;
    }
  }, [settings.baseUrl]);

  /* ------------------------------ request trace ----------------------------- */
  useEffect(() => {
    setRequestLogger((entry) => {
      logId.current += 1;
      setLog((prev) => [{ id: logId.current, ...entry }, ...prev].slice(0, 60));
    });
    return () => setRequestLogger(null);
  }, []);

  /* -------------------------------- persistence ------------------------------ */
  useEffect(() => saveSettings(settings), [settings]);
  useEffect(() => saveLibrary(library), [library]);
  useEffect(() => {
    const cache: Record<string, CachedVideo> = {};
    for (const [id, v] of Object.entries(videos)) {
      if (!v.segments.length) continue;
      cache[id] = {
        videoId: v.id,
        title: v.title,
        language: v.language,
        duration: v.duration,
        wordCount: v.wordCount,
        speakers: v.speakers,
        savedAt: v.fetchedAt,
        segments: v.segments,
      };
    }
    saveCache(cache);
  }, [videos]);

  /* -------------------------------- connection ------------------------------- */
  useEffect(() => {
    if (!ready) {
      setProbe(null);
      return;
    }
    let alive = true;
    setProbing(true);
    void probeConnection(settings).then((r) => {
      if (!alive) return;
      setProbe(r);
      setProbing(false);
    });
    return () => {
      alive = false;
    };
  }, [settings, ready]);

  /* --------------------------------- registry -------------------------------- */
  const upsertEntry = useCallback((videoId: string, patch: Partial<LibraryEntry>) => {
    setLibrary((prev) => {
      const existing = prev.find((e) => e.videoId === videoId);
      if (existing) {
        return prev.map((e) => (e.videoId === videoId ? { ...e, ...patch, updatedAt: Date.now() } : e));
      }
      const entry: LibraryEntry = {
        videoId,
        jobId: null,
        title: videoId,
        language: null,
        numSpeakers: null,
        status: "unknown",
        addedAt: Date.now(),
        updatedAt: Date.now(),
        duration: null,
        segmentCount: null,
        wordCount: null,
        speakers: [],
        mediaUrl: null,
        fileName: null,
        fileSize: null,
        error: null,
        starred: false,
        ...patch,
      };
      return [entry, ...prev];
    });
  }, []);

  const updateJob = useCallback((key: string, patch: Partial<TrackedJob>) => {
    setJobs((prev) => prev.map((j) => (j.key === key ? { ...j, ...patch, updatedAt: Date.now() } : j)));
  }, []);

  /* --------------------------------- fetching -------------------------------- */
  const fetchVideo = useCallback(
    async (videoId: string, opts: { force?: boolean; silent?: boolean } = {}) => {
      if (!settingsRef.current.baseUrl || !settingsRef.current.apiKey) return null;
      if (!opts.force && videos[videoId]?.segments.length) return videos[videoId];
      setBusy((prev) => new Set(prev).add(videoId));
      setVideoErrors((prev) => {
        const next = { ...prev };
        delete next[videoId];
        return next;
      });
      try {
        const record = await getVideo(settingsRef.current, videoId);
        setVideos((prev) => ({ ...prev, [videoId]: record }));
        upsertEntry(videoId, {
          title: record.title || videoId,
          language: record.language,
          duration: record.duration,
          segmentCount: record.segments.length,
          wordCount: record.wordCount,
          speakers: record.speakers,
          status: record.segments.length ? "completed" : (record.status === "unknown" ? "completed" : record.status),
          error: null,
        });
        return record;
      } catch (err) {
        const message = err instanceof ApiError ? err.message : String(err);
        setVideoErrors((prev) => ({ ...prev, [videoId]: message }));
        upsertEntry(videoId, { status: err instanceof ApiError && err.status === 404 ? "failed" : "unknown", error: message });
        if (!opts.silent) toast({ tone: "error", title: "Could not load video", body: message });
        return null;
      } finally {
        setBusy((prev) => {
          const next = new Set(prev);
          next.delete(videoId);
          return next;
        });
      }
    },
    [videos, upsertEntry, toast],
  );

  /* ---------------------------------- pipeline ------------------------------- */
  const watchJob = useCallback(
    async (key: string, jobId: string, videoId: string | null, signal: AbortSignal) => {
      try {
        const final = await pollJob(settingsRef.current, jobId, {
          signal,
          intervalMs: 2200,
          onTick: (job, attempt) => {
            updateJob(key, {
              jobId,
              videoId: job.videoId ?? videoId,
              phase: job.status === "queued" ? "queued" : job.status === "processing" ? "processing" : job.status === "completed" ? "completed" : job.status === "failed" ? "failed" : "processing",
              jobProgress: job.progress,
              stage: job.stage ?? job.status,
              attempts: attempt,
              job,
              error: job.error,
            });
            if (job.videoId && !videoId) {
              upsertEntry(job.videoId, { jobId, status: job.status === "completed" ? "completed" : "processing" });
            }
          },
        });

        const resolvedId = final.videoId ?? videoId;
        if (final.status === "completed") {
          if (resolvedId) {
            updateJob(key, { phase: "completed", jobProgress: 1, videoId: resolvedId, finishedAt: Date.now(), stage: "fetching transcript" });
            const record = await fetchVideo(resolvedId, { force: true });
            updateJob(key, { stage: record?.segments.length ? `${record.segments.length} cues indexed` : "completed" });
            toast({
              tone: "success",
              title: "Transcript ready",
              body: `${record?.title ?? resolvedId} · ${record?.segments.length ?? 0} timestamped cues`,
              action: { label: "Open transcript", onClick: () => openVideo(resolvedId) },
            });
          } else {
            updateJob(key, { phase: "completed", jobProgress: 1, finishedAt: Date.now() });
            toast({ tone: "warn", title: "Job completed without a video id", body: "Add the id manually from the Library tab to read it." });
          }
        } else {
          updateJob(key, { phase: "failed", error: final.error ?? "The job reported failure.", finishedAt: Date.now() });
          if (resolvedId) upsertEntry(resolvedId, { status: "failed", error: final.error ?? "Job failed." });
          toast({ tone: "error", title: "Transcription failed", body: final.error ?? `Job ${jobId} reported failure.` });
        }
      } catch (err) {
        if (err instanceof ApiError && err.kind === "abort") {
          updateJob(key, { phase: "cancelled", stage: "cancelled by you" });
          return;
        }
        const message = err instanceof ApiError ? err.message : String(err);
        updateJob(key, { phase: "failed", error: message, finishedAt: Date.now() });
        if (videoId) upsertEntry(videoId, { error: message });
        toast({ tone: "error", title: "Lost track of the job", body: message });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [updateJob, upsertEntry, fetchVideo, toast],
  );

  const openVideo = useCallback((videoId: string) => {
    setActiveVideoId(videoId);
    setView("video");
    setFocus(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleUpload = useCallback(
    async (file: File, meta: UploadMeta) => {
      if (!ready) {
        setDrawer(true);
        toast({ tone: "warn", title: "Connect the API first" });
        return;
      }
      const key = `up-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const controller = new AbortController();
      aborters.current.set(key, controller);

      const title = meta.title?.trim() || file.name.replace(/\.[^.]+$/, "");
      const tracked: TrackedJob = {
        key,
        jobId: null,
        videoId: null,
        title,
        fileName: file.name,
        fileSize: file.size,
        mediaDuration: meta.mediaDuration ?? null,
        phase: "uploading",
        uploadProgress: 0,
        jobProgress: null,
        stage: "opening connection",
        error: null,
        startedAt: Date.now(),
        updatedAt: Date.now(),
        finishedAt: null,
        attempts: 0,
        meta,
        job: null,
      };
      setJobs((prev) => [tracked, ...prev].slice(0, 12));
      setView("ingest");

      try {
        const receipt = await uploadVideo(
          settings,
          { file, title: meta.title, language: meta.language, numSpeakers: meta.numSpeakers },
          {
            signal: controller.signal,
            onProgress: (loaded, total) =>
              updateJob(key, {
                uploadProgress: total ? loaded / total : null,
                stage: `${formatBytes(loaded)}${total ? ` of ${formatBytes(total)}` : " sent"}`,
              }),
          },
        );

        const videoId = receipt.videoId;
        const jobId = receipt.jobId;
        updateJob(key, {
          phase: "queued",
          uploadProgress: 1,
          videoId,
          jobId,
          stage: receipt.message ?? (jobId ? `queued · ${jobId.slice(0, 12)}` : "accepted"),
        });

        if (videoId) {
          upsertEntry(videoId, {
            jobId,
            title,
            language: meta.language,
            numSpeakers: meta.numSpeakers,
            status: "queued",
            fileName: file.name,
            fileSize: file.size,
          });
        }

        toast({
          tone: "success",
          title: "Upload accepted (202)",
          body: jobId ? `Watching job ${jobId.slice(0, 16)}…` : videoId ? `Video ${videoId.slice(0, 16)} registered.` : "No job id returned — check the raw payload.",
        });

        if (jobId) {
          await watchJob(key, jobId, videoId, controller.signal);
        } else if (videoId) {
          const record = await fetchVideo(videoId, { force: true, silent: true });
          updateJob(key, { phase: record ? "completed" : "failed", finishedAt: Date.now(), jobProgress: 1 });
        } else {
          updateJob(key, {
            phase: "failed",
            error: "The server accepted the upload but returned neither job_id nor video_id. Inspect the raw response in the request trace.",
            finishedAt: Date.now(),
          });
        }
      } catch (err) {
        if (err instanceof ApiError && err.kind === "abort") {
          updateJob(key, { phase: "cancelled", stage: "cancelled by you", finishedAt: Date.now() });
          toast({ tone: "info", title: "Upload cancelled" });
        } else {
          const message = err instanceof ApiError ? err.message : String(err);
          updateJob(key, { phase: "failed", error: message, finishedAt: Date.now() });
          toast({ tone: "error", title: "Upload failed", body: message });
        }
      } finally {
        aborters.current.delete(key);
      }
    },
    [ready, settings, updateJob, upsertEntry, watchJob, fetchVideo, toast],
  );

  const cancelJob = useCallback(
    (key: string) => {
      aborters.current.get(key)?.abort();
      updateJob(key, { phase: "cancelled", stage: "cancelled by you", finishedAt: Date.now() });
    },
    [updateJob],
  );

  const resumeJob = useCallback(
    (job: TrackedJob) => {
      if (!job.jobId || !ready) return;
      const controller = new AbortController();
      aborters.current.set(job.key, controller);
      updateJob(job.key, { phase: "queued", error: null, stage: "resuming poll" });
      void watchJob(job.key, job.jobId, job.videoId, controller.signal);
    },
    [ready, updateJob, watchJob],
  );

  // Resume watching jobs that were still running when the page was closed.
  useEffect(() => {
    if (resumed.current || !ready) return;
    resumed.current = true;
    const pending = library.filter((e) => e.jobId && (e.status === "processing" || e.status === "queued"));
    for (const entry of pending) {
      const key = `resume-${entry.videoId}`;
      const controller = new AbortController();
      aborters.current.set(key, controller);
      setJobs((prev) => [
        {
          key,
          jobId: entry.jobId,
          videoId: entry.videoId,
          title: entry.title,
          fileName: entry.fileName,
          fileSize: entry.fileSize,
          mediaDuration: null,
          phase: "queued",
          uploadProgress: 1,
          jobProgress: null,
          stage: "resumed from a previous session",
          error: null,
          startedAt: Date.now(),
          updatedAt: Date.now(),
          finishedAt: null,
          attempts: 0,
          meta: { title: entry.title, language: entry.language, numSpeakers: entry.numSpeakers },
          job: null,
        },
        ...prev,
      ]);
      void watchJob(key, entry.jobId!, entry.videoId, controller.signal);
    }
    if (pending.length) toast({ tone: "info", title: `Resumed ${pending.length} unfinished job${pending.length > 1 ? "s" : ""}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  /* ---------------------------------- actions -------------------------------- */
  const addById = useCallback(
    async (videoId: string) => {
      const record = await fetchVideo(videoId, { force: true });
      if (record) {
        openVideo(videoId);
        toast({ tone: "success", title: "Video fetched", body: `${record.segments.length} cues · ${record.title}` });
      }
    },
    [fetchVideo, openVideo, toast],
  );

  const removeEntry = useCallback(
    (videoId: string) => {
      setLibrary((prev) => prev.filter((e) => e.videoId !== videoId));
      setVideos((prev) => {
        const next = { ...prev };
        delete next[videoId];
        return next;
      });
      setMedia((prev) => {
        if (prev[videoId]) URL.revokeObjectURL(prev[videoId]);
        const next = { ...prev };
        delete next[videoId];
        return next;
      });
      if (activeVideoId === videoId) {
        setActiveVideoId(null);
        setView("library");
      }
      toast({ tone: "info", title: "Removed from library", body: "The server-side video and transcript are untouched." });
    },
    [activeVideoId, toast],
  );

  const toggleStar = useCallback((videoId: string) => {
    setLibrary((prev) => prev.map((e) => (e.videoId === videoId ? { ...e, starred: !e.starred } : e)));
  }, []);

  const attachMedia = useCallback(
    (videoId: string, file: File) => {
      const url = URL.createObjectURL(file);
      setMedia((prev) => {
        if (prev[videoId]) URL.revokeObjectURL(prev[videoId]);
        return { ...prev, [videoId]: url };
      });
      upsertEntry(videoId, { fileName: file.name, fileSize: file.size });
      toast({ tone: "success", title: "Media attached", body: `${file.name} · playback stays in this tab` });
    },
    [upsertEntry, toast],
  );

  const jumpTo = useCallback(
    (videoId: string, time: number | null, query: string) => {
      setActiveVideoId(videoId);
      setView("video");
      setFocus({ time, query });
      if (!videos[videoId]) void fetchVideo(videoId);
    },
    [videos, fetchVideo],
  );

  const goSearch = useCallback((q = "", videoId: string | null = null) => {
    setSearchSeed((s) => ({ q, videoId, nonce: s.nonce + 1 }));
    setView("search");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  /* ------------------------------ global drag/drop ---------------------------- */
  useEffect(() => {
    const onEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      dragDepth.current += 1;
      setDragging(true);
    };
    const onLeave = () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const onOver = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (!file) return;
      void handleUpload(file, {
        title: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim(),
        language: null,
        numSpeakers: null,
      });
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [handleUpload]);

  /* ------------------------------- first-run nudge ------------------------------ */
  const nudged = useRef(false);
  useEffect(() => {
    if (nudged.current) return;
    nudged.current = true;
    const stored = loadSettings();
    if (!stored.baseUrl && !stored.apiKey) setDrawer(true);
  }, []);

  /* --------------------- safety net: never render a video unfetched -------------------- */
  useEffect(() => {
    if (view !== "video" || !activeVideoId) return;
    if (videos[activeVideoId] || busy.has(activeVideoId) || videoErrors[activeVideoId]) return;
    void fetchVideo(activeVideoId);
  }, [view, activeVideoId, videos, busy, videoErrors, fetchVideo]);

  /* --------------------------------- hotkeys --------------------------------- */
  useHotkeys({
    "mod+k": (e) => {
      e.preventDefault();
      goSearch();
    },
    "mod+u": (e) => {
      e.preventDefault();
      setView("ingest");
    },
    "mod+l": (e) => {
      e.preventDefault();
      setView("library");
    },
    "mod+,": (e) => {
      e.preventDefault();
      setDrawer(true);
    },
    escape: () => setDrawer(false),
  });

  useEffect(() => () => aborters.current.forEach((c) => c.abort()), []);

  const activeJobs = jobs.filter((j) => ["uploading", "queued", "processing"].includes(j.phase));
  const activeJobCount = activeJobs.length;
  const firstActive = activeJobs[activeJobs.length - 1] ?? null;
  const activeEntry = library.find((e) => e.videoId === activeVideoId) ?? null;
  const activeRecord = activeVideoId ? (videos[activeVideoId] ?? null) : null;
  const activeTracked = activeVideoId ? (jobs.find((j) => j.videoId === activeVideoId) ?? null) : null;
  const mediaUrl = activeVideoId ? (media[activeVideoId] ?? activeEntry?.mediaUrl ?? null) : null;

  const navCount: Record<ViewName, number | null> = {
    ingest: activeJobCount || null,
    library: library.length || null,
    search: null,
    video: null,
  };

  return (
    <div className="relative min-h-screen">
      <Ambient />

      {/* ---------------------------------- header --------------------------------- */}
      <header className="sticky top-0 z-50 border-b border-line bg-ink-900/82 backdrop-blur-md">
        <div className="mx-auto flex h-[58px] max-w-[1500px] items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setView("ingest")}
            className="group flex items-center gap-2.5 rounded-[3px] pr-2 text-left"
          >
            <Logo />
            <span className="hidden sm:block">
              <span className="block font-display text-[16px] font-extrabold leading-none tracking-[-0.045em] text-chalk">
                CUE<span className="font-normal text-muted">POINT</span>
                <span className="text-cue">.</span>
              </span>
              <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[.22em] text-dim transition-colors group-hover:text-cue/80">
                transcript console
              </span>
            </span>
          </button>

          <nav className="ml-2 hidden items-center gap-0.5 lg:flex">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = view === item.key || (view === "video" && item.key === "library");
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setView(item.key)}
                  className={cn(
                    "group relative flex items-center gap-2 rounded-[3px] px-3 py-1.5 transition-colors duration-150",
                    active ? "bg-white/[.06] text-chalk" : "text-muted hover:bg-white/[.035] hover:text-chalk",
                  )}
                >
                  <Icon className={cn("h-3.5 w-3.5 transition-colors", active ? "text-cue" : "text-dim group-hover:text-cue/80")} />
                  <span className="text-[13px] font-medium">{item.label}</span>
                  {navCount[item.key] ? (
                    <span
                      className={cn(
                        "ml-0.5 rounded-full px-1.5 py-px font-mono text-[9.5px] tabular-nums",
                        item.key === "ingest" ? "bg-cue/18 text-cue" : "bg-white/[.07] text-muted",
                      )}
                    >
                      {navCount[item.key]}
                    </span>
                  ) : null}
                  {active && <span className="absolute inset-x-2 -bottom-px h-px bg-cue" />}
                </button>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {activeJobCount > 0 && (
              <span className="hidden items-center gap-2 rounded-[3px] border border-cue/30 bg-cue/[.07] px-2 py-1 md:flex">
                <Equaliser bars={4} className="h-3" />
                <span className="font-mono text-[10px] uppercase tracking-[.13em] text-cue">
                  {activeJobCount} job{activeJobCount > 1 ? "s" : ""} live
                </span>
              </span>
            )}

            <button
              type="button"
              onClick={() => setDrawer(true)}
              className={cn(
                "group flex items-center gap-2 rounded-[3px] border px-2.5 py-1.5 transition-all duration-150 hover:-translate-y-px",
                ready
                  ? probe && !probe.ok
                    ? "border-coral/40 bg-coral/[.08] hover:border-coral/70"
                    : "border-line-strong bg-white/[.03] hover:border-mint/50"
                  : "border-cue/45 bg-cue/[.09] hover:border-cue",
              )}
              title="Connection settings"
            >
              {probing ? (
                <StatusDot status="processing" />
              ) : ready ? (
                <StatusDot status={probe && !probe.ok ? "failed" : "completed"} />
              ) : (
                <StatusDot status="queued" />
              )}
              <span className="hidden font-mono text-[11px] text-chalk/85 sm:block">
                {ready ? (host ?? "connected") : "not connected"}
              </span>
              {probe?.ok && (
                <span className="hidden font-mono text-[10px] text-dim tabular-nums md:block">{probe.latencyMs}ms</span>
              )}
              {!ready && <span className="font-mono text-[10px] uppercase tracking-[.13em] text-cue">connect</span>}
            </button>

            <span className="hidden items-center gap-1 xl:flex">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </span>
          </div>
        </div>

        {/* mobile nav */}
        <nav className="flex gap-0.5 overflow-x-auto border-t border-line px-3 py-1.5 lg:hidden">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = view === item.key || (view === "video" && item.key === "library");
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setView(item.key)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[.13em] transition-colors",
                  active ? "bg-cue/12 text-cue" : "text-dim",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
                {navCount[item.key] ? <span className="tabular-nums">({navCount[item.key]})</span> : null}
              </button>
            );
          })}
        </nav>
      </header>

      {/* ---------------------------------- content -------------------------------- */}
      <main className="mx-auto max-w-[1500px] px-4 pb-16 pt-6 sm:px-6">
        {view === "ingest" && (
          <IngestView
            ready={ready}
            jobs={jobs}
            log={log}
            indexedCount={library.filter((e) => e.status === "completed").length}
            onUpload={(file, meta) => void handleUpload(file, meta)}
            onCancel={cancelJob}
            onResume={resumeJob}
            onOpenSettings={() => setDrawer(true)}
            onOpenVideo={openVideo}
            onGoLibrary={() => setView("library")}
          />
        )}

        {view === "library" && (
          <LibraryView
            ready={ready}
            entries={library}
            jobs={jobs}
            busyIds={busy}
            onOpen={(id) => {
              openVideo(id);
              if (!videos[id]) void fetchVideo(id);
            }}
            onRefresh={(id) => void fetchVideo(id, { force: true })}
            onRemove={removeEntry}
            onAddById={(id) => void addById(id)}
            onToggleStar={toggleStar}
            onOpenSettings={() => setDrawer(true)}
            onGoSearch={(videoId) => goSearch("", videoId ?? null)}
          />
        )}

        {view === "search" && (
          <SearchView
            key={searchSeed.nonce}
            ready={ready}
            settings={settings}
            entries={library}
            history={history}
            initialQuery={searchSeed.q}
            initialVideoId={searchSeed.videoId}
            onJump={jumpTo}
            onOpenSettings={() => setDrawer(true)}
            onQueryRun={(q) => setHistory(pushHistory(q))}
          />
        )}

        {view === "video" && activeVideoId && (
          <VideoDetail
            ready={ready}
            entry={activeEntry}
            video={activeRecord}
            loading={!!activeVideoId && busy.has(activeVideoId)}
            error={activeVideoId ? (videoErrors[activeVideoId] ?? null) : null}
            mediaUrl={mediaUrl}
            activeJob={activeTracked}
            focus={focus}
            onBack={() => setView("library")}
            onRefresh={() => activeVideoId && void fetchVideo(activeVideoId, { force: true })}
            onRemove={() => activeVideoId && removeEntry(activeVideoId)}
            onOpenSettings={() => setDrawer(true)}
            onAttachMedia={(file) => activeVideoId && attachMedia(activeVideoId, file)}
            onSetMediaUrl={(url) => activeVideoId && upsertEntry(activeVideoId, { mediaUrl: url })}
            onSearchAll={(q) => goSearch(q, activeVideoId)}
            onFocusHandled={() => setFocus(null)}
          />
        )}

        {view === "video" && !activeVideoId && (
          <div className="panel flex flex-wrap items-center gap-3 p-5">
            <IconAlert className="h-4 w-4 text-coral" />
            <p className="flex-1 text-[13px] text-muted">That video is no longer in this browser's registry.</p>
            <Button variant="solid" onClick={() => setView("library")}>
              Back to library
            </Button>
          </div>
        )}
      </main>

      {/* ---------------------------------- footer --------------------------------- */}
      <footer className="border-t border-line bg-ink-900/50">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-4 font-mono text-[10.5px] text-dim sm:px-6">
          <span className="flex items-center gap-1.5 text-muted">
            <IconCue className="h-3.5 w-3.5 text-cue" />
            Video Transcript Search API · v1.0.0
          </span>
          {["POST /videos", "GET /jobs/{id}", "GET /videos/{id}", "GET /search"].map((ep) => (
            <span key={ep} className="transition-colors hover:text-cue">
              {ep}
            </span>
          ))}
          <span className="ml-auto flex items-center gap-2">
            {ready ? (
              <>
                <Chip tone={probe?.ok ? "mint" : "coral"}>{probe?.ok ? `${host}` : "check connection"}</Chip>
                <span>{log.length} requests this session</span>
              </>
            ) : (
              <button type="button" onClick={() => setDrawer(true)} className="text-cue underline decoration-cue/40 underline-offset-4">
                set base URL & key
              </button>
            )}
            <span className="hidden sm:inline">· {new Date(now).toLocaleTimeString("en-US", { hour12: false })}</span>
          </span>
        </div>
      </footer>

      {/* ------------------------------ drag overlay ------------------------------ */}
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[75] flex items-center justify-center bg-ink-950/80 p-8 backdrop-blur-sm">
          <div className="panel flex max-w-md flex-col items-center gap-3 border-cue/60 bg-ink-850 px-10 py-9 text-center shadow-[0_0_80px_-20px_rgba(255,177,60,.55)]">
            <span className="flex h-14 w-14 items-center justify-center rounded-[5px] border border-cue/50 bg-cue/12 text-cue">
              <IconUpload className="h-6 w-6" />
            </span>
            <p className="font-display text-[20px] font-bold tracking-[-0.02em] text-chalk">Drop to upload</p>
            <p className="text-[12.5px] text-muted">
              {ready ? "Cuepoint posts it straight to /videos and starts watching the job." : "Connect the API first — ⌘,"}
            </p>
          </div>
        </div>
      )}

      <ConnectionDrawer
        open={drawer}
        settings={settings}
        onClose={() => setDrawer(false)}
        onSave={(s) => {
          setSettings(s);
          resumed.current = false;
        }}
      />

      {/* floating job pill — keeps the pipeline visible from any view */}
      {activeJobCount > 0 && view !== "ingest" && (
        <button
          type="button"
          onClick={() => setView("ingest")}
          className="fixed bottom-4 left-4 z-[60] flex items-center gap-2.5 rounded-[4px] border border-cue/40 bg-ink-850/95 px-3 py-2 shadow-[0_18px_44px_-18px_rgba(0,0,0,.95)] backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-cue"
        >
          <Equaliser bars={4} className="h-3.5" />
          <span className="font-mono text-[10.5px] uppercase tracking-[.13em] text-cue">
            {activeJobCount} job{activeJobCount > 1 ? "s" : ""} running
          </span>
          <span className="font-mono text-[10.5px] text-dim tabular-nums">
            {firstActive ? formatDuration((Date.now() - firstActive.startedAt) / 1000) : ""}
          </span>
          <IconClose className="h-3 w-3 text-dim" />
        </button>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Console />
    </ToastProvider>
  );
}
