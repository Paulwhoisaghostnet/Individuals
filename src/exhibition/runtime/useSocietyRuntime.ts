import { useMemo } from "react";
import type { ExhibitionIndividual } from "../types";
import { buildRuntimeView } from "./runtimeView";
import { SocietyApiClient } from "./societyApi";
import { selectRuntimeSource } from "./state";
import type { SocietyRuntimeView } from "./types";
import { loadRuntimeConfig } from "./validation";
import { useCuratorControls, type SocietyRuntimeControls } from "./useCuratorControls";
import { useLiveSocietyConnection } from "./useLiveSocietyConnection";
import { useLocalSociety } from "./useLocalSociety";

export interface SocietyRuntimeResult {
  readonly view: SocietyRuntimeView;
  readonly controls: SocietyRuntimeControls;
}

/**
 * Composes three deliberately separate domains:
 * live transport, deterministic local simulation, and authenticated controls.
 */
export function useSocietyRuntime(
  people: readonly ExhibitionIndividual[],
): SocietyRuntimeResult {
  const config = useMemo(loadRuntimeConfig, []);
  const client = useMemo(() => new SocietyApiClient(config), [config]);
  const live = useLiveSocietyConnection(people, config, client);
  const source = selectRuntimeSource(live.state, config.mode);
  const localOperational =
    source === "local" && (config.mode === "local" || live.state.fallbackActive);
  const local = useLocalSociety(people, localOperational);

  const view = useMemo(
    () =>
      buildRuntimeView({
        people,
        source,
        connectionState: live.state,
        localState: local.state,
        localTuning: local.tuning.tuningMap,
        localOperational,
      }),
    [
      live.state,
      local.state,
      local.tuning.tuningMap,
      localOperational,
      people,
      source,
    ],
  );

  const controls = useCuratorControls({
    people,
    client,
    local,
    localOperational,
    acceptSnapshot: live.acceptControlSnapshot,
  });

  return { view, controls };
}
