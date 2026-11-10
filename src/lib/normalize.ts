import type {
  Job,
  JobStatus,
  SearchHit,
  SearchResponse,
  Segment,
  UploadReceipt,
  VideoRecord,
  Word,
} from "./types";

/* ------------------------------------------------------------------ *
 * Primitive helpers — the API returns unknown JSON, so everything here
 * is tolerant of snake_case / camelCase / nested-wrapped payloads.
 * ------------------------------------------------------------------ */

type Any = Record<string, unknown>;

export const isObj = (v: unknown): v is Any =>
  !!v && typeof v === "object" && !Array.isArray(v);

const normKey = (k: string) => k.toLowerCase().replace(/[-_\s.]/g, "");

/** Case/format-insensitive field lookup. */
export function field(obj: unknown, keys: string[]): unknown {
  if (!isObj(obj)) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  const map = new Map<string, string>();
  for (const k of Object.keys(obj)) map.set(normKey(k), k);
  for (const k of keys) {
    const real = map.get(normKey(k));
    if (!real) continue;
    const v = obj[real];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

/**
 * Same as `field`, but unwraps nested containers (`data`, `video`, `job`, …) up
 * to three levels deep. `wrappers` is accepted for call-site readability.
 */
export function deepField(obj: unknown, keys: string[], _wrappers: string[] = [], depth = 0): unknown {
  const direct = field(obj, keys);
  if (direct !== undefined) return direct;
  if (!isObj(obj) || depth >= 3) return undefined;
  for (const value of Object.values(obj)) {
    if (isObj(value)) {
      const found = deepField(value, keys, _wrappers, depth + 1);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/** Ids sometimes arrive as `{ video: { id } }` rather than `video_id`. */
function idOf(value: unknown): string | null {
  if (isObj(value)) return str(field(value, ["video_id", "videoId", "id", "_id"]));
  if (Array.isArray(value)) return null;
  return str(value);
}

export function str(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") return v.trim() === "" ? null : v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

export function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = v.trim().replace(/[,]/g, "");
    if (t === "") return null;
    const parsed = Number(t);
    if (Number.isFinite(parsed)) return parsed;
    const colon = toSeconds(v);
    return colon;
  }
  return null;
}

/**
 * Accepts seconds, milliseconds, or timecode strings such as
 * "00:01:23.450", "01:23,450", "1:23" and always yields seconds.
 */
export function toSeconds(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    // > 24h almost certainly means the server sent milliseconds.
    return Math.abs(v) > 86_400 ? v / 1000 : v;
  }
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  if (t.includes(":")) {
    const sign = t.startsWith("-") ? -1 : 1;
    const parts = t.replace("-", "").split(":").map((p) => Number(p.replace(",", ".")));
    if (parts.some((p) => !Number.isFinite(p))) return null;
    const secs = parts.reduce((acc, p) => acc * 60 + p, 0);
    // Same millisecond heuristic for numeric timecodes like "90000".
    return sign * (secs > 86_400 ? secs / 1000 : secs);
  }
  const n = Number(t);
  if (Number.isFinite(n)) return Math.abs(n) > 86_400 ? n / 1000 : n;
  return null;
}

export function time(v: unknown): number | null {
  const direct = toSeconds(v);
  if (direct !== null) return direct;
  return null;
}

const STATUS_MAP: Array<[RegExp, JobStatus]> = [
  [/^(complete|completed|done|success|successful|succeeded|ready|finished|indexed|passed)$/i, "completed"],
  [/^(fail|failed|failure|error|errored|rejected|aborted|cancelled|canceled)$/i, "failed"],
  [/^(queue|queued|pending|waiting|scheduled|received|accepted|new|uploaded)$/i, "queued"],
  [/(process|progress|running|working|transcrib|diariz|encod|analys|analyz|ingest|active|started)/i, "processing"],
];

export function parseStatus(v: unknown): JobStatus {
  const s = str(v);
  if (!s) return "unknown";
  for (const [re, status] of STATUS_MAP) if (re.test(s)) return status;
  if (/^(ok|true)$/i.test(s)) return "completed";
  return "unknown";
}

function arr(v: unknown): unknown[] | null {
  return Array.isArray(v) ? v : null;
}

/**
 * Finds the first array under any of the given keys, unwrapping containers such
 * as `{ data: { transcript: { utterances: [...] } } }` up to three levels deep.
 * Anonymous "first array of objects" matching only happens at the top level so
 * we never mistake a stats block for a transcript.
 */
function findArray(obj: unknown, keys: string[], depth = 0): unknown[] | null {
  if (Array.isArray(obj)) return obj;
  if (!isObj(obj) || depth > 3) return null;

  for (const k of keys) {
    const a = arr(field(obj, [k]));
    if (a) return a;
  }
  if (depth === 0) {
    for (const value of Object.values(obj)) {
      if (Array.isArray(value) && value.length && value.some(isObj)) return value;
    }
  }
  for (const value of Object.values(obj)) {
    if (isObj(value)) {
      const found = findArray(value, keys, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

export const keysOf = (v: unknown): string[] => (isObj(v) ? Object.keys(v) : []);

/* ------------------------------------------------------------------ *
 * Segments
 * ------------------------------------------------------------------ */

const SEGMENT_KEYS = [
  "segments",
  "transcript",
  "utterances",
  "sentences",
  "captions",
  "cues",
  "chunks",
  "lines",
  "paragraphs",
  "entries",
  "results",
  "items",
  "data",
];

const WORD_KEYS = ["words", "tokens", "word_list", "wordList", "terms"];

let segCounter = 0;
const segId = () => `seg-${(segCounter += 1)}`;

function readWords(item: unknown): Word[] {
  const list = findArray(item, WORD_KEYS);
  if (!list) return [];
  const out: Word[] = [];
  for (const w of list) {
    if (typeof w === "string") {
      out.push({ start: null, end: null, text: w });
      continue;
    }
    const text = str(field(w, ["word", "text", "value", "token"]));
    if (!text) continue;
    out.push({
      start: time(field(w, ["start", "startTime", "start_time", "from", "begin", "s"])),
      end: time(field(w, ["end", "endTime", "end_time", "to", "finish", "e"])),
      text,
    });
  }
  return out;
}

function readSpeaker(item: unknown): string | null {
  return str(
    field(item, [
      "speaker",
      "speaker_label",
      "speakerLabel",
      "speaker_id",
      "speakerId",
      "who",
      "voice",
      "channel",
      "talker",
    ]),
  );
}

function readSegmentText(item: unknown): string {
  const text = str(field(item, ["text", "content", "transcript", "sentence", "line", "value", "caption"]));
  if (text) return text;
  const words = readWords(item);
  if (words.length) return words.map((w) => w.text).join(" ").replace(/\s+/g, " ").trim();
  return "";
}

function toSegment(item: unknown): Segment | null {
  if (typeof item === "string") {
    const text = item.trim();
    return text ? { id: segId(), start: null, end: null, text, speaker: null, words: [], raw: item } : null;
  }
  if (!isObj(item)) return null;
  const text = readSegmentText(item);
  const start = time(field(item, ["start", "startTime", "start_time", "from", "begin", "ts", "timestamp", "offset", "s"]));
  const end = time(field(item, ["end", "endTime", "end_time", "to", "finish", "until", "e"]));
  const words = readWords(item);
  if (!text && !words.length && start === null) return null;
  return {
    id: str(field(item, ["id", "segment_id", "segmentId", "uuid"])) ?? segId(),
    start,
    end: end ?? (start !== null && words.length ? words[words.length - 1].end ?? start : end),
    text: text || words.map((w) => w.text).join(" "),
    speaker: readSpeaker(item),
    words,
    raw: item,
  };
}

/**
 * Word-level timestamps are ambiguous: `3400` could be 3.4s (ms payload) or
 * 56 minutes (integer seconds). Integer-only values whose median gap is tens of
 * units are milliseconds in every engine we know of, so scale those by 1/1000.
 */
function detectMsScale(times: Array<number | null>): number {
  const vals = times.filter((t): t is number => t !== null && Number.isFinite(t));
  if (vals.length < 3 || !vals.every(Number.isInteger)) return 1;
  if (Math.max(...vals) < 1000) return 1;
  const sorted = [...vals].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const g = sorted[i] - sorted[i - 1];
    if (g > 0) gaps.push(g);
  }
  if (!gaps.length) return 1;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] >= 20 ? 1000 : 1;
}

/** Some engines only return word-level output — roll it up into readable cues. */
function groupWords(items: unknown[]): Segment[] {
  const tokens: Array<{ word: Word; speaker: string | null }> = [];
  for (const raw of items) {
    if (typeof raw === "string") {
      tokens.push({ word: { start: null, end: null, text: raw }, speaker: null });
      continue;
    }
    if (!isObj(raw)) continue;
    const text = str(field(raw, ["word", "text", "token", "value"]));
    if (!text) continue;
    tokens.push({
      word: {
        start: time(field(raw, ["start", "startTime", "start_time", "from", "begin"])),
        end: time(field(raw, ["end", "endTime", "end_time", "to", "finish"])),
        text,
      },
      speaker: readSpeaker(raw),
    });
  }

  const scale = detectMsScale(tokens.flatMap((t) => [t.word.start, t.word.end]));
  if (scale !== 1) {
    for (const t of tokens) {
      if (t.word.start !== null) t.word.start /= scale;
      if (t.word.end !== null) t.word.end /= scale;
    }
  }

  const out: Segment[] = [];
  let bucket: Word[] = [];
  let speaker: string | null = null;

  const flush = () => {
    if (!bucket.length) return;
    const start = bucket.find((b) => b.start !== null)?.start ?? null;
    const end = [...bucket].reverse().find((b) => b.end !== null)?.end ?? start;
    out.push({
      id: segId(),
      start,
      end,
      text: bucket.map((b) => b.text).join(" ").replace(/\s+/g, " ").trim(),
      speaker,
      words: bucket,
    });
    bucket = [];
  };

  for (const { word, speaker: sp } of tokens) {
    const prevEnd = bucket.length ? bucket[bucket.length - 1].end : null;
    const gap = word.start !== null && prevEnd !== null ? word.start - prevEnd : 0;
    const sentenceEnd = /[.!?]["'”’)]?$/.test(bucket[bucket.length - 1]?.text ?? "");
    if (
      bucket.length &&
      ((sp !== null && sp !== speaker) || gap > 1.1 || bucket.length >= 42 || (sentenceEnd && bucket.length > 6))
    ) {
      flush();
    }
    if (sp !== null) speaker = sp;
    bucket.push(word);
  }
  flush();
  return out;
}

export function normalizeSegments(source: unknown): Segment[] {
  if (typeof source === "string") {
    const text = source.trim();
    return text ? [{ id: segId(), start: null, end: null, text, speaker: null, words: [] }] : [];
  }
  const list = findArray(source, SEGMENT_KEYS);
  if (!list || !list.length) {
    // Last resort: a plain-string transcript field with no timing information.
    const blob = isObj(source)
      ? field(source, ["transcript", "text", "content", "full_text", "transcript_text", "body", "transcription"])
      : undefined;
    const t = typeof blob === "string" ? blob.replace(/\s+/g, " ").trim() : "";
    return t ? [{ id: segId(), start: null, end: null, text: t, speaker: null, words: [] }] : [];
  }
  const looksWordLevel =
    list.length > 0 &&
    list.every(
      (it) =>
        typeof it === "string" ||
        (isObj(it) && field(it, ["word", "token"]) !== undefined && field(it, ["text", "sentence", "content"]) === undefined),
    );
  if (looksWordLevel) return groupWords(list);

  const out: Segment[] = [];
  for (const item of list) {
    // Nested shape: { video: {...}, matches: [ ... ] }
    if (isObj(item)) {
      const nested = findArray(item, ["segments", "matches", "hits", "utterances", "cues"]);
      const ownText = readSegmentText(item);
      if (nested && nested.length && !ownText) {
        out.push(...normalizeSegments(item));
        continue;
      }
    }
    const seg = toSegment(item);
    if (seg) out.push(seg);
  }
  return out.filter((s) => s.text.trim().length > 0 || s.words.length > 0);
}

/* ------------------------------------------------------------------ *
 * Videos
 * ------------------------------------------------------------------ */

/** True when the payload carries an explicitly millisecond-named duration field. */
function hasMsNamedDuration(source: unknown, value: number, depth = 0): boolean {
  if (!isObj(source) || depth > 2) return false;
  for (const [k, v] of Object.entries(source)) {
    if (v === value && /duration|length|runtime/i.test(k) && /(ms|milli)/i.test(k)) return true;
    if (isObj(v) && hasMsNamedDuration(v, value, depth + 1)) return true;
  }
  return false;
}

export function normalizeVideo(raw: unknown, fallbackId = ""): VideoRecord {
  const rawId = deepField(raw, ["video_id", "videoId", "id", "_id", "uid"], ["video", "data", "result"]);
  const id = (Array.isArray(rawId) ? null : idOf(rawId)) ?? fallbackId;

  const segments = normalizeSegments(raw);
  const durationRaw = deepField(
    raw,
    [
      "duration",
      "duration_seconds",
      "durationSeconds",
      "duration_sec",
      "duration_ms",
      "durationMs",
      "duration_milliseconds",
      "length",
      "total_duration",
      "media_duration",
      "runtime",
    ],
    ["video", "media", "metadata", "data"],
  );
  let duration = time(durationRaw);
  if (duration === null && segments.length) {
    const tail = segments[segments.length - 1];
    duration = tail.end ?? tail.start;
  } else if (
    duration !== null &&
    typeof durationRaw === "number" &&
    durationRaw <= 86_400 &&
    hasMsNamedDuration(raw, durationRaw)
  ) {
    // Field explicitly named as milliseconds (e.g. `duration_ms`) and short
    // enough that the generic >24h heuristic in `toSeconds` did not catch it.
    duration /= 1000;
  }

  const speakers = Array.from(
    new Set(
      segments
        .map((s) => s.speaker)
        .filter((s): s is string => !!s)
        .concat(
          (findArray(raw, ["speakers", "speaker_labels", "participants"]) ?? [])
            .map((s) => (typeof s === "string" ? s : str(field(s, ["label", "name", "speaker", "id"]))))
            .filter((s): s is string => !!s),
        ),
    ),
  );

  const explicitWords = num(
    deepField(raw, ["word_count", "wordCount", "words_count", "total_words"], ["stats", "metadata", "data"]),
  );
  const wordCount =
    explicitWords ?? segments.reduce((acc, s) => acc + (s.text.trim() ? s.text.trim().split(/\s+/).length : 0), 0);

  return {
    id: id || "unknown",
    title:
      str(
        deepField(
          raw,
          ["title", "video_title", "videoTitle", "display_title", "name", "filename", "file_name", "label"],
          ["video", "metadata", "data", "result"],
        ),
      ) ??
      (id ? id : "Untitled video"),
    language: str(deepField(raw, ["language", "lang", "locale", "language_code", "detected_language"], ["video", "metadata"])),
    duration,
    status: parseStatus(deepField(raw, ["status", "state", "job_status", "phase"], ["video", "job", "data"])),
    createdAt: str(deepField(raw, ["created_at", "createdAt", "uploaded_at", "timestamp", "date"], ["video", "metadata"])),
    segments,
    speakers,
    wordCount,
    shape: keysOf(raw),
    fetchedAt: Date.now(),
    raw,
  };
}

/* ------------------------------------------------------------------ *
 * Jobs
 * ------------------------------------------------------------------ */

export function normalizeJob(raw: unknown, fallbackId = ""): Job {
  const id =
    str(deepField(raw, ["job_id", "jobId", "id", "_id", "task_id"], ["job", "data", "result"])) ?? fallbackId;
  const videoId = idOf(deepField(raw, ["video_id", "videoId", "video"], ["job", "data"]));
  const status = parseStatus(deepField(raw, ["status", "state", "phase", "job_status"], ["job", "data"]));

  let progress = num(deepField(raw, ["progress", "percent", "percentage", "completion", "progress_pct"], ["job", "data"]));
  if (progress !== null && progress > 1 && progress <= 100) progress /= 100;
  if (progress !== null) progress = Math.max(0, Math.min(1, progress));
  if (progress === null && status === "completed") progress = 1;

  const stageRaw = deepField(
    raw,
    ["stage", "step", "phase", "status_message", "message", "detail", "description", "note"],
    ["job", "data"],
  );
  const stage = typeof stageRaw === "string" ? stageRaw : null;

  const errorRaw = deepField(raw, ["error", "error_message", "errorMessage", "failure_reason", "failureReason", "reason"], [
    "job",
    "data",
  ]);
  const error =
    typeof errorRaw === "string"
      ? errorRaw
      : isObj(errorRaw)
        ? str(field(errorRaw, ["message", "detail", "error"])) ?? JSON.stringify(errorRaw)
        : status === "failed"
          ? stage
          : null;

  return { id: id || "unknown", videoId, status, progress, stage, error, shape: keysOf(raw), raw };
}

/* ------------------------------------------------------------------ *
 * Upload receipts
 * ------------------------------------------------------------------ */

export function normalizeUpload(raw: unknown): UploadReceipt {
  const jobId = idOf(deepField(raw, ["job_id", "jobId", "task_id", "taskId"], ["job", "data"]));
  const videoIdRaw = deepField(raw, ["video_id", "videoId", "video"], ["video", "data"]);
  const videoId = idOf(videoIdRaw);
  const idRaw = deepField(raw, ["id", "_id"], ["job", "data"]);
  const ambiguousId = Array.isArray(idRaw) ? null : idOf(idRaw);
  // A bare `id` is only trustworthy as a job id when no video was referenced.
  const resolvedJobId = jobId ?? (videoId && videoId === ambiguousId ? null : (ambiguousId ?? null));
  const status = parseStatus(deepField(raw, ["status", "state"], ["job", "data"]));
  const message = str(deepField(raw, ["message", "detail", "status_message", "note"], ["job", "data"]));
  return {
    jobId: resolvedJobId,
    videoId,
    status: status === "unknown" ? "queued" : status,
    message,
    shape: keysOf(raw),
    raw,
  };
}

/* ------------------------------------------------------------------ *
 * Search
 * ------------------------------------------------------------------ */

const HIT_KEYS = ["results", "hits", "matches", "items", "data", "segments", "results_", "found", "matches_"];

let hitCounter = 0;

function toHit(item: unknown, index: number): SearchHit | null {
  if (!isObj(item) && typeof item !== "string") return null;
  const text =
    typeof item === "string"
      ? item
      : (str(field(item, ["text", "snippet", "content", "context", "sentence", "line", "caption", "excerpt", "value"])) ?? "");
  const start = time(
    field(item, ["start", "startTime", "start_time", "timestamp", "time", "from", "begin", "ts", "offset", "t", "s"]),
  );
  const end = time(field(item, ["end", "endTime", "end_time", "to", "finish", "until", "e"]));
  const score = num(field(item, ["score", "confidence", "relevance", "rank_score", "similarity"]));
  if (!text && start === null) return null;
  return {
    id: str(field(item, ["id", "segment_id", "hit_id", "uuid"])) ?? `hit-${(hitCounter += 1)}-${index}`,
    videoId: str(field(item, ["video_id", "videoId", "video", "source_id", "doc_id", "document_id"])),
    videoTitle: str(field(item, ["video_title", "videoTitle", "title", "source", "video_name"])),
    start,
    end,
    text: text.replace(/\s+/g, " ").trim(),
    speaker: readSpeaker(item),
    score,
    before: str(field(item, ["before", "context_before", "contextBefore", "preceding", "left"])),
    after: str(field(item, ["after", "context_after", "contextAfter", "following", "right"])),
    raw: item,
  };
}

export function normalizeSearch(raw: unknown, query: string): SearchResponse {
  const list = findArray(raw, HIT_KEYS) ?? [];
  const results: SearchHit[] = [];

  for (const item of list) {
    // Grouped shape: { video_id, matches: [...] }
    if (isObj(item)) {
      const nested = findArray(item, ["matches", "hits", "segments", "results"]);
      const ownText = str(field(item, ["text", "snippet", "content", "sentence"]));
      if (nested && nested.length && !ownText) {
        const videoId = idOf(deepField(item, ["video_id", "videoId", "video", "id"], ["video", "source"]));
        const videoTitle = str(deepField(item, ["video_title", "videoTitle", "title", "name"], ["video", "source"]));
        for (const child of nested) {
          const hit = toHit(child, results.length);
          if (hit) results.push({ ...hit, videoId: hit.videoId ?? videoId, videoTitle: hit.videoTitle ?? videoTitle });
        }
        continue;
      }
    }
    const hit = toHit(item, results.length);
    if (hit) results.push(hit);
  }

  const total = num(deepField(raw, ["total", "count", "total_hits", "num_results", "found", "matched"], ["meta", "pagination"]));
  const tookRaw = num(deepField(raw, ["took", "took_ms", "elapsed_ms", "duration_ms", "time_ms"], ["meta"]));

  return {
    query,
    results,
    total: total ?? (Array.isArray(raw) ? results.length : null),
    tookMs: tookRaw !== null && tookRaw > 5000 ? tookRaw / 1000 : tookRaw,
    shape: keysOf(raw),
    raw,
  };
}

/** Best-effort id extraction for arbitrary payloads (used across the UI). */
export function guessId(raw: unknown, kind: "video" | "job"): string | null {
  const keys = kind === "video" ? ["video_id", "videoId", "id"] : ["job_id", "jobId", "id"];
  return str(deepField(raw, keys, kind === "video" ? ["video", "data"] : ["job", "data"]));
}
