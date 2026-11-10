/**
 * Shared domain types for the Cuepoint console.
 * The upstream OpenAPI spec leaves every response schema as `{}`, so these
 * types describe the *normalised* shape we render after `lib/normalize.ts`
 * has had a go at whatever the server actually returned.
 */

export type JobStatus = "queued" | "processing" | "completed" | "failed" | "unknown";

export interface Settings {
  baseUrl: string;
  apiKey: string;
}

export interface Word {
  start: number | null;
  end: number | null;
  text: string;
}

export interface Segment {
  id: string;
  start: number | null;
  end: number | null;
  text: string;
  speaker: string | null;
  words: Word[];
  raw?: unknown;
}

export interface VideoRecord {
  id: string;
  title: string;
  language: string | null;
  duration: number | null;
  status: JobStatus;
  createdAt: string | null;
  segments: Segment[];
  speakers: string[];
  wordCount: number;
  /** Keys present on the raw payload — surfaced in the UI as a shape report. */
  shape: string[];
  fetchedAt: number;
  raw: unknown;
}

export interface Job {
  id: string;
  videoId: string | null;
  status: JobStatus;
  progress: number | null;
  stage: string | null;
  error: string | null;
  shape: string[];
  raw: unknown;
}

export interface UploadReceipt {
  jobId: string | null;
  videoId: string | null;
  status: JobStatus;
  message: string | null;
  shape: string[];
  raw: unknown;
}

export interface SearchHit {
  id: string;
  videoId: string | null;
  videoTitle: string | null;
  start: number | null;
  end: number | null;
  text: string;
  speaker: string | null;
  score: number | null;
  before: string | null;
  after: string | null;
  raw?: unknown;
}

export interface SearchResponse {
  query: string;
  results: SearchHit[];
  total: number | null;
  tookMs: number | null;
  shape: string[];
  raw: unknown;
}

/** Client-side registry of everything this browser has seen (the API has no list endpoint). */
export interface LibraryEntry {
  videoId: string;
  jobId: string | null;
  title: string;
  language: string | null;
  numSpeakers: number | null;
  status: JobStatus;
  addedAt: number;
  updatedAt: number;
  duration: number | null;
  segmentCount: number | null;
  wordCount: number | null;
  speakers: string[];
  /** Remote playback URL supplied by the user (blob: URLs never persist). */
  mediaUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  error: string | null;
  starred: boolean;
}

export interface SearchParams {
  q: string;
  videoId?: string | null;
  limit?: number;
  contextWords?: number;
}

/* ------------------------- Client-side pipeline ------------------------- */

export type PipelinePhase = "uploading" | "queued" | "processing" | "completed" | "failed" | "cancelled";

export interface UploadMeta {
  title: string | null;
  language: string | null;
  numSpeakers: number | null;
  /** Client-side probe of the media, never sent to the API. */
  mediaDuration?: number | null;
}

/** One upload → job → transcript run, tracked entirely in the browser. */
export interface TrackedJob {
  key: string;
  jobId: string | null;
  videoId: string | null;
  title: string;
  fileName: string | null;
  fileSize: number | null;
  mediaDuration: number | null;
  phase: PipelinePhase;
  uploadProgress: number | null;
  jobProgress: number | null;
  stage: string | null;
  error: string | null;
  startedAt: number;
  updatedAt: number;
  finishedAt: number | null;
  attempts: number;
  meta: UploadMeta;
  job: Job | null;
}

/** Every HTTP call the console makes, for the live request trace. */
export interface RequestLogEntry {
  id: number;
  method: string;
  path: string;
  status: number | null;
  ms: number;
  ok: boolean;
  kind: string | null;
  at: number;
}
