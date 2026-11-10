import type { Segment } from "./types";

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** "83.4" → "1:23" · "3723.1" → "1:02:03" */
export function tc(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return "--:--";
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = Math.floor(s % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

/** Sub-second precision for the timecode rail: "1:02:03.480" */
export function tcPrecise(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return "--:--.---";
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  const pad = (n: number, l = 2) => String(n).padStart(l, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(r)}.${pad(ms, 3)}` : `${pad(m)}:${pad(r)}.${pad(ms, 3)}`;
}

/** SRT/VTT style "00:01:23,450" */
export function tcSubtitle(sec: number | null | undefined, sep = ","): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return `00:00:00${sep}000`;
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  const pad = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${pad(h)}:${pad(m)}:${pad(r)}${sep}${pad(ms, 3)}`;
}

export function formatDuration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return "—";
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US");
}

export function formatDateTime(ts: number | string | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(typeof ts === "number" ? ts : ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function formatRelative(ts: number | string | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(typeof ts === "number" ? ts : ts).getTime();
  if (Number.isNaN(d)) return "—";
  const diff = Date.now() - d;
  const abs = Math.abs(diff);
  const units: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [1000, "second"],
    [60_000, "minute"],
    [3_600_000, "hour"],
    [86_400_000, "day"],
    [604_800_000, "week"],
    [2_592_000_000, "month"],
  ];
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 45_000) return rtf.format(Math.round(diff / -1000), "second");
  for (let i = units.length - 1; i >= 0; i -= 1) {
    const [ms, unit] = units[i];
    if (abs >= ms) return rtf.format(Math.round(diff / -ms), unit);
  }
  return rtf.format(Math.round(diff / -2_592_000_000), "month");
}

const SPEAKER_COLORS = ["cue", "mint", "sky", "coral", "chalk"] as const;
export type SpeakerColor = (typeof SPEAKER_COLORS)[number];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** "SPEAKER_00" → "S1", keeps human labels intact. */
export function displaySpeaker(label: string | null | undefined): string {
  if (!label) return "—";
  const m = /^(?:sp(?:ea)?k(?:er)?|spk|speaker|s)[_\-\s#]*(\d+)$/i.exec(label.trim());
  if (m) return `S${Number(m[1]) + 1}`;
  if (/^\d+$/.test(label.trim())) return `S${Number(label) + 1}`;
  const ch = label.trim().split(/[\s_-]+/);
  if (ch.length > 1) return ch.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  return label.trim().slice(0, 14);
}

export function speakerColor(label: string | null | undefined): SpeakerColor {
  if (!label) return "chalk";
  const m = /^(?:sp(?:ea)?k(?:er)?|spk|s)[_\-\s#]*(\d+)$/i.exec(label.trim());
  if (m) return SPEAKER_COLORS[Number(m[1]) % SPEAKER_COLORS.length];
  return SPEAKER_COLORS[hash(label) % SPEAKER_COLORS.length];
}

export interface HitPart {
  text: string;
  hit: boolean;
}

/** Splits text into matched / unmatched runs for the given query. */
export function highlightParts(text: string, query: string): HitPart[] {
  const terms = query
    .toLowerCase()
    .split(/[\s,]+/)
    .map((t) => t.replace(/[^\p{L}\p{N}'-]/gu, ""))
    .filter((t) => t.length > 0);
  if (!terms.length || !text) return [{ text, hit: false }];

  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  const out: HitPart[] = [];
  let cursor = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > cursor) out.push({ text: text.slice(cursor, idx), hit: false });
    out.push({ text: m[0], hit: true });
    cursor = idx + m[0].length;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), hit: false });
  return out.length ? out : [{ text, hit: false }];
}

export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

export function initials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "??";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function segmentsToPlainText(segments: Segment[]): string {
  return segments.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
}

/** Rough speaking-rate / density metric for the stats strip. */
export function wordsPerMinute(segments: Segment[], duration: number | null): number | null {
  if (!duration || duration <= 0) return null;
  const words = segments.reduce((acc, s) => acc + countWords(s.text), 0);
  return Math.round((words / duration) * 60);
}
