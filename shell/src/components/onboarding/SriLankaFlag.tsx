/** Simplified Sri Lankan flag used as the phone-number country prefix. */
export function SriLankaFlag({ className = "h-4 w-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 30 20"
      className={className}
      role="img"
      aria-label="Sri Lanka"
    >
      <rect width="30" height="20" rx="2" fill="#FFBE29" />
      <rect x="2" y="2" width="4" height="16" fill="#00534E" />
      <rect x="6.5" y="2" width="4" height="16" fill="#EB7400" />
      <rect x="11.5" y="2" width="16.5" height="16" fill="#8D153A" />
      {/* Lion + bo leaves, reduced to legible silhouettes at this size */}
      <g fill="#FFBE29">
        <circle cx="13.6" cy="4" r="1" />
        <circle cx="13.6" cy="16" r="1" />
        <circle cx="26" cy="4" r="1" />
        <circle cx="26" cy="16" r="1" />
        <path d="M18.4 6.2c1.5-.6 3 .2 3.4 1.6.3 1.1 0 2.3-.5 3.4-.4.9-.5 1.8-.2 2.7l-1.3.4c-.5-1.2-.4-2.4 0-3.5.3-.8.5-1.6.3-2.3-.2-.7-.9-1-1.7-.7l-.4-1.2z" />
        <rect x="22.4" y="5.4" width="0.7" height="6.4" rx="0.35" />
      </g>
    </svg>
  );
}
