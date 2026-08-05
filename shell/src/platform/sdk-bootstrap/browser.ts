import {
  bootstrapMiniAppSdk,
  destroySdkInstance,
} from "./core.ts";
import type {
  MiniAppSdkHostOptions,
  MiniAppSdkLoadResult,
} from "./types.ts";

/**
 * Browser adapters for the Mini App SDK bootstrap. These are the only pieces
 * that touch the DOM (`document` / `window` globals); the pure logic lives in
 * `core.ts` and is unit-tested without a browser.
 */

/**
 * Injects the SDK `<script>` and resolves when it has executed. A bundle that
 * throws *during evaluation* still fires the script `load` event, so an
 * uncaught-exception trap (`window` `error` events) is used to reject instead
 * of letting a silently-broken bundle through.
 */
function loadBrowserScript(source: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (run: () => void) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("error", onEvalError);
      run();
    };
    const onEvalError = (event: Event) => {
      // Resource load failures surface as plain `Event`s; uncaught exceptions
      // are `ErrorEvent`s. Only the latter indicate a broken bundle.
      if (!(event instanceof ErrorEvent)) return;
      settle(() =>
        reject(
          new Error(`SDK bundle threw during evaluation: ${event.message}`),
        ),
      );
    };
    window.addEventListener("error", onEvalError);
    const script = document.createElement("script");
    script.src = source;
    script.async = true;
    script.onload = () => settle(resolve);
    script.onerror = () =>
      settle(() => reject(new Error(`Failed to load SDK from ${source}`)));
    document.head.appendChild(script);
  });
}

/** Browser entry point: ensures a live, initialized SDK instance. */
export function loadMiniAppSdk(
  miniAppId: string,
  options: MiniAppSdkHostOptions = {},
): Promise<MiniAppSdkLoadResult> {
  return bootstrapMiniAppSdk(miniAppId, options, {
    window,
    loadScript: loadBrowserScript,
    now: () => performance.now(),
  });
}

/** Tears down the live SDK instance (no-op when none is present). */
export function destroyMiniAppSdk(): void {
  destroySdkInstance(window);
}
