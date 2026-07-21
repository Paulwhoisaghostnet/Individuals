import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createDefaultTuning } from "../perception";
import type { ExhibitionIndividual } from "../types";
import { SocietyApiClient, SocietyApiError } from "./societyApi";
import { RequestDeadlineError } from "./requestDeadline";
import type {
  ControlRequestState,
  PublicSocietySnapshot,
  SocietyControlResponse,
} from "./types";
import { RuntimePayloadError } from "./validation";
import type { LocalSociety } from "./useLocalSociety";

const errorMessage = (error: unknown): string => {
  if (error instanceof SocietyApiError) return error.message;
  if (error instanceof RequestDeadlineError) {
    return "The runtime did not confirm the change before the request deadline.";
  }
  if (error instanceof RuntimePayloadError) return "The runtime returned invalid state; no change was applied.";
  return "The runtime control request could not be completed.";
};

export interface SocietyRuntimeControls {
  readonly state: ControlRequestState;
  readonly pause: (token?: string) => Promise<boolean>;
  readonly resume: (token?: string) => Promise<boolean>;
  readonly tunePerception: (
    individualId: string,
    controlId: string,
    value: number,
    token?: string,
  ) => Promise<boolean>;
  readonly resetIndividual: (individual: ExhibitionIndividual, token?: string) => Promise<boolean>;
  readonly resetAll: (token?: string) => Promise<boolean>;
  readonly advanceLocal: () => void;
  readonly clearError: () => void;
  readonly cancelPending: () => void;
}

interface UseCuratorControlsInput {
  readonly people: readonly ExhibitionIndividual[];
  readonly client: SocietyApiClient;
  readonly local: LocalSociety;
  readonly localOperational: boolean;
  readonly acceptSnapshot: (snapshot: PublicSocietySnapshot) => void;
}

export function useCuratorControls({
  people,
  client,
  local,
  localOperational,
  acceptSnapshot,
}: UseCuratorControlsInput): SocietyRuntimeControls {
  const [state, setState] = useState<ControlRequestState>({ pending: {} });
  const activeRequests = useRef(new Set<AbortController>());

  const cancelPending = useCallback(() => {
    for (const controller of activeRequests.current) controller.abort();
    activeRequests.current.clear();
    setState({ pending: {} });
  }, []);

  useEffect(
    () => () => {
      for (const controller of activeRequests.current) controller.abort();
      activeRequests.current.clear();
    },
    [],
  );

  const setPending = useCallback((key: string, pending: boolean) => {
    setState((current) => {
      const nextPending = { ...current.pending };
      if (pending) nextPending[key] = true;
      else delete nextPending[key];
      return { pending: nextPending, error: pending ? undefined : current.error };
    });
  }, []);

  const runLiveControl = useCallback(
    async (
      key: string,
      token: string | undefined,
      request: (credential: string, signal: AbortSignal) => Promise<SocietyControlResponse>,
    ): Promise<boolean> => {
      if (!token?.trim()) {
        setState((current) => ({
          ...current,
          error: "Enter a curator token for this session before changing the live runtime.",
        }));
        return false;
      }
      const controller = new AbortController();
      activeRequests.current.add(controller);
      setPending(key, true);
      try {
        const response = await request(token, controller.signal);
        acceptSnapshot(response.snapshot ?? (await client.getSnapshot(controller.signal)));
        setState((current) => ({ ...current, error: undefined }));
        return true;
      } catch (error) {
        if (controller.signal.aborted) return false;
        setState((current) => ({ ...current, error: errorMessage(error) }));
        return false;
      } finally {
        activeRequests.current.delete(controller);
        setPending(key, false);
      }
    },
    [acceptSnapshot, client, setPending],
  );

  return useMemo(() => ({
    state,
    pause: async (token?: string) => {
      if (localOperational) {
        local.pause();
        return true;
      }
      return runLiveControl("society-pause", token, (credential, signal) =>
        client.pause(credential, undefined, signal));
    },
    resume: async (token?: string) => {
      if (localOperational) {
        local.resume();
        return true;
      }
      return runLiveControl("society-resume", token, (credential, signal) =>
        client.resume(credential, undefined, signal));
    },
    tunePerception: async (
      individualId: string,
      controlId: string,
      value: number,
      token?: string,
    ) => {
      const person = people.find(({ id }) => id === individualId);
      const control = person?.perceptionModel.controls.find(({ id }) => id === controlId);
      if (!person || !control || !Number.isFinite(value) || value < control.min || value > control.max) {
        setState((current) => ({
          ...current,
          error: "That perception value is outside its defined range.",
        }));
        return false;
      }
      if (localOperational) {
        local.tuning.setControl(individualId, controlId, value);
        return true;
      }
      return runLiveControl(
        `tuning-${individualId}-${controlId}`,
        token,
        (credential, signal) =>
          client.tunePerception(credential, individualId, { [controlId]: value }, signal),
      );
    },
    resetIndividual: async (individual: ExhibitionIndividual, token?: string) => {
      if (localOperational) {
        local.tuning.resetIndividual(individual);
        return true;
      }
      return runLiveControl(
        `reset-${individual.id}`,
        token,
        (credential, signal) =>
          client.tunePerception(
            credential,
            individual.id,
            createDefaultTuning(individual.perceptionModel),
            signal,
          ),
      );
    },
    resetAll: async (token?: string) => {
      if (localOperational) {
        local.tuning.resetAll();
        return true;
      }
      return runLiveControl("reset-all", token, (credential, signal) =>
        client.tunePerceptionBatch(
          credential,
          people.map((person) => ({
            individualId: person.id,
            tuning: createDefaultTuning(person.perceptionModel),
          })),
          signal,
        ));
    },
    advanceLocal: local.advance,
    clearError: () => setState((current) => ({ ...current, error: undefined })),
    cancelPending,
  }), [
    acceptSnapshot,
    client,
    cancelPending,
    local,
    localOperational,
    people,
    runLiveControl,
    setPending,
    state,
  ]);
}
