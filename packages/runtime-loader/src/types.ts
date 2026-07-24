/**
 * Type definitions for the Runtime Loader package.
 * Defines all interfaces and types used across the loader, cache, and utility modules.
 */

import type { RemoteLoadResult, PluginServices } from "@sewa/platform-contracts";
import type { PluginCacheDB } from "./cache";

/**
 * Specification for a mini-app bundle to be loaded.
 * Used to identify and locate bundle resources.
 */
export interface BundleSpec {
  /** Unique identifier for the mini-app */
  id: string;
  /** URL where the bundle files are located */
  bundleUrl: string;
  /** Optional version string for cache invalidation */
  version?: string;
}

/**
 * Runtime context passed to mini-apps during mounting.
 * Contains SDK bridge and configuration.
 */
export interface MiniAppRuntime {
  /** Shell services available to the mini-app */
  services?: PluginServices;
  /** Configuration object */
  config?: Record<string, unknown>;
}

/**
 * Interface for a loaded mini-app module's exports.
 * Mini-apps must export mount() and optionally unmount().
 */
export interface MiniAppModuleExports {
  /** Mount the mini-app into a container */
  mount: (container: HTMLElement, props?: MiniAppRuntime) => void;
  /** Unmount the mini-app and clean up resources */
  unmount?: (container: HTMLElement) => void;
}

/**
 * Configuration options for the RuntimeLoader.
 * Controls behavior of loading, caching, and error handling.
 */
export interface RuntimeLoaderOptions {
  /** Callback when a module starts loading */
  onLoadStart?: (moduleId: string) => void;
  /** Callback when a module finishes loading successfully */
  onLoadComplete?: (result: RemoteLoadResult) => void;
  /** Callback when a module fails to load */
  onLoadError?: (moduleId: string, error: string) => void;
  /** Custom fetch function for HTTP requests (default: global fetch) */
  fetcher?: typeof fetch;
  /** Custom cache database instance (default: new PluginCacheDB) */
  db?: PluginCacheDB;
  /** Maximum number of mini-app bundles to keep in cache (FIFO eviction). Default: 1 */
  maxModules?: number;
  /** If true, validate signature field in manifest.json before downloading. Default: false */
  signatureRequired?: boolean;
}

/**
 * Interface for a loaded mini-app bundle.
 * Provides mount and unmount lifecycle methods.
 */
export interface MiniAppBundle {
  /** Mount the mini-app into a DOM container */
  mount: (container: HTMLElement, props?: MiniAppRuntime) => void;
  /** Unmount the mini-app and clean up resources */
  unmount: (container: HTMLElement) => void;
}

/**
 * Represents a loaded module in the runtime.
 * Tracks module metadata and lifecycle state.
 */
export interface LoadedModule {
  /** Unique identifier for the module */
  moduleId: string;
  /** Loading strategy used (currently only "plugin") */
  strategy: "plugin";
  /** The loaded bundle with mount/unmount methods */
  bundle: MiniAppBundle;
  /** Version of the loaded module */
  version?: string;
  /** Timestamp when the module was loaded */
  loadedAt: number;
  /** How to mount the module into the DOM */
  mountMode: MountMode;
}

/**
 * Entry in a Vite manifest.json file.
 * Describes a single asset file and its dependencies.
 */
export interface ViteManifestEntry {
  /** Filename of the asset */
  file: string;
  /** Optional name for the chunk */
  name?: string;
  /** Source file path (for non-entry chunks) */
  src?: string;
  /** Whether this is an entry point */
  isEntry?: boolean;
  /** CSS files imported by this entry */
  css?: string[];
  /** Synchronous imports */
  imports?: string[];
  /** Dynamic imports (code splitting) */
  dynamicImports?: string[];
  /** Framework hint (e.g., "react", "vue") */
  framework?: string;
}

/**
 * Vite manifest.json structure.
 * Maps chunk names to their manifest entries.
 */
export interface ViteManifest {
  [key: string]: ViteManifestEntry;
}

/**
 * Cached file entry in IndexedDB.
 * Stores file content with metadata.
 */
export interface CachedFile {
  /** Composite key: "moduleId/fileName" */
  fileKey: string;
  /** File content as string */
  data: string;
  /** Timestamp when the file was cached */
  cachedAt: number;
}

/**
 * Cache order entry in IndexedDB.
 * Tracks module access order for FIFO eviction.
 */
export interface CacheOrder {
  /** Special key for the order entry */
  fileKey: "__cache-order__";
  /** Ordered list of module IDs (oldest first) */
  data: string[];
  /** Timestamp when the order was last updated */
  cachedAt: number;
}

/**
 * How to mount a mini-app into the shell's DOM.
 * - 'dom': Mount directly into a regular DOM element
 * - 'shadow': Mount inside a Shadow DOM for style isolation
 * - 'portal': Mount using React Portal (future use)
 */
export type MountMode = 'dom' | 'shadow' | 'portal';
