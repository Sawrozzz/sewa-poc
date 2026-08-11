"use client";

import { Crosshair, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SearchHit } from "@/lib/mini-app-search";
import {
  dedupeModules,
  scrollToMiniApp,
  searchMiniApps,
  suggestedKeywords,
} from "@/lib/mini-app-search";
import { useFallbackMiniApps, useMiniApps } from "@/lib/use-mini-apps";

const MATCH_LABELS: Record<SearchHit["matchedOn"], string> = {
  name: "name",
  id: "id",
  framework: "framework",
  category: "category",
  vendor: "vendor",
  capability: "capability",
  description: "description",
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return <>{text}</>;

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "ig");
  const lowered = new Set(terms.map((term) => term.toLowerCase()));

  return (
    <>
      {text.split(pattern).map((part) =>
        lowered.has(part.toLowerCase()) ? (
          <mark className="bg-gov-200/70 text-gov-950 rounded-sm px-0.5" key={part}>
            {part}
          </mark>
        ) : (
          <span key={part}>{part}</span>
        ),
      )}
    </>
  );
}

export function GlobalSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const fallbackModules = useFallbackMiniApps();
  const { data: apiModules } = useMiniApps();

  const modules = useMemo(
    () => dedupeModules(fallbackModules, apiModules),
    [fallbackModules, apiModules],
  );

  const hits = useMemo(() => searchMiniApps(modules, query), [modules, query]);
  const keywords = useMemo(() => suggestedKeywords(modules), [modules]);
  const terms = useMemo(() => query.toLowerCase().trim().split(/\s+/).filter(Boolean), [query]);

  const showPanel = isOpen && (terms.length > 0 || keywords.length > 0);

  const updateQuery = (value: string) => {
    setQuery(value);
    setActiveIndex(0);
  };

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const close = () => {
    setIsOpen(false);
    inputRef.current?.blur();
  };

  /** Open the mini app, falling back to a scroll when it is already on screen is not desired here. */
  const openMiniApp = (hit: SearchHit) => {
    close();
    router.push(`/${hit.module.id}`);
  };

  /** Reveal the card in the grid instead of leaving the page. */
  const locateMiniApp = (hit: SearchHit) => {
    close();
    if (!scrollToMiniApp(hit.module.id)) router.push(`/${hit.module.id}`);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      if (query) updateQuery("");
      else close();
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (hits.length === 0) return;
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => {
        const next = event.key === "ArrowDown" ? current + 1 : current - 1;
        return (next + hits.length) % hits.length;
      });
      return;
    }

    if (event.key === "Enter") {
      const hit = hits[activeIndex];
      if (!hit) return;
      event.preventDefault();
      if (event.shiftKey) locateMiniApp(hit);
      else openMiniApp(hit);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />

      <input
        aria-activedescendant={
          hits[activeIndex] ? `global-search-option-${hits[activeIndex].module.id}` : undefined
        }
        aria-autocomplete="list"
        aria-controls="global-search-results"
        aria-expanded={showPanel}
        className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-24 text-sm shadow-sm outline-none transition-all duration-200 placeholder:text-gray-400 focus:ring-4 focus:ring-gov-100"
        onChange={(event) => {
          updateQuery(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Search services by name, framework or capability…"
        ref={inputRef}
        role="combobox"
        type="text"
        value={query}
      />

      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
        {!!query && (
          <button
            aria-label="Clear search"
            className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            onClick={() => {
              updateQuery("");
              inputRef.current?.focus();
            }}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <kbd className="hidden rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[10px] text-gray-400 sm:block">
          ⌘K
        </kbd>
      </div>

      {!!showPanel && (
        <div
          className="animate-fade-in absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl shadow-gray-900/5"
          id="global-search-results"
          role="listbox"
        >
          {terms.length === 0 ? (
            <div className="p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Try a framework
              </p>
              <div className="flex flex-wrap gap-2">
                {keywords.map((keyword) => (
                  <button
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-gov-400 hover:bg-gov-50 hover:text-gov-800"
                    key={keyword}
                    onClick={() => {
                      updateQuery(keyword);
                      inputRef.current?.focus();
                    }}
                    type="button"
                  >
                    {keyword}
                  </button>
                ))}
              </div>
            </div>
          ) : hits.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <div className="mb-2 text-3xl">🔍</div>
              <p className="text-sm font-medium text-gray-900">
                No services match “{query.trim()}”
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Search by name, framework (react, vue, angular…), category or capability.
              </p>
            </div>
          ) : (
            <>
              <ul className="max-h-[min(60vh,26rem)] overflow-y-auto py-1">
                {hits.map((hit, index) => (
                  <li key={hit.module.id}>
                    <div
                      aria-selected={index === activeIndex}
                      className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${
                        index === activeIndex ? "bg-gov-50" : "bg-white"
                      }`}
                      id={`global-search-option-${hit.module.id}`}
                      onMouseEnter={() => setActiveIndex(index)}
                      role="option"
                    >
                      <button
                        className="flex flex-1 items-center gap-3 text-left"
                        onClick={() => openMiniApp(hit)}
                        type="button"
                      >
                        <span
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl"
                          style={{ backgroundColor: `${hit.module.color}18` }}
                        >
                          {hit.module.icon}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-gray-900">
                              <Highlight terms={terms} text={hit.module.name} />
                            </span>
                            {hit.matchedOn !== "name" && (
                              <span className="shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                                {MATCH_LABELS[hit.matchedOn]}: {hit.matchedText}
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-gray-500">
                            {hit.module.description || hit.module.category}
                          </span>
                        </span>
                      </button>

                      <button
                        aria-label={`Show ${hit.module.name} in the grid`}
                        className="shrink-0 rounded-lg p-2 text-gray-400 transition hover:bg-white hover:text-gov-700"
                        onClick={() => locateMiniApp(hit)}
                        title="Show this service in the grid"
                        type="button"
                      >
                        <Crosshair className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/70 px-3 py-2 text-[11px] text-gray-400">
                <span>
                  {hits.length} {hits.length === 1 ? "service" : "services"}
                </span>
                <span className="hidden sm:block">
                  ↑↓ navigate · ↵ open · ⇧↵ show in grid · esc close
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
