import { liveQuery } from "dexie";
import { createSignal, onCleanup, onMount, type Accessor } from "solid-js";

export function createDexieQuery<T>(query: () => Promise<T>, initial: T): Accessor<T> {
  const [value, setValue] = createSignal<T>(initial);
  onMount(() => {
    const subscription = liveQuery(query).subscribe({
      next: (next) => window.setTimeout(() => setValue(() => next), 0),
      error: (error) => console.error("Dexie liveQuery failed", error)
    });
    onCleanup(() => subscription.unsubscribe());
  });
  return value;
}
