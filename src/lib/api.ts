import { isObj, normalizeJob, normalizeSearch, normalizeUpload, normalizeVideo, str } from "./normalize";
import type { Job, RequestLogEntry, SearchParams, SearchResponse, Settings, UploadReceipt, VideoRecord } from "./types";

/** Optional global tap so the UI can render a live request trace. */
type Logger = (entry: Omit<RequestLogEntry, "id">) => void;
let logger: Logger | null = null;
export function setRequestLogger(fn: Logger | null): void {
  logger = fn;
}
function log(entry: Omit<RequestLogEntry, "id">): void {
  logger?.(entry);
}


export type ErrorKind = "network" | "auth" | "validation" | "http" | "server" | "abort" | "parse";

export class ApiError extends Error {
  readonly kind: ErrorKind;
  readonly status: number | null;
  readonly statusText: string;
  readonly body: unknown;
  readonly url: string;

  constructor(message: string, opts: { kind: ErrorKind; status?: number | null; statusText?: string; body?: unknown; url?: string }) {
    super(message);
    this.name = "ApiError";
    this.kind = opts.kind;
    this.status = opts.status ?? null;
    this.statusText = opts.statusText ?? "";
    this.body = opts.body;
    this.url = opts.url ?? "";
  }
}

export function normalizeBaseUrl(input: string): string {
  let url = input.trim();
  if (!url) return "";
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = `https://${url}`;
  url = url.replace(/\/+$/, "");
  // Tolerate pasted deep links / doc URLs.
  url = url.replace(/\/(openapi\.json|docs|redoc)$/i, "");
  url = url.replace(/\/(videos|search|jobs)$/i, "");
  return url;
}

export function hasCredentials(s: Settings): boolean {
  return !!s.baseUrl.trim() && !!s.apiKey.trim();
}

function joinUrl(base: string, path: string): string {
  return `${normalizeBaseUrl(base)}${path.startsWith("/") ? path : `/${path}`}`;
}

function headers(s: Settings, extra: Record<string, string> = {}): Record<string, string> {
  return { Accept: "application/json", "X-API-Key": s.apiKey, ...extra };
}

/** Turns a FastAPI `HTTPValidationError` (or anything else) into one readable line. */
export function describeBody(body: unknown, status: number | null): string | null {
  if (body === undefined || body === null) return null;
  if (typeof body === "string") return body.trim() || null;
  if (isObj(body)) {
    const detail = body.detail ?? body.error ?? body.message;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const parts = detail
        .map((d) => {
          if (!isObj(d)) return String(d);
          const loc = Array.isArray(d.loc)
            ? d.loc.filter((p) => p !== "body").join(".")
            : str(d.loc) ?? "";
          const msg = str(d.msg) ?? "";
          return loc ? `${loc}: ${msg}` : msg;
        })
        .filter(Boolean);
      if (parts.length) return parts.join(" · ");
    }
    if (isObj(detail)) return describeBody(detail, status);
  }
  return null;
}

function classify(status: number, url: string, bodyText: string): { kind: ErrorKind; message: string } {
  let parsed: unknown = bodyText;
  try {
    parsed = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    /* keep as text */
  }
  const detail = describeBody(parsed, status);
  if (status === 401 || status === 403) {
    return { kind: "auth", message: detail ?? `Rejected (${status}). Check the X-API-Key value.` };
  }
  if (status === 422) {
    return { kind: "validation", message: detail ?? "The server rejected the request payload (422)." };
  }
  if (status === 404) {
    return { kind: "http", message: detail ?? `Nothing at ${url.replace(/^https?:\/\//, "")} (404). Verify the base URL path.` };
  }
  if (status === 413) {
    return { kind: "http", message: detail ?? "File too large for the server's upload limit (413)." };
  }
  if (status === 429) {
    return { kind: "http", message: detail ?? "Rate limited by the server (429). Try again shortly." };
  }
  if (status >= 500) {
    return { kind: "server", message: detail ?? `Server error ${status}.` };
  }
  return { kind: "http", message: detail ?? `Request failed with status ${status}.` };
}

interface RequestOpts {
  method?: "GET" | "POST" | "DELETE" | "PUT";
  query?: Record<string, string | number | undefined | null>;
  body?: BodyInit;
  signal?: AbortSignal;
  extraHeaders?: Record<string, string>;
  timeoutMs?: number;
}

export async function requestRaw(s: Settings, path: string, opts: RequestOpts = {}): Promise<{ status: number; text: string; url: string }> {
  const url = new URL(joinUrl(s.baseUrl, path));
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const controller = new AbortController();
  const timer = opts.timeoutMs ? setTimeout(() => controller.abort(), opts.timeoutMs) : undefined;
  opts.signal?.addEventListener("abort", () => controller.abort(), { once: true });

  const method = opts.method ?? "GET";
  const trace = `${url.pathname}${url.search}`;
  const started = performance.now();

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method,
      headers: headers(s, opts.extraHeaders),
      body: opts.body,
      signal: controller.signal,
    });
  } catch (err) {
    const ms = Math.round(performance.now() - started);
    const aborted = (err as Error)?.name === "AbortError";
    log({ method, path: trace, status: null, ms, ok: false, kind: aborted ? "abort" : "network", at: Date.now() });
    if (aborted) {
      if (opts.signal?.aborted) throw new ApiError("Request cancelled.", { kind: "abort", url: url.toString() });
      throw new ApiError(`Timed out after ${Math.round((opts.timeoutMs ?? 0) / 1000)}s.`, {
        kind: "network",
        url: url.toString(),
      });
    }
    throw new ApiError(
      `Could not reach ${url.host}. Confirm the base URL, that the API is running, and that it sends CORS headers allowing this browser origin.`,
      { kind: "network", url: url.toString() },
    );
  } finally {
    if (timer) clearTimeout(timer);
  }

  const text = await res.text().catch(() => "");
  const ms = Math.round(performance.now() - started);
  log({ method, path: trace, status: res.status, ms, ok: res.ok, kind: null, at: Date.now() });

  if (!res.ok) {
    const { kind, message } = classify(res.status, url.toString(), text);
    throw new ApiError(message, { kind, status: res.status, statusText: res.statusText, body: safeParse(text), url: url.toString() });
  }
  return { status: res.status, text, url: url.toString() };
}

function safeParse(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function requestJson(s: Settings, path: string, opts: RequestOpts = {}): Promise<unknown> {
  const { text } = await requestRaw(s, path, opts);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("Server responded with a non-JSON body.", { kind: "parse", body: text });
  }
}

/* ---------------------------- Endpoints ---------------------------- */

export async function getVideo(s: Settings, videoId: string, signal?: AbortSignal): Promise<VideoRecord> {
  const raw = await requestJson(s, `/videos/${encodeURIComponent(videoId)}`, { signal, timeoutMs: 45_000 });
  return normalizeVideo(raw, videoId);
}

export async function getJob(s: Settings, jobId: string, signal?: AbortSignal): Promise<Job> {
  const raw = await requestJson(s, `/jobs/${encodeURIComponent(jobId)}`, { signal, timeoutMs: 30_000 });
  return normalizeJob(raw, jobId);
}

export async function search(s: Settings, params: SearchParams, signal?: AbortSignal): Promise<SearchResponse> {
  const raw = await requestJson(s, "/search", {
    query: {
      q: params.q,
      video_id: params.videoId ?? undefined,
      limit: params.limit,
      context_words: params.contextWords,
    },
    signal,
    timeoutMs: 45_000,
  });
  return normalizeSearch(raw, params.q);
}

export interface UploadPayload {
  file: File;
  title?: string | null;
  language?: string | null;
  numSpeakers?: number | null;
}

export interface UploadHooks {
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}

/**
 * `POST /videos` — multipart upload using XHR so we can surface real
 * upload progress for large media files (fetch cannot report it).
 */
export function uploadVideo(s: Settings, payload: UploadPayload, hooks: UploadHooks = {}): Promise<UploadReceipt> {
  const url = joinUrl(s.baseUrl, "/videos");
  const form = new FormData();
  form.append("file", payload.file, payload.file.name);
  if (payload.title?.trim()) form.append("title", payload.title.trim().slice(0, 300));
  if (payload.language?.trim()) form.append("language", payload.language.trim());
  if (payload.numSpeakers && Number.isFinite(payload.numSpeakers)) {
    form.append("num_speakers", String(Math.round(Math.min(32, Math.max(1, payload.numSpeakers)))));
  }

  return new Promise<UploadReceipt>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("X-API-Key", s.apiKey);
    xhr.responseType = "text";
    xhr.timeout = 0;

    const onAbort = () => xhr.abort();
    hooks.signal?.addEventListener("abort", onAbort, { once: true });

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) hooks.onProgress?.(e.loaded, e.total);
      else hooks.onProgress?.(e.loaded, 0);
    };

    const started = performance.now();
    const trace = new URL(url).pathname;

    xhr.onerror = () => {
      log({ method: "POST", path: trace, status: null, ms: Math.round(performance.now() - started), ok: false, kind: "network", at: Date.now() });
      reject(
        new ApiError(`Upload to ${new URL(url).host} failed. Check the base URL, network, and the server's CORS settings.`, {
          kind: "network",
          url,
        }),
      );
    };
    xhr.ontimeout = () => reject(new ApiError("Upload timed out.", { kind: "network", url }));
    xhr.onabort = () => {
      log({ method: "POST", path: trace, status: null, ms: Math.round(performance.now() - started), ok: false, kind: "abort", at: Date.now() });
      reject(new ApiError("Upload cancelled.", { kind: "abort", url }));
    };

    xhr.onload = () => {
      hooks.signal?.removeEventListener("abort", onAbort);
      log({
        method: "POST",
        path: trace,
        status: xhr.status,
        ms: Math.round(performance.now() - started),
        ok: xhr.status >= 200 && xhr.status < 300,
        kind: null,
        at: Date.now(),
      });
      const body = safeParse(xhr.responseText);
      if (xhr.status < 200 || xhr.status >= 300) {
        const { kind, message } = classify(xhr.status, url, xhr.responseText);
        reject(new ApiError(message, { kind, status: xhr.status, statusText: xhr.statusText, body, url }));
        return;
      }
      resolve(normalizeUpload(body));
    };

    xhr.send(form);
  });
}

export interface ProbeResult {
  ok: boolean;
  latencyMs: number;
  status: number | null;
  kind: ErrorKind | null;
  message: string;
}

/** Reachability check — a tiny search request doubles as a credential test. */
export async function probeConnection(s: Settings): Promise<ProbeResult> {
  const started = performance.now();
  try {
    const res = await requestRaw(s, "/search", {
      query: { q: "the", limit: 1, context_words: 0 },
      timeoutMs: 15_000,
    });
    return {
      ok: true,
      latencyMs: Math.round(performance.now() - started),
      status: res.status,
      kind: null,
      message: `Reachable · ${res.status}`,
    };
  } catch (err) {
    const e = err instanceof ApiError ? err : new ApiError(String(err), { kind: "network" });
    return {
      ok: e.kind === "auth" ? false : e.status !== null,
      latencyMs: Math.round(performance.now() - started),
      status: e.status,
      kind: e.kind,
      message: e.message,
    };
  }
}

/* ---------------------------- Polling ---------------------------- */

export interface PollOptions {
  intervalMs?: number;
  maxMs?: number;
  signal?: AbortSignal;
  onTick?: (job: Job, attempt: number) => void;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new ApiError("Cancelled.", { kind: "abort" }));
      },
      { once: true },
    );
  });

export async function pollJob(s: Settings, jobId: string, opts: PollOptions = {}): Promise<Job> {
  const interval = opts.intervalMs ?? 2500;
  const deadline = Date.now() + (opts.maxMs ?? 30 * 60_000);
  let attempt = 0;
  let lastError: ApiError | null = null;
  let failures = 0;

  for (;;) {
    attempt += 1;
    try {
      const job = await getJob(s, jobId, opts.signal);
      failures = 0;
      lastError = null;
      opts.onTick?.(job, attempt);
      if (job.status === "completed" || job.status === "failed") return job;
    } catch (err) {
      failures += 1;
      lastError = err instanceof ApiError ? err : new ApiError(String(err), { kind: "network" });
      if (lastError.kind === "abort") throw lastError;
      if (failures >= 4) throw lastError;
    }
    if (Date.now() > deadline) {
      throw new ApiError("Polling stopped — the job is still running. You can resume watching it from the library.", {
        kind: "network",
      });
    }
    await sleep(Math.min(interval + attempt * 120, 8000), opts.signal);
  }
}
