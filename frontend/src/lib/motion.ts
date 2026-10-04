import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

/**
 * Hyades motion primitives.
 *
 * Deliberately dependency-free: CSS keyframes/transitions for declarative
 * state, d3-transition for SVG, and the native View Transitions API for
 * page continuity (with a CSS fallback). Everything here finishes and stops.
 */

const IS_TEST = import.meta.env.MODE === 'test';

export const MOTION = {
  press: 120,
  hover: 160,
  popover: 180,
  surfaceEnter: 240,
  surfaceExit: 160,
  page: 240,
} as const;

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Whether JS-driven decorative motion should run at all. */
export function motionEnabled(): boolean {
  return !IS_TEST && !prefersReducedMotion();
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (cb: () => void) => { finished: Promise<void> };
};

/**
 * Runs a React state update inside a native view transition when supported,
 * giving a real old→new crossfade. Falls back to a plain update.
 */
export function withViewTransition(update: () => void): void {
  const doc = typeof document !== 'undefined' ? (document as ViewTransitionDocument) : null;
  if (!doc?.startViewTransition || !motionEnabled()) {
    update();
    return;
  }
  doc.startViewTransition(() => {
    flushSync(update);
  });
}

export function supportsViewTransitions(): boolean {
  const doc = typeof document !== 'undefined' ? (document as ViewTransitionDocument) : null;
  return Boolean(doc?.startViewTransition) && motionEnabled();
}

export type PresenceState = 'open' | 'closing';

/**
 * Keeps an element mounted long enough to play its exit animation.
 * In tests / reduced motion the exit is instant, so unmounting stays synchronous.
 */
export function usePresence(isOpen: boolean, exitMs: number = MOTION.surfaceExit) {
  const instant = !motionEnabled() || exitMs <= 0;
  const [lingering, setLingering] = useState(false);
  const [prevOpen, setPrevOpen] = useState(isOpen);

  // Derive "closing" synchronously during render when isOpen flips to false.
  if (prevOpen !== isOpen) {
    setPrevOpen(isOpen);
    if (!isOpen && !instant) setLingering(true);
    if (isOpen) setLingering(false);
  }

  useEffect(() => {
    if (!lingering) return;
    const t = window.setTimeout(() => setLingering(false), exitMs);
    return () => window.clearTimeout(t);
  }, [lingering, exitMs]);

  const mounted = isOpen || lingering;
  const state: PresenceState = isOpen ? 'open' : 'closing';
  return { mounted, state };
}
