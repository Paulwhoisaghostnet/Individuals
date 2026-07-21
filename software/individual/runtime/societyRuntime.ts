import { IndividualEngine } from "../core/engine/IndividualEngine";
import type { IndividualManifest, IndividualSnapshot, Portrait } from "../core/model";
import type { IndividualRepository, MemoryStore } from "../core/persistence/contracts";
import { FileIndividualRepository } from "../memory/fileRepository";
import { FileMemoryStore } from "../memory/fileMemoryStore";
import { HealthMonitor, type IndividualHealth } from "../observability/healthMonitor";
import { LlmCognitionSystem } from "../cognition/llmCognition";
import { ProceduralPerceptionSystem } from "../perception/proceduralPerception";
import { GenerativeDrawingSystem } from "../drawing/generativeDrawing";
import { ProceduralFeedbackCompositor } from "../social-feedback/proceduralCompositor";
import {
  StableIdGenerator,
  SystemClock,
  TemplateAdaptationSystem,
} from "../core/template/systems";
import { identityPackages } from "../identity-packages";

export interface SocietyRuntimeOptions {
  readonly manifests?: readonly IndividualManifest[];
  readonly repository?: IndividualRepository;
  readonly memory?: MemoryStore;
  readonly dataDir?: string;
  readonly cycleIntervalOverrideMs?: number;
}

export interface IndividualRuntimeStatus {
  readonly manifest: IndividualManifest;
  readonly snapshot: IndividualSnapshot;
  readonly health: IndividualHealth;
  readonly isPaused: boolean;
  readonly isRunningCycle: boolean;
}

export class SocietyRuntime {
  private readonly engines = new Map<string, IndividualEngine>();
  private readonly manifests = new Map<string, IndividualManifest>();
  private readonly pausedSet = new Set<string>();
  private readonly runningSet = new Set<string>();
  private readonly perceptionTunings = new Map<string, Record<string, number>>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  private readonly repository: IndividualRepository;
  private readonly memory: MemoryStore;
  private readonly healthMonitor: HealthMonitor;

  private readonly options: SocietyRuntimeOptions;
  private latestSelfPortraits: Portrait[] = [];
  private latestPeerPortraitsBySubject = new Map<string, Portrait[]>();
  private isStarted = false;

  constructor(options: SocietyRuntimeOptions = {}) {
    this.options = options;
    const dataDir = options.dataDir ?? ".data/individuals";
    this.repository = options.repository ?? new FileIndividualRepository(`${dataDir}/snapshots`);
    this.memory = options.memory ?? new FileMemoryStore(`${dataDir}/memories`);

    const packages = options.manifests ?? identityPackages;
    const ids = new StableIdGenerator();
    const clock = new SystemClock();
    this.healthMonitor = new HealthMonitor(packages.map((m) => m.id));

    for (const manifest of packages) {
      this.manifests.set(manifest.id, manifest);
      const engine = new IndividualEngine(manifest, {
        cognition: new LlmCognitionSystem(),
        perception: new ProceduralPerceptionSystem(),
        drawing: new GenerativeDrawingSystem(ids),
        feedback: new ProceduralFeedbackCompositor(ids),
        adaptation: new TemplateAdaptationSystem(),
        repository: this.repository,
        memory: this.memory,
        clock,
        ids,
      });
      this.engines.set(manifest.id, engine);
    }
  }

  async start(): Promise<void> {
    if (this.isStarted) return;
    this.isStarted = true;

    // Load initial snapshots & seed self portraits if existing
    for (const [id, engine] of this.engines.entries()) {
      const snapshot = await engine.getSnapshot();
      if (snapshot.state.currentSelfPortrait) {
        this.latestSelfPortraits.push(snapshot.state.currentSelfPortrait);
      }
      this.scheduleNextCycle(id);
    }
  }

  async stop(): Promise<void> {
    this.isStarted = false;
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  pause(individualId: string): void {
    this.pausedSet.add(individualId);
    const timer = this.timers.get(individualId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(individualId);
    }
    this.healthMonitor.recordAction(individualId, "pause");
  }

  resume(individualId: string): void {
    if (!this.pausedSet.has(individualId)) return;
    this.pausedSet.delete(individualId);
    this.healthMonitor.recordAction(individualId, "resume");
    if (this.isStarted) {
      this.scheduleNextCycle(individualId, 500);
    }
  }

  tunePerception(individualId: string, tuning: Record<string, number>): void {
    const existing = this.perceptionTunings.get(individualId) ?? {};
    this.perceptionTunings.set(individualId, { ...existing, ...tuning });
    this.healthMonitor.recordAction(individualId, "tune_perception", tuning);
  }

  async runSingleCycle(individualId: string): Promise<void> {
    const engine = this.engines.get(individualId);
    if (!engine || this.runningSet.has(individualId)) return;

    const manifest = this.manifests.get(individualId)!;
    this.runningSet.add(individualId);
    const startTime = Date.now();

    try {
      const snapshot = await engine.getSnapshot();
      this.healthMonitor.recordStart(individualId, snapshot.state.cycle + 1);

      const peerSelfPortraits = this.latestSelfPortraits.filter(
        (p) => p.subjectId !== individualId,
      );
      const receivedPeerPortraits = this.latestPeerPortraitsBySubject.get(individualId) ?? [];
      const tuning = this.perceptionTunings.get(individualId);

      const record = await engine.runCycle({
        peerSelfPortraits,
        receivedPeerPortraits,
        perceptionTuning: tuning,
      });

      // Update state caches
      this.latestSelfPortraits = [
        ...this.latestSelfPortraits.filter((p) => p.subjectId !== individualId),
        record.selfPortrait,
      ];

      for (const peerPortrait of record.peerPortraits) {
        const list = this.latestPeerPortraitsBySubject.get(peerPortrait.subjectId) ?? [];
        this.latestPeerPortraitsBySubject.set(peerPortrait.subjectId, [
          ...list.filter((p) => p.artistId !== individualId),
          peerPortrait,
        ]);
      }

      this.healthMonitor.recordComplete(
        individualId,
        record.cycle,
        Date.now() - startTime,
      );
    } catch (error) {
      // Fault isolation: catch error, record health fault, allow runtime to continue
      const snapshot = await engine.getSnapshot();
      this.healthMonitor.recordFault(individualId, snapshot.state.cycle + 1, error);
    } finally {
      this.runningSet.delete(individualId);
    }
  }

  async getStatus(individualId: string): Promise<IndividualRuntimeStatus | undefined> {
    const engine = this.engines.get(individualId);
    if (!engine) return undefined;
    const manifest = this.manifests.get(individualId)!;
    const snapshot = await engine.getSnapshot();
    const health = this.healthMonitor.getHealth(individualId);

    return {
      manifest,
      snapshot,
      health,
      isPaused: this.pausedSet.has(individualId),
      isRunningCycle: this.runningSet.has(individualId),
    };
  }

  getHealthMonitor(): HealthMonitor {
    return this.healthMonitor;
  }

  private scheduleNextCycle(individualId: string, delayOverrideMs?: number): void {
    if (!this.isStarted || this.pausedSet.has(individualId)) return;

    const manifest = this.manifests.get(individualId)!;
    const baseInterval = this.options.cycleIntervalOverrideMs ?? manifest.cadence.minimumCycleIntervalMs;
    // Add ±20% jitter
    const jitter = (Math.random() - 0.5) * 0.4 * baseInterval;
    const delay = delayOverrideMs ?? Math.max(1000, Math.round(baseInterval + jitter));

    const timer = setTimeout(async () => {
      if (!this.isStarted || this.pausedSet.has(individualId)) return;
      await this.runSingleCycle(individualId);
      this.scheduleNextCycle(individualId);
    }, delay);

    this.timers.set(individualId, timer);
  }
}
