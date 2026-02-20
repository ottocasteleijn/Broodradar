import { useSyncExternalStore, useCallback } from "react";

const STORAGE_KEY = "broodradar_followed";

const listeners = new Set<() => void>();

function getSnapshot(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  const storageHandler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback();
  };
  window.addEventListener("storage", storageHandler);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", storageHandler);
  };
}

function notify() {
  listeners.forEach((cb) => cb());
}

function getServerSnapshot(): string[] {
  return [];
}

export function useFollowedProducts() {
  const followedIds = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const follow = useCallback((catalogId: string) => {
    if (!catalogId) return;
    const current = getSnapshot();
    if (current.includes(catalogId)) return;
    const next = [...current, catalogId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    notify();
  }, []);

  const unfollow = useCallback((catalogId: string) => {
    if (!catalogId) return;
    const current = getSnapshot();
    const next = current.filter((id) => id !== catalogId);
    if (next.length === current.length) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    notify();
  }, []);

  const isFollowed = useCallback(
    (catalogId: string | null | undefined) =>
      Boolean(catalogId && followedIds.includes(catalogId)),
    [followedIds]
  );

  const toggle = useCallback(
    (catalogId: string | null | undefined) => {
      if (!catalogId) return;
      if (followedIds.includes(catalogId)) unfollow(catalogId);
      else follow(catalogId);
    },
    [followedIds, follow, unfollow]
  );

  return { followedIds, follow, unfollow, isFollowed, toggle };
}
