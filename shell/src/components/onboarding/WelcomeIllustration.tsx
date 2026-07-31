/** Decorative artwork for the welcome screen — no external assets. */
export function WelcomeIllustration({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 240"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="wi-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="wi-card" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#fff3c4" stopOpacity="0.9" />
        </linearGradient>
      </defs>

      <circle cx="160" cy="118" r="104" fill="url(#wi-sky)" />
      <circle
        cx="160"
        cy="118"
        r="104"
        stroke="#ffffff"
        strokeOpacity="0.25"
        strokeDasharray="4 8"
      />

      {/* Government building */}
      <g>
        <path d="M92 92 L160 58 L228 92 Z" fill="url(#wi-card)" />
        <rect x="100" y="92" width="120" height="8" rx="3" fill="url(#wi-card)" />
        {[110, 134, 158, 182].map((x) => (
          <rect
            key={x}
            x={x}
            y="100"
            width="14"
            height="52"
            rx="3"
            fill="#ffffff"
            fillOpacity="0.85"
          />
        ))}
        <rect x="96" y="152" width="128" height="10" rx="4" fill="url(#wi-card)" />
        <circle cx="160" cy="74" r="5" fill="#FFBE29" />
      </g>

      {/* Service tiles floating around the building */}
      <g>
        <rect x="34" y="118" width="52" height="52" rx="14" fill="#ffffff" fillOpacity="0.92" />
        <rect x="46" y="134" width="28" height="4" rx="2" fill="#b87b09" />
        <rect x="46" y="144" width="20" height="4" rx="2" fill="#fadb5f" />
        <rect x="46" y="154" width="24" height="4" rx="2" fill="#fadb5f" />

        <rect x="234" y="102" width="52" height="52" rx="14" fill="#ffffff" fillOpacity="0.92" />
        <circle cx="260" cy="122" r="9" fill="#b87b09" />
        <path d="M246 144c3-8 25-8 28 0z" fill="#fadb5f" />

        <rect x="196" y="176" width="52" height="40" rx="12" fill="#ffffff" fillOpacity="0.92" />
        <rect x="206" y="188" width="32" height="5" rx="2.5" fill="#059669" />
        <rect x="206" y="199" width="18" height="5" rx="2.5" fill="#a7f3d0" />

        <rect x="70" y="182" width="52" height="34" rx="12" fill="#ffffff" fillOpacity="0.92" />
        <circle cx="86" cy="199" r="7" fill="#FFBE29" />
        <rect x="98" y="196" width="16" height="5" rx="2.5" fill="#fce588" />
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
