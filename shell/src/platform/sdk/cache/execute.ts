/**
 * The only file in `sdk-cache` that touches the DOM.
 *
 * Both entry points share one guarantee: a bundle that throws *during
 * evaluation* still fires the script `load` event, so an uncaught-exception
 * trap on `window` is what actually distinguishes a broken bundle from a good
 * one. That is true of blob-URL scripts exactly as it is of CDN ones — the
 * logic is lifted from `sdk/bootstrap/browser.ts`, not reinvented.
 */

/** Injects a `<script>` and resolves once it has evaluated without throwing. */
function injectAndWait(
  configure: (script: HTMLScriptElement) => void,
  describe: string,
  cleanup?: () => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (run: () => void) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('error', onEvalError);
      cleanup?.();
      run();
    };
    const onEvalError = (event: Event) => {
      // Resource load failures surface as plain `Event`s; uncaught exceptions
      // are `ErrorEvent`s. Only the latter indicate a broken bundle.
      if (!(event instanceof ErrorEvent)) return;
      settle(() => reject(new Error(`SDK bundle threw during evaluation: ${event.message}`)));
    };

    window.addEventListener('error', onEvalError);
    const script = document.createElement('script');
    script.async = true;
    configure(script);
    script.onload = () => settle(resolve);
    script.onerror = () => settle(() => reject(new Error(`Failed to load SDK from ${describe}`)));
    document.head.appendChild(script);
  });
}

export interface InjectScriptOptions {
  src: string;
  /** SRI digest. Requires `crossorigin` on cross-origin sources. */
  integrity?: string;
}

/**
 * Network path: a plain `<script src>`, with `integrity` when a digest is
 * pinned. `crossOrigin` is mandatory alongside `integrity` for a cross-origin
 * script — without it the browser refuses the resource outright.
 */
export function injectScript({ src, integrity }: InjectScriptOptions): Promise<void> {
  return injectAndWait((script) => {
    script.src = src;
    if (integrity) {
      script.integrity = integrity;
      script.crossOrigin = 'anonymous';
    }
  }, src);
}

/**
 * Cache path: execute bytes already held in memory.
 *
 * Requires `script-src blob:` if a CSP is ever added to the shell — the same
 * trade `RuntimeLoader.evaluateModule` already makes for mini-app bundles.
 * The object URL is revoked as soon as the script settles; by then the bytes
 * have been fetched and evaluated, so nothing else needs it.
 */
export function injectBlobScript(blob: Blob): Promise<void> {
  const blobUrl = URL.createObjectURL(blob);
  return injectAndWait(
    (script) => {
      script.src = blobUrl;
    },
    'cached bundle',
    () => URL.revokeObjectURL(blobUrl),
  );
}
