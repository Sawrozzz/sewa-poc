import type React from "react";

type LoaderVariant = "spinner" | "dots" | "pulse";
type LoaderSize = "sm" | "md" | "lg" | "xl";

interface LoaderProps {
  variant?: LoaderVariant;
  size?: LoaderSize;
  color?: string; // Tailwind color class, e.g., 'text-indigo-600' or 'bg-indigo-600'
  label?: string;
  className?: string;
}

const sizeMap: Record<LoaderSize, { container: string; dot: string }> = {
  sm: { container: "w-4 h-4", dot: "w-1.5 h-1.5" },
  md: { container: "w-8 h-8", dot: "w-2.5 h-2.5" },
  lg: { container: "w-12 h-12", dot: "w-3.5 h-3.5" },
  xl: { container: "w-16 h-16", dot: "w-4 h-4" },
};

export const Loader: React.FC<LoaderProps> = ({
  variant = "spinner",
  size = "md",
  color = "text-blue-600",
  label,
  className = "",
}) => {
  const { container, dot } = sizeMap[size];

  // Derive bg color for dots/pulse if a text color class is provided
  const bgColor = color.startsWith("text-") ? color.replace("text-", "bg-") : color;

  return (
    <div className={`inline-flex flex-col items-center justify-center gap-2 ${className}`}>
      {/* 1. Circular Spinner */}
      {variant === "spinner" && (
        <svg
          aria-label="Loading"
          className={`animate-spin ${container} ${color}`}
          fill="none"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            fill="currentColor"
          />
        </svg>
      )}

      {/* 2. Bouncing Dots */}
      {variant === "dots" && (
        <div className="flex items-center space-x-1.5">
          <div
            className={`${dot} ${bgColor} rounded-full animate-bounce [animation-delay:-0.3s]`}
          />
          <div
            className={`${dot} ${bgColor} rounded-full animate-bounce [animation-delay:-0.15s]`}
          />
          <div className={`${dot} ${bgColor} rounded-full animate-bounce`} />
        </div>
      )}

      {/* 3. Pulsing Ring */}
      {variant === "pulse" && (
        <div className={`relative ${container} flex items-center justify-center`}>
          <span
            className={`absolute inline-flex h-full w-full rounded-full ${bgColor} opacity-75 animate-ping`}
          />
          <span className={`relative inline-flex rounded-full ${container} ${bgColor}`} />
        </div>
      )}

      {/* Optional Label */}
      {label && (
        <span className="text-sm font-medium text-gray-600 dark:text-gray-300">{label}</span>
      )}
    </div>
  );
};

export default Loader;
