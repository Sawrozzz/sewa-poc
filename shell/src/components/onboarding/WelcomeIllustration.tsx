/** Decorative artwork for the welcome screen — no external assets. */
export function WelcomeIllustration({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 320 240">
      <defs>
        {/** biome-ignore lint/correctness/useUniqueElementIds: <SVG Gradient> */}
        <linearGradient id="wi-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.02" />
        </linearGradient>
        {/** biome-ignore lint/correctness/useUniqueElementIds: <SVG Gradient Element> */}
        <linearGradient id="wi-card" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#fff3c4" stopOpacity="0.9" />
        </linearGradient>
      </defs>

      <circle cx="160" cy="118" fill="url(#wi-sky)" r="104" />
      <circle
        cx="160"
        cy="118"
        r="104"
        stroke="#ffffff"
        strokeDasharray="4 8"
        strokeOpacity="0.25"
      />

      {/* Government building */}
      <g>
        <path d="M92 92 L160 58 L228 92 Z" fill="url(#wi-card)" />
        <rect fill="url(#wi-card)" height="8" rx="3" width="120" x="100" y="92" />
        {[110, 134, 158, 182].map((x) => (
          <rect
            fill="#ffffff"
            fillOpacity="0.85"
            height="52"
            key={x}
            rx="3"
            width="14"
            x={x}
            y="100"
          />
        ))}
        <rect fill="url(#wi-card)" height="10" rx="4" width="128" x="96" y="152" />
        <circle cx="160" cy="74" fill="#FFBE29" r="5" />
      </g>

      {/* Service tiles floating around the building */}
      <g>
        <rect fill="#ffffff" fillOpacity="0.92" height="52" rx="14" width="52" x="34" y="118" />
        <rect fill="#b87b09" height="4" rx="2" width="28" x="46" y="134" />
        <rect fill="#fadb5f" height="4" rx="2" width="20" x="46" y="144" />
        <rect fill="#fadb5f" height="4" rx="2" width="24" x="46" y="154" />

        <rect fill="#ffffff" fillOpacity="0.92" height="52" rx="14" width="52" x="234" y="102" />
        <circle cx="260" cy="122" fill="#b87b09" r="9" />
        <path d="M246 144c3-8 25-8 28 0z" fill="#fadb5f" />

        <rect fill="#ffffff" fillOpacity="0.92" height="40" rx="12" width="52" x="196" y="176" />
        <rect fill="#059669" height="5" rx="2.5" width="32" x="206" y="188" />
        <rect fill="#a7f3d0" height="5" rx="2.5" width="18" x="206" y="199" />

        <rect fill="#ffffff" fillOpacity="0.92" height="34" rx="12" width="52" x="70" y="182" />
        <circle cx="86" cy="199" fill="#FFBE29" r="7" />
        <rect fill="#fce588" height="5" rx="2.5" width="16" x="98" y="196" />
      </g>

      {/* Connecting dots */}
      <g fill="#ffffff" fillOpacity="0.55">
        <circle cx="60" cy="98" r="3" />
        <circle cx="272" cy="182" r="3" />
        <circle cx="150" cy="220" r="3" />
        <circle cx="290" cy="70" r="2" />
        <circle cx="40" cy="66" r="2" />
      </g>
    </svg>
  );
}
