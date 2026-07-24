/**
 * Utility functions for the Runtime Loader package.
 * Provides framework-agnostic mounting/unmounting with Shadow DOM support.
 */

import type { MiniAppModuleExports, MiniAppRuntime, MountMode } from "./types";

/**
 * Universal mount function that works with any framework.
 * 
 * Validates that the module exports a mount() function, then calls it
 * with the provided container and runtime context. This allows mini-apps
 * built with React, Vue, Angular, or any other framework to be mounted
 * uniformly through the same interface.
 * 
 * @param moduleExports - The evaluated module exports (must have mount())
 * @param container - DOM element to mount the mini-app into
 * @param runtime - Optional runtime context (SDK bridge, config, etc.)
 * @returns The result of the mount function
 * @throws Error if module does not export a mount() function
 * 
 * @example
 * ```typescript
 * // For React mini-app
 * const module = await import('https://cdn.example.com/mini-app.js');
 * mountModule(module, document.getElementById('root'), { services, config });
 * ```
 */
export function mountModule(
  moduleExports: MiniAppModuleExports,
  container: HTMLElement,
  runtime?: MiniAppRuntime
) {
  if (typeof moduleExports.mount !== 'function') {
    throw new Error(
      `Module must export mount(container, runtime) function. ` +
      `Received exports: ${Object.keys(moduleExports).join(', ') || '(none)'}`
    );
  }
  return moduleExports.mount(container, runtime);
}

/**
 * Universal unmount function that safely cleans up a mini-app.
 * 
 * Checks if the module exports an unmount() function before calling it.
 * This is optional for mini-apps - if they don't export unmount(),
 * this function silently does nothing.
 * 
 * @param moduleExports - The evaluated module exports
 * @param container - DOM element to unmount from
 * 
 * @example
 * ```typescript
 * // Clean up when navigating away
 * unmountModule(loadedModule, container);
 * ```
 */
export function unmountModule(
  moduleExports: MiniAppModuleExports,
  container: HTMLElement
) {
  if (typeof moduleExports.unmount === 'function') {
    moduleExports.unmount(container);
  }
}

/**
 * Mount a mini-app with optional Shadow DOM isolation.
 * 
 * Creates a Shadow DOM root if mountMode is 'shadow', providing style
 * isolation for the mini-app. This prevents CSS conflicts between
 * the host application and mini-apps, or between multiple mini-apps.
 * 
 * @param moduleExports - The evaluated module exports
 * @param container - DOM element to mount into
 * @param mountMode - How to mount: 'dom' (regular) or 'shadow' (isolated)
 * @param runtime - Optional runtime context (SDK, config)
 * @returns Object with container reference and cleanup function
 * 
 * @example
 * ```typescript
 * // Mount with Shadow DOM isolation
 * const { container, cleanup } = mountWithIsolation(
 *   module,
 *   document.getElementById('app'),
 *   'shadow',
 *   { services, config }
 * );
 * 
 * // Later, clean up
 * cleanup();
 * ```
 */
export function mountWithIsolation(
  moduleExports: MiniAppModuleExports,
  container: HTMLElement,
  mountMode: MountMode,
  runtime?: MiniAppRuntime
): { container: HTMLElement; cleanup: () => void } {
  // If shadow mode, create shadow root for isolation
  if (mountMode === 'shadow') {
    // Reuse existing shadow root or create new one
    const shadow = container.shadowRoot ?? container.attachShadow({ mode: 'open' });
    shadow.innerHTML = '';
    
    // Create inner container inside shadow root
    const innerContainer = document.createElement('div');
    innerContainer.setAttribute('data-mini-app-container', 'true');
    shadow.appendChild(innerContainer);
    
    // Mount the mini-app inside the shadow DOM
    mountModule(moduleExports, innerContainer, runtime);
    
    return {
      container: innerContainer,
      cleanup: () => {
        unmountModule(moduleExports, innerContainer);
        shadow.innerHTML = '';
      },
    };
  }
  
  // Default: mount directly into the container (no isolation)
  mountModule(moduleExports, container, runtime);
  
  return {
    container,
    cleanup: () => {
      unmountModule(moduleExports, container);
    },
  };
}

/**
 * Create a promise that resolves after a specified delay.
 * Used for retry logic with exponential backoff.
 * 
 * @param ms - Milliseconds to wait
 * @returns Promise that resolves after the delay
 * 
 * @example
 * ```typescript
 * // Wait 1 second before retrying
 * await delay(1000);
 * 
 * // Exponential backoff: delay * (attempt + 1)
 * await delay(1000 * (attempt + 1));
 * ```
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract file name from a URL path.
 * Handles both absolute and relative URLs.
 * 
 * @param url - URL to extract file name from
 * @returns The file name portion of the URL
 * 
 * @example
 * ```typescript
 * getFileName('https://cdn.example.com/path/to/bundle.js'); // => 'bundle.js'
 * getFileName('/assets/style.css'); // => 'style.css'
 * ```
 */
export function getFileName(url: string): string {
  const parts = url.split('/');
  return parts[parts.length - 1] || parts[parts.length - 2] || 'unknown';
}

/**
 * Normalize a base URL by removing trailing slash.
 * Ensures consistent URL construction.
 * 
 * @param url - URL to normalize
 * @returns URL without trailing slash
 * 
 * @example
 * ```typescript
 * normalizeBaseUrl('https://cdn.example.com/path/'); 
 * // => 'https://cdn.example.com/path'
 * ```
 */
export function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
