import { useCallback, useEffect, useState } from "react";

export const ARTWORK_LOAD_TIMEOUT_MS = 12_000;

export type ArtworkLoadStatus = "loaded" | "failed";

export interface ArtworkLoadState {
  readonly url: string;
  readonly status: ArtworkLoadStatus;
}

export const transitionArtworkLoadState = (
  current: ArtworkLoadState | undefined,
  url: string,
  event: ArtworkLoadStatus | "timed-out",
): ArtworkLoadState => {
  if (current?.url === url && current.status === "loaded" && event === "timed-out") return current;
  return { url, status: event === "timed-out" ? "failed" : event };
};

/** Falls back when an artwork request errors or remains unresolved in the gallery. */
export function useArtworkLoadState(
  url: string | undefined,
  timeoutMs = ARTWORK_LOAD_TIMEOUT_MS,
) {
  const [state, setState] = useState<ArtworkLoadState>();

  useEffect(() => {
    if (!url) return undefined;
    const timer = window.setTimeout(() => {
      setState((current) => transitionArtworkLoadState(current, url, "timed-out"));
    }, timeoutMs);
    return () => window.clearTimeout(timer);
  }, [timeoutMs, url]);

  const markLoaded = useCallback(() => {
    if (url) setState((current) => transitionArtworkLoadState(current, url, "loaded"));
  }, [url]);
  const markFailed = useCallback(() => {
    if (url) setState((current) => transitionArtworkLoadState(current, url, "failed"));
  }, [url]);

  return {
    failed: Boolean(url && state?.url === url && state.status === "failed"),
    markLoaded,
    markFailed,
  };
}
