import { useSyncExternalStore, useCallback } from "react";

const STORAGE_KEY = "broodradar_changes_since";
const PREVIOUS_LOGIN_KEY = "broodradar_previous_login";
const FALLBACK_DAYS = 14;

const listeners = new Set<() => void>();

let cachedRaw: string | null = null;
let cachedSnapshot: string = "";

function defaultSince(): string {
  const prev = localStorage.getItem(PREVIOUS_LOGIN_KEY);
  if (prev) return prev;
  return new Date(Date.now() - FALLBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function getSnapshot(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === cachedRaw && cachedSnapshot) return cachedSnapshot;
    cachedRaw = raw;
    cachedSnapshot = raw || defaultSince();
    return cachedSnapshot;
  } catch {
    cachedRaw = null;
    cachedSnapshot = defaultSince();
    return cachedSnapshot;
  }
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  const storageHandler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === PREVIOUS_LOGIN_KEY) callback();
  };
  window.addEventListener("storage", storageHandler);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", storageHandler);
  };
}

function notify() {
  cachedRaw = localStorage.getItem(STORAGE_KEY);
  cachedSnapshot = cachedRaw || defaultSince();
  listeners.forEach((cb) => cb());
}

function getServerSnapshot(): string {
  return new Date(Date.now() - FALLBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function toDatetimeLocalValue(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

export function useChangesSince() {
  const since = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setSince = useCallback((iso: string) => {
    if (!iso) return;
    localStorage.setItem(STORAGE_KEY, iso);
    notify();
  }, []);

  return { since, setSince };
}
