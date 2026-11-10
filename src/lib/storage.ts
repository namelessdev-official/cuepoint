import type { LibraryEntry, Settings, VideoRecord } from "./types";

const SETTINGS_KEY = "cuepoint.settings.v1";
const LIBRARY_KEY = "cuepoint.library.v1";
const CACHE_KEY = "cuepoint.cache.v1";
const HISTORY_KEY = "cuepoint.history.v1";

export interface CachedVideo {
  videoId: string;
  title: string;
  language: string | null;
  duration: number | null;
  wordCount: number;
  speakers: string[];
  savedAt: number;
  segments: VideoRecord["segments"];
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------- Settings ------------------------------- */

export function loadSettings(): Settings {
  const s = read<Partial<Settings>>(SETTINGS_KEY, {});
  return { baseUrl: typeof s.baseUrl === "string" ? s.baseUrl : "", apiKey: typeof s.apiKey === "string" ? s.apiKey : "" };
}

export function saveSettings(s: Settings): void {
  write(SETTINGS_KEY, s);
}

/* ------------------------------- Library ------------------------------- */

const NUM = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function loadLibrary(): LibraryEntry[] {
  const raw = read<unknown>(LIBRARY_KEY, []);
  if (!Array.isArray(raw)) return [];
  const out: LibraryEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const e = item as Partial<LibraryEntry>;
    if (typeof e.videoId !== "string" || !e.videoId) continue;
    out.push({
      videoId: e.videoId,
      jobId: typeof e.jobId === "string" ? e.jobId : null,
      title: typeof e.title === "string" && e.title ? e.title : e.videoId,
      language: typeof e.language === "string" ? e.language : null,
      numSpeakers: NUM(e.numSpeakers),
      status: (["queued", "processing", "completed", "failed", "unknown"].includes(String(e.status))
        ? e.status
        : "unknown") as LibraryEntry["status"],
      addedAt: NUM(e.addedAt) ?? Date.now(),
      updatedAt: NUM(e.updatedAt) ?? Date.now(),
      duration: NUM(e.duration),
      segmentCount: NUM(e.segmentCount),
      wordCount: NUM(e.wordCount),
      speakers: Array.isArray(e.speakers) ? e.speakers.filter((s): s is string => typeof s === "string") : [],
      mediaUrl: typeof e.mediaUrl === "string" && !e.mediaUrl.startsWith("blob:") ? e.mediaUrl : null,
      fileName: typeof e.fileName === "string" ? e.fileName : null,
      fileSize: NUM(e.fileSize),
      error: typeof e.error === "string" ? e.error : null,
      starred: e.starred === true,
    });
  }
  return out.sort((a, b) => b.addedAt - a.addedAt);
}

export function saveLibrary(entries: LibraryEntry[]): void {
  write(LIBRARY_KEY, entries);
}

/* --------------------------- Transcript cache --------------------------- */

export function loadCache(): Record<string, CachedVideo> {
  const raw = read<Record<string, CachedVideo>>(CACHE_KEY, {});
  return raw && typeof raw === "object" ? raw : {};
}

/** Persists transcripts (minus raw payloads). Prunes oldest entries on quota errors. */
export function saveCache(cache: Record<string, CachedVideo>): void {
  const strip = (c: Record<string, CachedVideo>) =>
    Object.fromEntries(
      Object.entries(c).map(([k, v]) => [
        k,
        { ...v, segments: v.segments.map(({ raw: _raw, ...rest }) => rest) },
      ]),
    );

  let snapshot = strip(cache);
  if (write(CACHE_KEY, snapshot)) return;

  // Quota exceeded → drop oldest caches until it fits.
  for (let i = 0; i < 8; i += 1) {
    const keys = Object.keys(snapshot).sort((a, b) => (snapshot[a].savedAt ?? 0) - (snapshot[b].savedAt ?? 0));
    if (!keys.length) return;
    delete snapshot[keys[0]];
    if (write(CACHE_KEY, snapshot)) return;
  }
}

/* ------------------------------ Query history ----------------------------- */

export function loadHistory(): string[] {
  const raw = read<unknown>(HISTORY_KEY, []);
  return Array.isArray(raw) ? raw.filter((q): q is string => typeof q === "string").slice(0, 12) : [];
}

export function pushHistory(query: string): string[] {
  const q = query.trim();
  if (!q) return loadHistory();
  const next = [q, ...loadHistory().filter((h) => h.toLowerCase() !== q.toLowerCase())].slice(0, 12);
  write(HISTORY_KEY, next);
  return next;
}

export function clearHistory(): void {
  write(HISTORY_KEY, []);
}
