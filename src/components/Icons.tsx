import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

function Base({ children, className = "h-4 w-4", strokeWidth = 1.6, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconCue = (p: P) => (
  <Base {...p}>
    <path d="M4 5v14M20 5v14" />
    <path d="M8.5 9.2v5.6l5-2.8z" fill="currentColor" stroke="none" />
  </Base>
);

export const IconUpload = (p: P) => (
  <Base {...p}>
    <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
    <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
  </Base>
);

export const IconLibrary = (p: P) => (
  <Base {...p}>
    <rect x="3" y="4" width="7" height="16" rx="1" />
    <rect x="12" y="4" width="4" height="16" rx="1" />
    <path d="m18.2 5.4 2.6 14.1" />
  </Base>
);

export const IconSearch = (p: P) => (
  <Base {...p}>
    <circle cx="10.8" cy="10.8" r="6.3" />
    <path d="m15.6 15.6 4 4" />
  </Base>
);

export const IconPlay = (p: P) => (
  <Base {...p}>
    <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
  </Base>
);

export const IconPause = (p: P) => (
  <Base {...p}>
    <rect x="7" y="5.5" width="3.4" height="13" rx="1" fill="currentColor" />
    <rect x="13.6" y="5.5" width="3.4" height="13" rx="1" fill="currentColor" />
  </Base>
);

export const IconClose = (p: P) => (
  <Base {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Base>
);

export const IconCheck = (p: P) => (
  <Base {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Base>
);

export const IconCopy = (p: P) => (
  <Base {...p}>
    <rect x="9" y="9" width="11" height="11" rx="1.6" />
    <path d="M15 5.6A1.6 1.6 0 0 0 13.4 4H5.6A1.6 1.6 0 0 0 4 5.6v7.8A1.6 1.6 0 0 0 5.6 15" />
  </Base>
);

export const IconDownload = (p: P) => (
  <Base {...p}>
    <path d="M12 4v11m0 0 4.2-4.2M12 15l-4.2-4.2" />
    <path d="M4.5 19.5h15" />
  </Base>
);

export const IconLink = (p: P) => (
  <Base {...p}>
    <path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.54 3.54 0 0 0-5-5l-1.2 1.2" />
    <path d="M13.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.54 3.54 0 0 0 5 5l1.2-1.2" />
  </Base>
);

export const IconKey = (p: P) => (
  <Base {...p}>
    <circle cx="8" cy="12" r="3.6" />
    <path d="M11.6 12H20m-2.6 0v2.6m-2.8-2.6v2.6" />
  </Base>
);

export const IconRefresh = (p: P) => (
  <Base {...p}>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
    <path d="M19.8 4.8v4.4h-4.4" />
  </Base>
);

export const IconAlert = (p: P) => (
  <Base {...p}>
    <path d="M12 4.8 3.6 19.2h16.8z" />
    <path d="M12 10v4m0 2.4v.2" />
  </Base>
);

export const IconInfo = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.4" />
    <path d="M12 11v5.2m0-8.4v.2" />
  </Base>
);

export const IconSpinner = (p: P) => (
  <Base {...p}>
    <path d="M12 3.6v3.2" opacity="1" />
    <path d="M12 17.2v3.2" opacity=".35" />
    <path d="M20.4 12h-3.2" opacity=".6" />
    <path d="M6.8 12H3.6" opacity=".85" />
    <path d="m17.9 6.1-2.3 2.3" opacity=".8" />
    <path d="m8.4 15.6-2.3 2.3" opacity=".45" />
    <path d="m17.9 17.9-2.3-2.3" opacity=".4" />
    <path d="M8.4 8.4 6.1 6.1" opacity=".95" />
  </Base>
);

export const IconChevron = (p: P) => (
  <Base {...p}>
    <path d="m9 5.5 6.5 6.5L9 18.5" />
  </Base>
);

export const IconStar = (p: P) => (
  <Base {...p}>
    <path d="m12 4.6 2.3 4.9 5.2.7-3.8 3.7 1 5.3-4.7-2.6-4.7 2.6 1-5.3L4.5 10.2l5.2-.7z" />
  </Base>
);

export const IconWave = (p: P) => (
  <Base {...p}>
    <path d="M3 12h1.8M7 8.2v7.6M10.4 5.4v13.2M13.8 9.4v5.2M17.2 7v10M20.6 11h.4" />
  </Base>
);

export const IconClock = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.2" />
    <path d="M12 7.6V12l3 1.8" />
  </Base>
);

export const IconSpeaker = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="9" r="3.4" />
    <path d="M5.4 19.4a6.8 6.8 0 0 1 13.2 0" />
  </Base>
);

export const IconPlus = (p: P) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const IconTrash = (p: P) => (
  <Base {...p}>
    <path d="M4.8 7.4h14.4M9.6 7.4V5.2h4.8v2.2M6.6 7.4l.9 11.2a1.4 1.4 0 0 0 1.4 1.2h6.2a1.4 1.4 0 0 0 1.4-1.2l.9-11.2" />
  </Base>
);

export const IconCode = (p: P) => (
  <Base {...p}>
    <path d="m8.4 8-4.2 4 4.2 4M15.6 8l4.2 4-4.2 4M13.6 5.2l-3.2 13.6" />
  </Base>
);

export const IconFilm = (p: P) => (
  <Base {...p}>
    <rect x="3" y="5" width="18" height="14" rx="1.6" />
    <path d="M7.4 5v14M16.6 5v14M3 12h18M3 8.5h4.4M3 15.5h4.4M16.6 8.5H21M16.6 15.5H21" />
  </Base>
);

export const IconSliders = (p: P) => (
  <Base {...p}>
    <path d="M4 8h9M17.5 8H20M4 16h3.5M12 16h8" />
    <circle cx="15" cy="8" r="2.2" />
    <circle cx="9.5" cy="16" r="2.2" />
  </Base>
);

export const IconArrowRight = (p: P) => (
  <Base {...p}>
    <path d="M4.5 12h14m0 0-5.2-5.2M18.5 12l-5.2 5.2" />
  </Base>
);

export const IconEye = (p: P) => (
  <Base {...p}>
    <path d="M2.8 12S6.6 5.8 12 5.8 21.2 12 21.2 12 17.4 18.2 12 18.2 2.8 12 2.8 12" />
    <circle cx="12" cy="12" r="2.8" />
  </Base>
);

export const IconEyeOff = (p: P) => (
  <Base {...p}>
    <path d="M4 4.6 20 20M9.6 9.7A2.9 2.9 0 0 0 12 14.9c.8 0 1.5-.3 2-.8" />
    <path d="M6.4 7C4.2 8.6 2.8 12 2.8 12s3.8 6.2 9.2 6.2c1.6 0 3-.4 4.2-1.1M18 15.2c2-1.5 3.2-3.2 3.2-3.2S17.4 5.8 12 5.8c-.6 0-1.2.1-1.7.2" />
  </Base>
);
