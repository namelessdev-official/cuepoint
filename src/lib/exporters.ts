import { tcSubtitle } from "./format";
import type { SearchHit, Segment, VideoRecord } from "./types";

const safe = (t: string) => t.replace(/\s+/g, " ").trim();

export function toSRT(segments: Segment[]): string {
  return segments
    .map((s, i) => {
      const start = s.start ?? 0;
      const end = s.end ?? start + Math.max(1.5, s.text.split(/\s+/).length * 0.35);
      const label = s.speaker ? `${s.speaker}: ` : "";
      return `${i + 1}\n${tcSubtitle(start)} --> ${tcSubtitle(end)}\n${label}${safe(s.text)}\n`;
    })
    .join("\n");
}

export function toVTT(video: Pick<VideoRecord, "title" | "segments" | "language">): string {
  const body = video.segments
    .map((s) => {
      const start = s.start ?? 0;
      const end = s.end ?? start + Math.max(1.5, s.text.split(/\s+/).length * 0.35);
      const label = s.speaker ? `<v ${s.speaker}>` : "";
      return `${tcSubtitle(start, ".")} --> ${tcSubtitle(end, ".")}\n${label}${safe(s.text)}\n`;
    })
    .join("\n");
  return `WEBVTT\n\nNOTE ${video.title}${video.language ? `\nLANGUAGE ${video.language}` : ""}\n\n${body}`;
}

export function toTranscriptTxt(video: Pick<VideoRecord, "title" | "segments" | "id">): string {
  const head = `TRANSCRIPT — ${video.title}\nvideo_id: ${video.id}\n${"─".repeat(48)}\n\n`;
  const body = video.segments
    .map((s) => `[${s.start !== null ? tcSubtitle(s.start).slice(0, 8) : "--:--:--"}]${s.speaker ? ` ${s.speaker}:` : ""} ${safe(s.text)}`)
    .join("\n");
  return head + body + "\n";
}

export function toMarkdown(video: Pick<VideoRecord, "title" | "segments" | "id" | "language" | "duration">): string {
  const lines = video.segments.map((s) => {
    const t = s.start !== null ? `\`${tcSubtitle(s.start).slice(0, 8)}\`` : "`--:--:--`";
    return `- ${t} ${s.speaker ? `**${s.speaker}** — ` : ""}${safe(s.text)}`;
  });
  return [
    `# ${video.title}`,
    "",
    `> video_id \`${video.id}\`${video.language ? ` · language \`${video.language}\`` : ""}${
      video.duration ? ` · ${Math.round(video.duration)}s` : ""
    }`,
    "",
    ...lines,
    "",
  ].join("\n");
}

export function toJson(video: VideoRecord): string {
  return JSON.stringify(
    {
      video_id: video.id,
      title: video.title,
      language: video.language,
      duration: video.duration,
      segments: video.segments.map((s) => ({
        start: s.start,
        end: s.end,
        speaker: s.speaker,
        text: s.text,
        ...(s.words.length ? { words: s.words } : {}),
      })),
    },
    null,
    2,
  );
}

export function hitsToCsv(hits: SearchHit[], query: string): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["query", "video_id", "video_title", "start_seconds", "end_seconds", "start_timecode", "speaker", "score", "text"];
  const rows = hits.map((h) => [
    query,
    h.videoId,
    h.videoTitle,
    h.start,
    h.end,
    h.start !== null ? tcSubtitle(h.start).slice(0, 8) : "",
    h.speaker,
    h.score,
    h.text,
  ]);
  return [head, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}

export function download(filename: string, content: string, mime = "text/plain;charset=utf-8"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "transcript"
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
