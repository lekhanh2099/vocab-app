import { onCleanup, onMount } from "solid-js";

export interface GameKeyHandlers {
  option?: (index: number) => void;
  next?: () => void;
  replay?: () => void;
  restart?: () => void;
  pause?: () => void;
  enabled?: () => boolean;
}

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);
}

function gameHelpOpen() {
  return document.body.classList.contains("game-shortcuts-open");
}

export function useGameKeys(handlers: GameKeyHandlers) {
  const listener = (event: KeyboardEvent) => {
    if (event.isComposing || event.repeat || document.hidden || gameHelpOpen()) return;
    if (handlers.enabled && !handlers.enabled()) return;
    if (isEditableTarget(event.target)) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (/^[1-4]$/.test(event.key) && handlers.option) {
      event.preventDefault();
      handlers.option(Number(event.key) - 1);
      return;
    }
    if (event.key === "Enter" && handlers.next) {
      event.preventDefault();
      handlers.next();
      return;
    }
    if ((event.key === "r" || event.key === "R") && handlers.replay) {
      event.preventDefault();
      handlers.replay();
      return;
    }
    if ((event.key === "s" || event.key === "S") && handlers.restart) {
      event.preventDefault();
      handlers.restart();
      return;
    }
    if (event.code === "Space" && handlers.pause) {
      event.preventDefault();
      handlers.pause();
    }
  };

  onMount(() => window.addEventListener("keydown", listener));
  onCleanup(() => window.removeEventListener("keydown", listener));
}
