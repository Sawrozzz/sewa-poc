'use client';

import { PLATFORM_EVENTS } from '@sewa/host-platform';
import { useCallback, useEffect, useRef } from 'react';

import { usePlatform } from './PlatformProvider';

/**
 * Marker stored on the sentinel history entry this hook pushes.
 *
 * The browser gives no way to cancel a back press, so the shell keeps one
 * extra entry on the stack while a mini app is mounted. A back press pops
 * that entry instead of leaving the page, which buys the shell the moment it
 * needs to ask the mini app whether it wants the press. If the mini app takes
 * it, the sentinel is pushed straight back and nothing visible happened.
 */
const BACK_TRAP_KEY = '__sewaMiniAppBackTrap';

type HistoryState = Record<string, unknown> | null;

export interface UseMiniAppBackButtonOptions {
  /**
   * Called when the mini app declines the press — it has no route left to
   * pop, so leaving the container is the shell's job.
   */
  onExit: () => void;
  /** Skip while the mini app hasn't mounted yet. */
  enabled?: boolean;
}

/**
 * Routes the browser back button through the mounted mini app first.
 *
 * ```
 * back press -> sentinel pops -> shell publishes navigation.back.requested
 *            -> mini app answers navigation.back(consumed)
 *                 consumed: true  -> re-arm, stay on the page
 *                 consumed: false -> onExit(), leave the container
 * ```
 *
 * A mini app that never reports history (an older bundle, or one that simply
 * hasn't navigated) answers nothing at all: `requestBack()` resolves `false`
 * without a round trip and the back press behaves exactly as it always did.
 */
export function useMiniAppBackButton({ onExit, enabled = true }: UseMiniAppBackButtonOptions) {
  const { services, eventBus } = usePlatform();

  console.log('EVNT', eventBus)
  const onExitRef = useRef(onExit);

  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);

  const armTrap = useCallback(() => {
    const state = window.history.state as HistoryState;
    if (state?.[BACK_TRAP_KEY]) return;
    // Next's own router state rides along untouched — clobbering it breaks
    // the app router's subsequent navigations.
    window.history.pushState({ ...state, [BACK_TRAP_KEY]: true }, '', window.location.href);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const navigation = services.navigation;

    // The mini app's own router reports where it is on every move; that's
    // what tells the shell whether the next press is worth asking about.
    const unsubscribeRouteChanged = eventBus.subscribe(
      PLATFORM_EVENTS.NAVIGATION_CHANGED,
      (event) => {
        if (event.source === 'shell') return;
        const payload = event.payload as { canGoBack?: boolean } | undefined;
        if (typeof payload?.canGoBack === 'boolean') {
          navigation.setCanGoBack(payload.canGoBack);
        }
      },
    );

    const handlePopState = () => {
      // Still armed, so this pop was somebody else's (a shell route change,
      // a double press already handled) — leave it alone.
      if ((window.history.state as HistoryState)?.[BACK_TRAP_KEY]) return;

      void navigation.requestBack().then((consumed) => {
        if (consumed) armTrap();
        else onExitRef.current();
      });
    };

    armTrap();
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      unsubscribeRouteChanged();
      navigation.resetRouter();
    };
  }, [enabled, services, eventBus, armTrap]);
}
