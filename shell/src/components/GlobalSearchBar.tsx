"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { useTheme } from "@/lib/use-theme";

export function GlobalSearchBar() {
  const t = useTranslations("GlobalSearch");
  const { isDark } = useTheme();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") {
        inputRef.current?.blur();
        setQuery("");
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleClear = () => {
    setQuery("");
    inputRef.current?.focus();
  };

  const borderColor = isDark ? "border-gov-300" : "border-gray-300";
  const bgColor = isDark ? "bg-gray-900/50" : "bg-gov-50";
  const hoverBorder = isDark ? "hover:border-gov-300" : "hover:border-gray-400";

  return (
    <div className="relative w-full">
      <label className="sr-only" htmlFor={inputId}>
        {t("label")}
      </label>
      <div
        className={`relative flex items-center rounded-full border-2 ${borderColor} ${bgColor} ${hoverBorder} transition-colors`}
      >
        <div className="absolute left-3 flex items-center justify-center text-gray-400 sm:left-4">
          <SearchIcon aria-hidden="true" className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>

        <input
          autoComplete="off"
          className="
      min-w-0
      flex-1
      h-12
      bg-transparent
      pl-11 pr-11
      text-sm sm:text-base
      outline-none
      placeholder:whitespace-nowrap
      placeholder:text-ellipsis
      [&::-webkit-search-cancel-button]:hidden
      [&::-webkit-search-decoration]:hidden
      [&::-webkit-search-results-button]:hidden
      [&::-webkit-search-results-decoration]:hidden
    "
          id={inputId}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("placeholder")}
          ref={inputRef}
          spellCheck={false}
          type="search"
          value={query}
        />

        {query.length > 0 && (
          <button
            aria-label={t("clear")}
            className="absolute right-2 flex h-8 w-8 items-center justify-center rounded-lg sm:right-3"
            onClick={handleClear}
            type="button"
          >
            <XIcon aria-hidden="true" className="h-4 w-4 text-gray-500" />
          </button>
        )}
      </div>
    </div>
  );
}
