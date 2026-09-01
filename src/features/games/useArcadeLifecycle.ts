import { onCleanup, onMount } from "solid-js";
import { stopChineseSpeech } from "../audio/speech";

interface ArcadeLifecycleOptions {
  isPlaying: () => boolean;
  isPaused: () => boolean;
  pause: (reason: "background" | "pagehide") => void;
  refresh?: () => void;
}

/**
 * Mobile-safe lifecycle guard for realtime games.
 * Hidden/background tabs are paused and never auto-resumed: the player must
 * explicitly resume, so they never lose a life while switching apps.
 */
export function useArcadeLifecycle(options: ArcadeLifecycleOptions) {
  let resizeTimer = 0;

  const pauseIfNeeded = (reason: "background" | "pagehide") => {
    if (!options.isPlaying() || options.isPaused()) return;
    stopChineseSpeech();
    options.pause(reason);
  };

  const visibility = () => {
    if (document.hidden) pauseIfNeeded("background");
  };
  const pagehide = () => pauseIfNeeded("pagehide");
  const refresh = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => options.refresh?.(), 100);
  };

  onMount(() => {
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pagehide);
    window.addEventListener("resize", refresh, { passive: true });
    window.addEventListener("orientationchange", refresh, { passive: true });
  });
  onCleanup(() => {
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("pagehide", pagehide);
    window.removeEventListener("resize", refresh);
    window.removeEventListener("orientationchange", refresh);
    window.clearTimeout(resizeTimer);
  });
}
