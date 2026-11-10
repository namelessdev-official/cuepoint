import { useMemo } from "react";

/**
 * Layered studio backdrop: warm/mint light pools, an engineering grid,
 * two slowly drifting waveforms and a film-grain pass. Pure CSS/SVG — no
 * images, no canvas work on the main thread.
 */
function wavePath(width: number, height: number, seed: number, amp: number, freq: number): string {
  const points: string[] = [];
  const step = 12;
  for (let x = 0; x <= width; x += step) {
    const t = x / width;
    const y =
      height / 2 +
      Math.sin(t * Math.PI * 2 * freq + seed) * amp +
      Math.sin(t * Math.PI * 2 * freq * 2.7 + seed * 1.9) * amp * 0.42 +
      Math.sin(t * Math.PI * 2 * freq * 6.3 + seed * 0.6) * amp * 0.16;
    points.push(`${x === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(2)}`);
  }
  return points.join(" ");
}

export function Ambient() {
  const waveA = useMemo(() => wavePath(2400, 220, 0.4, 44, 2), []);
  const waveB = useMemo(() => wavePath(2400, 220, 2.1, 30, 3.4), []);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-ink-950" aria-hidden="true">
      {/* light pools */}
      <div
        className="absolute -left-[18%] -top-[28%] h-[70vh] w-[70vw] rounded-full opacity-[.55] blur-[90px]"
        style={{ background: "radial-gradient(circle, rgba(255,177,60,.16), rgba(255,177,60,0) 62%)" }}
      />
      <div
        className="absolute -bottom-[30%] right-[-12%] h-[75vh] w-[60vw] rounded-full opacity-[.5] blur-[100px]"
        style={{ background: "radial-gradient(circle, rgba(69,214,164,.13), rgba(69,214,164,0) 65%)" }}
      />
      <div
        className="absolute left-[42%] top-[18%] h-[40vh] w-[38vw] rounded-full opacity-30 blur-[110px]"
        style={{ background: "radial-gradient(circle, rgba(111,182,255,.14), rgba(111,182,255,0) 66%)" }}
      />

      {/* engineering grid */}
      <div
        className="hairline-grid absolute inset-0 opacity-[.55]"
        style={{ maskImage: "radial-gradient(ellipse 90% 70% at 50% 0%, #000 20%, transparent 78%)" }}
      />

      {/* drifting waveforms */}
      <div className="absolute inset-x-0 bottom-[6vh] h-[220px] opacity-[.16]">
        <div className="flex h-full w-[200%] animate-drift">
          <svg viewBox="0 0 2400 220" preserveAspectRatio="none" className="h-full w-1/2">
            <path d={waveA} fill="none" stroke="#ffb13c" strokeWidth="1.4" />
            <path d={waveB} fill="none" stroke="#45d6a4" strokeWidth="1" opacity=".7" />
          </svg>
          <svg viewBox="0 0 2400 220" preserveAspectRatio="none" className="h-full w-1/2">
            <path d={waveA} fill="none" stroke="#ffb13c" strokeWidth="1.4" />
            <path d={waveB} fill="none" stroke="#45d6a4" strokeWidth="1" opacity=".7" />
          </svg>
        </div>
      </div>

      {/* grain + vignette */}
      <div className="noise absolute inset-0 opacity-[.035] mix-blend-overlay" />
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse 120% 90% at 50% 45%, transparent 40%, rgba(3,5,8,.72) 100%)" }}
      />
    </div>
  );
}

/** Small animated equaliser used as an "active" affordance. */
export function Equaliser({ bars = 5, className = "", tone = "text-cue" }: { bars?: number; className?: string; tone?: string }) {
  return (
    <span className={`inline-flex h-3 items-end gap-[2px] ${tone} ${className}`} aria-hidden="true">
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className="w-[2px] origin-bottom animate-eq rounded-full bg-current"
          style={{ height: "100%", animationDelay: `${i * 0.13}s`, animationDuration: `${0.85 + (i % 3) * 0.22}s` }}
        />
      ))}
    </span>
  );
}

/** Static waveform fingerprint used as a placeholder for media thumbnails. */
export function WaveThumb({ seed = 1, className = "", active = false }: { seed?: number; className?: string; active?: boolean }) {
  const bars = useMemo(() => {
    const out: number[] = [];
    let s = seed * 9301 + 49297;
    for (let i = 0; i < 44; i += 1) {
      s = (s * 9301 + 49297) % 233280;
      const r = s / 233280;
      out.push(0.16 + Math.abs(Math.sin(i / 3.1 + seed)) * 0.5 + r * 0.34);
    }
    return out;
  }, [seed]);

  return (
    <span className={`flex h-8 items-center gap-[2px] overflow-hidden ${className}`} aria-hidden="true">
      {bars.map((b, i) => (
        <span
          key={i}
          className={`w-[2px] shrink-0 rounded-full transition-all duration-300 ${
            active ? "bg-cue" : i % 7 === 0 ? "bg-mint/60" : "bg-ink-400"
          }`}
          style={{ height: `${Math.min(100, b * 100)}%`, opacity: active ? 0.95 : 0.65 }}
        />
      ))}
    </span>
  );
}
