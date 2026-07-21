/// <reference types="vite/client" />

interface IndividualsRuntimeConfig {
  readonly apiBasePath?: unknown;
  readonly mode?: unknown;
  readonly localFallbackAfterMs?: unknown;
  readonly pollIntervalMs?: unknown;
}

interface Window {
  /** Public transport configuration only. Curator credentials must never be placed here. */
  readonly __INDIVIDUALS_CONFIG__?: IndividualsRuntimeConfig;
}
