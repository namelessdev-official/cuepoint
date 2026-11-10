import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { formatDuration, tc, tcPrecise } from "@/lib/format";
import { IconButton } from "./ui";
import { IconPause, IconPlay, IconWave } from "./Icons";

export interface PlayerHandle {
  seek: (t: number) => void;
  play: () => void;
  pause: () => void;
}

const RATES = [0.75, 1, 1.25, 1.5, 2];

export const Player = forwardRef<
  PlayerHandle,
  {
    src: string | null;
    title?: string;
    duration?: number | null;
    markers?: number[];
    onTime?: (t: number) => void;
    fallback?: ReactNode;
  }
>(function Player({ src, title, duration, markers = [], onTime, fallback }, ref) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [length, setLength] = useState(duration ?? null);
  const [rate, setRate] = useState(1);
  const [muted, setMuted] = useState(false);
  const [buffered, setBuffered] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);

  useImperativeHandle(ref, () => ({
    seek: (t: number) => {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = Math.max(0, t);
      setCurrent(v.currentTime);
      void v.play().catch(() => setPlaying(false));
    },
    play: () => void videoRef.current?.play().catch(() => undefined),
    pause: () => videoRef.current?.pause(),
  }));

  useEffect(() => {
    setCurrent(0);
    setPlaying(false);
    setLength(duration ?? null);
  }, [src, duration]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = rate;
  }, [rate, src]);

  const emit = useCallback(
    (t: number) => {
      setCurrent(t);
      onTime?.(t);
    },
    [onTime],
  );

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => setPlaying(false));
    else v.pause();
  };

  const nudge = (delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min((length ?? v.duration ?? 0) || v.duration || 0, v.currentTime + delta));
    emit(v.currentTime);
  };

  if (!src) {
    return (
      <div className="panel relative overflow-hidden">
        <div className="sprockets absolute inset-y-0 left-0 w-[10px] opacity-50" />
        <div className="flex min-h-[168px] flex-col items-start justify-center gap-3 px-6 py-6 pl-8">
          <span className="flex items-center gap-2 text-dim">
            <IconWave className="h-4 w-4" />
            <span className="label-xs">No playable source</span>
          </span>
          <p className="max-w-md text-[12.5px] leading-relaxed text-muted">
            This API returns transcripts, not media. Attach the original file below (or paste a URL) to get
            click-to-seek playback synced with the transcript. Nothing is re-uploaded — playback stays local.
          </p>
          {fallback}
        </div>
      </div>
    );
  }

  const pct = length ? (current / length) * 100 : 0;

  return (
    <div className="panel group/player overflow-hidden">
      <div className="relative bg-ink-950">
        <video
          ref={videoRef}
          src={src}
          muted={muted}
          playsInline
          preload="metadata"
          className="max-h-[46vh] w-full bg-ink-950 object-contain"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => emit(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) setLength(d);
          }}
          onProgress={(e) => {
            const v = e.currentTarget;
            if (v.buffered.length && v.duration) setBuffered((v.buffered.end(v.buffered.length - 1) / v.duration) * 100);
          }}
          onEnded={() => setPlaying(false)}
          onClick={toggle}
        />
        {!playing && (
          <button
            type="button"
            onClick={toggle}
            aria-label="Play"
            className="absolute inset-0 flex items-center justify-center bg-ink-950/35 transition-colors hover:bg-ink-950/20"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full border border-cue/40 bg-ink-900/85 text-cue shadow-[0_0_40px_-8px_rgba(255,177,60,.7)] transition-transform duration-200 hover:scale-105">
              <IconPlay className="ml-0.5 h-6 w-6" />
            </span>
          </button>
        )}
        {title && (
          <span className="pointer-events-none absolute left-3 top-3 max-w-[70%] truncate rounded-[3px] border border-line bg-ink-950/75 px-2 py-1 font-mono text-[10.5px] uppercase tracking-[.14em] text-muted opacity-0 transition-opacity duration-200 group-hover/player:opacity-100">
            {title}
          </span>
        )}
      </div>

      {/* transport */}
      <div className="border-t border-line px-3 py-2.5">
        <div
          className="group/scrub relative h-4 cursor-pointer"
          onPointerDown={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
            setScrubbing(true);
            const v = videoRef.current;
            if (v && length) {
              v.currentTime = ratio * length;
              emit(v.currentTime);
            }
          }}
          onPointerMove={(e) => {
            if (!scrubbing || !length) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
            const v = videoRef.current;
            if (v) {
              v.currentTime = ratio * length;
              emit(v.currentTime);
            }
          }}
          onPointerUp={() => setScrubbing(false)}
          onPointerLeave={() => setScrubbing(false)}
        >
          <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 overflow-hidden rounded-full bg-ink-600">
            <div className="h-full bg-ink-500" style={{ width: `${buffered}%` }} />
          </div>
          <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full">
            <div className="h-full rounded-full bg-cue" style={{ width: `${pct}%` }} />
          </div>
          {length &&
            markers.slice(0, 120).map((m, i) => (
              <span
                key={`${m}-${i}`}
                className="absolute top-1/2 h-[9px] w-[2px] -translate-y-1/2 rounded-full bg-mint/80"
                style={{ left: `${Math.min(100, (m / length) * 100)}%` }}
              />
            ))}
          <span
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink-900 bg-cue opacity-0 transition-opacity group-hover/scrub:opacity-100"
            style={{ left: `${pct}%`, opacity: scrubbing ? 1 : undefined }}
          />
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <IconButton label={playing ? "Pause" : "Play"} onClick={toggle} className="text-chalk">
            {playing ? <IconPause className="h-3.5 w-3.5" /> : <IconPlay className="h-3.5 w-3.5" />}
          </IconButton>
          <IconButton label="Back 5 seconds" onClick={() => nudge(-5)}>
            <span className="font-mono text-[10px]">-5</span>
          </IconButton>
          <IconButton label="Forward 5 seconds" onClick={() => nudge(5)}>
            <span className="font-mono text-[10px]">+5</span>
          </IconButton>
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="font-mono text-[10px] uppercase tracking-[.14em] text-dim transition-colors hover:text-chalk"
          >
            {muted ? "unmute" : "mute"}
          </button>
          <button
            type="button"
            onClick={() => setRate((r) => RATES[(RATES.indexOf(r) + 1) % RATES.length])}
            className="rounded-[3px] border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted transition-colors hover:border-cue/50 hover:text-cue"
          >
            {rate.toFixed(2).replace(/0$/, "")}×
          </button>
          <div className="ml-auto flex items-baseline gap-2 font-mono tabular-nums">
            <span className="text-[15px] font-medium text-cue">{tcPrecise(current)}</span>
            <span className="text-[11px] text-dim">/ {length ? tc(length) : formatDuration(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
});
