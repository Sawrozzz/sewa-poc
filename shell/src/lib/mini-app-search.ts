import type { ModuleManifest } from '@sewa/host-platform';

/**
 * Keyword search over the mini app registry.
 *
 * A manifest never spells out what people actually type. The React mini app is
 * called "Test Mini App" and only declares `react` in
 * `compatibility.supportedFrameworks`, so the framework matrix has to be part of
 * the index — and it has to tolerate the spellings users reach for ("reactjs",
 * "vue.js", and the "veu" spelling already used in the registry).
 */

export type MatchKind = 'name' | 'id' | 'framework' | 'category' | 'vendor' | 'capability' | 'description';

export interface SearchHit {
  module: ModuleManifest;
  score: number;
  /** Field that produced the strongest match — rendered as a chip in the suggestion row */
  matchedOn: MatchKind;
  /** The literal text of that field, e.g. "react" for a framework match */
  matchedText: string;
}

interface IndexedField {
  kind: MatchKind;
  /** Lowercased text the query is compared against */
  text: string;
  /** Original casing, shown to the user */
  label: string;
  weight: number;
}

const FIELD_WEIGHTS: Record<MatchKind, number> = {
  name: 10,
  id: 8,
  framework: 7,
  category: 5,
  vendor: 4,
  capability: 3,
  description: 2,
};

interface FrameworkKeywords {
  /** Ways users spell this exact framework */
  spellings: string[];
  /** Adjacent technologies — a Next app is worth showing for "react", but never above the React app */
  related: string[];
}

const FRAMEWORK_KEYWORDS: Record<string, FrameworkKeywords> = {
  react: { spellings: ['react', 'reactjs', 'react.js', 'jsx'], related: ['spa'] },
  next: { spellings: ['next', 'nextjs', 'next.js'], related: ['react', 'ssr'] },
  vue: { spellings: ['vue', 'vuejs', 'vue.js', 'veu'], related: [] },
  nuxt: { spellings: ['nuxt', 'nuxtjs', 'nuxt.js'], related: ['vue', 'ssr'] },
  angular: { spellings: ['angular', 'angularjs', 'angular.js', 'ng'], related: [] },
  solid: { spellings: ['solid', 'solidjs', 'solid.js'], related: [] },
  svelte: { spellings: ['svelte', 'sveltejs', 'svelte.js', 'sveltekit'], related: [] },
};

const RELATED_FRAMEWORK_WEIGHT = 0.4;

function frameworksOf(manifest: ModuleManifest): string[] {
  return manifest.compatibility?.supportedFrameworks ?? [];
}

function indexModule(manifest: ModuleManifest): IndexedField[] {
  const fields: IndexedField[] = [
    { kind: 'name', text: manifest.name.toLowerCase(), label: manifest.name, weight: FIELD_WEIGHTS.name },
    { kind: 'id', text: manifest.id.toLowerCase().replace(/-/g, ' '), label: manifest.id, weight: FIELD_WEIGHTS.id },
    {
      kind: 'category',
      text: manifest.category.toLowerCase(),
      label: manifest.category,
      weight: FIELD_WEIGHTS.category,
    },
    { kind: 'vendor', text: manifest.vendor.toLowerCase(), label: manifest.vendor, weight: FIELD_WEIGHTS.vendor },
    {
      kind: 'description',
      text: manifest.description.toLowerCase(),
      label: manifest.description,
      weight: FIELD_WEIGHTS.description,
    },
  ];

  for (const framework of frameworksOf(manifest)) {
    const keywords = FRAMEWORK_KEYWORDS[framework] ?? { spellings: [framework], related: [] };

    for (const spelling of keywords.spellings) {
      fields.push({ kind: 'framework', text: spelling, label: framework, weight: FIELD_WEIGHTS.framework });
    }

    for (const related of keywords.related) {
      fields.push({
        kind: 'framework',
        text: related,
        label: framework,
        weight: FIELD_WEIGHTS.framework * RELATED_FRAMEWORK_WEIGHT,
      });
    }
  }

  for (const capability of manifest.capabilities ?? []) {
    fields.push({
      kind: 'capability',
      text: capability.toLowerCase(),
      label: capability,
      weight: FIELD_WEIGHTS.capability,
    });
  }

  return fields;
}

/** True when `a` and `b` differ by at most one insertion, deletion or substitution. */
function isNearMatch(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;

  let i = 0;
  let j = 0;
  let edits = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }

    edits += 1;
    if (edits > 1) return false;

    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }

  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** 0 when the term does not match the field at all; higher is a better match. */
function scoreField(field: IndexedField, term: string): number {
  if (field.text === term) return field.weight * 4;
  if (field.text.startsWith(term)) return field.weight * 3;

  const words = field.text.split(/[\s\-_.]+/);
  if (words.some((word) => word.startsWith(term))) return field.weight * 2.5;
  if (field.text.includes(term)) return field.weight * 1.5;

  // Typo tolerance, but only for terms long enough that a single edit is not
  // ambiguous — "api" vs "app" should stay distinct.
  if (term.length >= 4 && words.some((word) => isNearMatch(word, term))) return field.weight;

  return 0;
}

export function searchMiniApps(modules: ModuleManifest[], rawQuery: string, limit = 8): SearchHit[] {
  const terms = rawQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const hits: SearchHit[] = [];

  for (const manifest of modules) {
    const fields = indexModule(manifest);

    let total = 0;
    let best: { score: number; field: IndexedField } | null = null;
    let matchedEveryTerm = true;

    for (const term of terms) {
      let termBest: { score: number; field: IndexedField } | null = null;

      for (const field of fields) {
        const score = scoreField(field, term);
        if (score > 0 && (!termBest || score > termBest.score)) termBest = { score, field };
      }

      if (!termBest) {
        matchedEveryTerm = false;
        break;
      }

      total += termBest.score;
      if (!best || termBest.score > best.score) best = termBest;
    }

    if (!matchedEveryTerm || !best) continue;

    hits.push({ module: manifest, score: total, matchedOn: best.field.kind, matchedText: best.field.label });
  }

  return hits
    .sort((a, b) => b.score - a.score || a.module.order - b.module.order || a.module.name.localeCompare(b.module.name))
    .slice(0, limit);
}

/** Frameworks actually present in the registry, offered as one-click queries. */
export function suggestedKeywords(modules: ModuleManifest[], limit = 8): string[] {
  const seen = new Set<string>();

  for (const manifest of modules) {
    for (const framework of frameworksOf(manifest)) seen.add(framework);
  }

  return [...seen].slice(0, limit);
}

/** Merge registry sources, keeping the first manifest seen for a given id. */
export function dedupeModules(...sources: (ModuleManifest[] | undefined)[]): ModuleManifest[] {
  const byId = new Map<string, ModuleManifest>();

  for (const source of sources) {
    for (const manifest of source ?? []) {
      if (!byId.has(manifest.id)) byId.set(manifest.id, manifest);
    }
  }

  return [...byId.values()];
}

export function miniAppAnchorId(moduleId: string): string {
  return `mini-app-${moduleId}`;
}

/**
 * Scroll the card for `moduleId` into view and flash it. Returns false when the
 * card is not on the current page, so callers can navigate instead.
 */
export function scrollToMiniApp(moduleId: string): boolean {
  const card = document.getElementById(miniAppAnchorId(moduleId));
  if (!card) return false;

  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.remove('mini-app-highlight');
  // Force a reflow so re-selecting the same card restarts the animation.
  void card.offsetWidth;
  card.classList.add('mini-app-highlight');

  window.setTimeout(() => card.classList.remove('mini-app-highlight'), 2200);

  return true;
}
