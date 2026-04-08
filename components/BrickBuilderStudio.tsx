"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BrickPreviewCanvas, type BrickRecord } from "@/components/BrickPreviewCanvas";
import { ShapeEditorCanvas, type PlacementRulePaint } from "@/components/ShapeEditorCanvas";
import {
  CollapsibleSection,
  JsonBlock,
  Metric,
  PanelHeader,
  StatusLight,
  StudioPanel,
  Tooltip,
} from "@/components/hmi/StudioPrimitives";

type BuilderInput = {
  id: string;
  color: string;
  shapeId: string;
  startAnchor: [string, string, string];
  placementRuleId: string;
  maxPlacements: string;
  failurePolicy: string;
  continuityMode: string;
  maxBacktrackDepth: string;
  archetype: string;
  selectionMode: string;
  symmetryMode: string;
  objectiveWeightsJson: string;
  initialStrategy: string;
  allowedStrategyShifts: string[];
  shiftsEnabled: boolean;
  shiftPillarThreshold: string;
  shiftReinforceThreshold: string;
  shiftWrapThreshold: string;
  customRule: PlacementRulePaint;
  prioritizeShapes: boolean;
};

type CatalogOption = {
  id: string;
  label: string;
};

type CatalogDefaultBuilder = {
  id: string;
  color: string;
  shapeId: string;
  startAnchor: [number, number, number];
  placementRuleId: string;
  maxPlacements: number;
  failurePolicy: string;
  continuityMode: string;
  maxBacktrackDepth: number | null;
  archetype?: string;
  selectionMode?: string;
  symmetryMode?: string;
  objectiveWeights?: Record<string, number>;
  initialStrategy?: string;
  allowedStrategyShifts?: string[];
};

type ArchetypeProfileData = {
  id: string;
  label: string;
  defaultObjectiveWeights: Record<string, number>;
  allowedStrategyShifts: string[];
  initialStrategy: string;
  buildabilityProfile: Record<string, number | boolean>;
  symmetryMode: string;
};

type CatalogResponse = {
  shapes: CatalogOption[];
  placementRules: CatalogOption[];
  failurePolicies: CatalogOption[];
  continuityModes: CatalogOption[];
  archetypes?: ArchetypeProfileData[];
  strategyShifts?: CatalogOption[];
  symmetryModes?: CatalogOption[];
  scoringCategories?: CatalogOption[];
  defaultBuilders: CatalogDefaultBuilder[];
};

type BuilderRuntimeState = {
  id: string;
  status: string;
  placementCount: number;
  maxPlacements: number;
  failurePolicy: string;
  continuityMode: string;
  maxBacktrackDepth: number | null;
  lastAnchor: [number, number, number] | null;
  lastOrientation: string | null;
  lastAction: string;
  blockedReason: string | null;
  score?: number;
  archetype?: string;
  currentStrategy?: string;
  symmetryMode?: string;
  allowedStrategyShifts?: string[];
  scoreBreakdown?: Record<string, number>;
  buildabilityProfile?: Record<string, number | boolean>;
};

type TraceScoreLine = { category: string; points: number; reason?: string };

type TraceEvent = {
  tick: number;
  builderId: string;
  action: string;
  message: string;
  placementId: string | null;
  strategy: string | null;
  referenceCell: [number, number, number] | null;
  status: string | null;
  scoreDelta?: number;
  scores?: TraceScoreLine[];
  runningScore?: number;
  strategyBefore?: string | null;
  strategyAfter?: string | null;
  supportPathExists?: boolean | null;
  supported?: boolean | null;
};

type TimelineSnapshot = {
  tick: number;
  brickCount?: number;
  placementCount?: number;
  placementsThisTick?: number;
  activeBuilders?: number;
  blockedBuilders?: number;
  scoresByBuilder?: Record<string, number>;
  actions?: Array<{ builderId: string; action: string; strategy: string | null }>;
  builders?: BuilderRuntimeState[];
  events?: TraceEvent[];
};

type SimulationResponse = {
  metadata: {
    totalSteps: number;
    brickUnit: number;
    cubeCage: number;
    brickCount: number;
    builderCount: number;
    placementCount: number;
    outputPath: string | null;
    jsonOutputPath: string | null;
    seed: number | null;
  };
  builders: {
    id: string;
    color: string;
    shapeId: string;
    startAnchor: [number, number, number];
    placementRuleId: string;
    maxPlacements: number;
    failurePolicy: string;
    continuityMode: string;
    maxBacktrackDepth: number | null;
    archetype?: string;
    selectionMode?: string;
    symmetryMode?: string;
    objectiveWeights?: Record<string, number>;
  }[];
  builderStates: BuilderRuntimeState[];
  bricks: BrickRecord[];
  trace: TraceEvent[];
  timeline?: TimelineSnapshot[];
  scad: string;
  downloadUrl: string | null;
  jsonDownloadUrl: string | null;
};

type BalanceSummaryResponse = {
  matchCount: number;
  winRates: Record<string, number>;
  averageScoreGap: number;
  results: Array<{
    seed: number;
    builderIds: string[];
    winnerId: string;
    scoreGap: number;
    scores: Record<string, number>;
  }>;
};

const DEFAULT_API_URL = process.env.NEXT_PUBLIC_BRICK_API_URL ?? "http://127.0.0.1:8000";

const SELECTION_MODE_OPTIONS: CatalogOption[] = [
  { id: "legacy", label: "Legacy (first valid)" },
  { id: "competitive", label: "Competitive (scored)" },
];

const DEFAULT_CATALOG: CatalogResponse = {
  shapes: [
    { id: "single_1x1", label: "1x1" },
    { id: "bar_2x1", label: "2x1 Bar" },
    { id: "bar_3x1", label: "3x1 Bar" },
  ],
  placementRules: [
    {
      id: "alternating_sideways_vertical",
      label: "Alternating Sideways / Vertical",
    },
    {
      id: "alternating_with_support",
      label: "Alternating + Pillar Support",
    },
    { id: "competitive_growth", label: "Competitive Growth" },
  ],
  failurePolicies: [
    { id: "backtrack", label: "Backtrack Through History" },
    { id: "stop", label: "Stop Builder" },
    { id: "skip", label: "Skip Tick" },
    { id: "fallback_random", label: "Fallback To Random Placement" },
  ],
  continuityModes: [{ id: "strict", label: "Strict Continuity" }],
  archetypes: [
    {
      id: "fortress", label: "Fortress",
      defaultObjectiveWeights: { territory: 0.6, surface: 0.5, enclosure: 2.2, chain: 0.3, support: 2.0, choke: 0.8, symmetry: 0.9 },
      allowedStrategyShifts: ["expand", "reinforce", "pillar"], initialStrategy: "reinforce",
      buildabilityProfile: {}, symmetryMode: "mirror_x",
    },
    {
      id: "vine", label: "Vine",
      defaultObjectiveWeights: { territory: 1.0, surface: 1.1, enclosure: 0.2, chain: 2.4, support: 0.7, choke: 1.7, symmetry: 0.1 },
      allowedStrategyShifts: ["expand", "wrap"], initialStrategy: "expand",
      buildabilityProfile: {}, symmetryMode: "none",
    },
    {
      id: "coral", label: "Coral",
      defaultObjectiveWeights: { territory: 0.9, surface: 2.3, enclosure: 0.4, chain: 1.7, support: 1.0, choke: 0.5, symmetry: 0.4 },
      allowedStrategyShifts: ["expand", "reinforce"], initialStrategy: "expand",
      buildabilityProfile: {}, symmetryMode: "radial",
    },
    {
      id: "territorial", label: "Territorial",
      defaultObjectiveWeights: { territory: 2.5, surface: 1.1, enclosure: 0.7, chain: 0.7, support: 1.1, choke: 1.0, symmetry: 0.2 },
      allowedStrategyShifts: ["expand", "wrap", "pillar"], initialStrategy: "expand",
      buildabilityProfile: {}, symmetryMode: "none",
    },
  ],
  strategyShifts: [
    { id: "expand", label: "Expand" },
    { id: "reinforce", label: "Reinforce" },
    { id: "wrap", label: "Wrap" },
    { id: "pillar", label: "Pillar" },
  ],
  symmetryModes: [
    { id: "mirror_x", label: "Mirror Across X" },
    { id: "mirror_y", label: "Mirror Across Y" },
    { id: "none", label: "No Symmetry" },
    { id: "radial", label: "Radial Balance" },
  ],
  scoringCategories: [
    { id: "chain", label: "Chain Length" },
    { id: "choke", label: "Choke Pressure" },
    { id: "enclosure", label: "Enclosure" },
    { id: "support", label: "Support Quality" },
    { id: "surface", label: "Exposed Surface" },
    { id: "symmetry", label: "Symmetry" },
    { id: "territory", label: "Territory Control" },
  ],
  defaultBuilders: [
    {
      id: "fortress-red",
      color: "#ef4444",
      shapeId: "bar_2x1",
      startAnchor: [0, 0, 0],
      placementRuleId: "competitive_growth",
      maxPlacements: 200,
      failurePolicy: "backtrack",
      continuityMode: "strict",
      maxBacktrackDepth: 200,
      archetype: "fortress",
      selectionMode: "competitive",
      symmetryMode: "none",
      objectiveWeights: {},
    },
    {
      id: "vine-blue",
      color: "#38bdf8",
      shapeId: "bar_2x1",
      startAnchor: [40, 0, 0],
      placementRuleId: "competitive_growth",
      maxPlacements: 200,
      failurePolicy: "backtrack",
      continuityMode: "strict",
      maxBacktrackDepth: 200,
      archetype: "vine",
      selectionMode: "competitive",
      symmetryMode: "none",
      objectiveWeights: {},
    },
  ],
};

const DEFAULT_ARCHETYPE_ID = "vine";

function lookupArchetypeProfile(
  catalog: CatalogResponse,
  archId: string,
): ArchetypeProfileData | undefined {
  return catalog.archetypes?.find((a) => a.id === archId);
}

function toBuilderInput(
  builder: CatalogResponse["defaultBuilders"][number],
  catalog: CatalogResponse = DEFAULT_CATALOG,
): BuilderInput {
  const archId = builder.archetype ?? DEFAULT_ARCHETYPE_ID;
  const profile = lookupArchetypeProfile(catalog, archId);
  const hasOwnWeights =
    builder.objectiveWeights && Object.keys(builder.objectiveWeights).length > 0;
  const weights = hasOwnWeights
    ? builder.objectiveWeights!
    : (profile?.defaultObjectiveWeights ?? {});
  return {
    id: builder.id,
    color: builder.color,
    shapeId: builder.shapeId,
    startAnchor: builder.startAnchor.map(String) as [string, string, string],
    placementRuleId: builder.placementRuleId,
    maxPlacements: String(builder.maxPlacements),
    failurePolicy: builder.failurePolicy,
    continuityMode: builder.continuityMode,
    maxBacktrackDepth:
      builder.maxBacktrackDepth === null ? "" : String(builder.maxBacktrackDepth),
    archetype: archId,
    selectionMode: builder.selectionMode ?? "legacy",
    symmetryMode: builder.symmetryMode ?? profile?.symmetryMode ?? "none",
    objectiveWeightsJson: JSON.stringify(weights),
    initialStrategy: builder.initialStrategy ?? profile?.initialStrategy ?? "expand",
    allowedStrategyShifts: builder.allowedStrategyShifts ?? [...(profile?.allowedStrategyShifts ?? [])],
    shiftsEnabled: (builder.allowedStrategyShifts ?? profile?.allowedStrategyShifts ?? []).length > 0,
    shiftPillarThreshold: "2",
    shiftReinforceThreshold: "8",
    shiftWrapThreshold: "2",
    customRule: { cube1Offsets: [], cube2Offsets: [] },
    prioritizeShapes: false,
  };
}

function createBuilder(index: number): BuilderInput {
  const arch = lookupArchetypeProfile(DEFAULT_CATALOG, DEFAULT_ARCHETYPE_ID)
    ?? DEFAULT_CATALOG.archetypes?.[0];
  return {
    id: `builder-${index + 1}`,
    color: "Green",
    shapeId: DEFAULT_CATALOG.shapes[0]?.id ?? "single_1x1",
    startAnchor: ["0", "0", "0"],
    placementRuleId:
      DEFAULT_CATALOG.placementRules[0]?.id ?? "alternating_sideways_vertical",
    maxPlacements: "50",
    failurePolicy: DEFAULT_CATALOG.failurePolicies[0]?.id ?? "backtrack",
    continuityMode: DEFAULT_CATALOG.continuityModes[0]?.id ?? "strict",
    maxBacktrackDepth: "50",
    archetype: arch?.id ?? DEFAULT_ARCHETYPE_ID,
    selectionMode: "legacy",
    symmetryMode: arch?.symmetryMode ?? "none",
    objectiveWeightsJson: JSON.stringify(arch?.defaultObjectiveWeights ?? {}),
    initialStrategy: arch?.initialStrategy ?? "expand",
    allowedStrategyShifts: [...(arch?.allowedStrategyShifts ?? [])],
    shiftsEnabled: (arch?.allowedStrategyShifts ?? []).length > 0,
    shiftPillarThreshold: "2",
    shiftReinforceThreshold: "8",
    shiftWrapThreshold: "2",
    customRule: { cube1Offsets: [], cube2Offsets: [] },
    prioritizeShapes: false,
  };
}

function getOptionLabel(options: CatalogOption[], value: string) {
  return options.find((option) => option.id === value)?.label ?? value;
}

function buildSimulationBuildersPayload(builders: BuilderInput[]) {
  const payload: Array<Record<string, unknown>> = [];
  for (let index = 0; index < builders.length; index += 1) {
    const builder = builders[index];
    let objectiveWeights: Record<string, number> = {};
    const raw = builder.objectiveWeightsJson.trim();
    if (raw.length > 0) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return {
            ok: false as const,
            error: `Builder ${index + 1}: objective weights must be a JSON object.`,
          };
        }
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          const n = Number(value);
          if (Number.isNaN(n)) {
            return {
              ok: false as const,
              error: `Builder ${index + 1}: invalid number for weight "${key}".`,
            };
          }
          objectiveWeights[key] = n;
        }
      } catch {
        return {
          ok: false as const,
          error: `Builder ${index + 1}: invalid objective weights JSON.`,
        };
      }
    }
    payload.push({
      id: builder.id.trim(),
      color: builder.color.trim(),
      shapeId: builder.shapeId,
      startAnchor: builder.startAnchor.map((value) => Number(value)) as [number, number, number],
      placementRuleId: builder.placementRuleId,
      maxPlacements: Number(builder.maxPlacements),
      failurePolicy: builder.failurePolicy,
      continuityMode: builder.continuityMode,
      maxBacktrackDepth:
        builder.maxBacktrackDepth === "" ? null : Number(builder.maxBacktrackDepth),
      archetype: builder.archetype,
      selectionMode: builder.selectionMode,
      symmetryMode: builder.symmetryMode,
      objectiveWeights,
      allowedStrategyShifts: builder.shiftsEnabled ? builder.allowedStrategyShifts : [],
      initialStrategy: builder.initialStrategy || null,
      buildabilityProfile: {},
      shiftPillarThreshold: Number(builder.shiftPillarThreshold) || 2,
      shiftReinforceThreshold: Number(builder.shiftReinforceThreshold) || 8,
      shiftWrapThreshold: Number(builder.shiftWrapThreshold) || 2,
    });
  }
  return { ok: true as const, builders: payload };
}

function formatTelemetryScoreSummary(event: TraceEvent): string {
  if (event.scores && event.scores.length > 0) {
    return event.scores
      .slice(0, 5)
      .map((line) => `${line.category}:${Number(line.points).toFixed(2)}`)
      .join(" ");
  }
  return "—";
}

function telemetryDelta(event: TraceEvent): string {
  if (event.scoreDelta != null) {
    return Number(event.scoreDelta).toFixed(3);
  }
  return "—";
}

function telemetryRunning(event: TraceEvent): string {
  if (event.runningScore != null) {
    return Number(event.runningScore).toFixed(3);
  }
  return "—";
}

function telemetrySupport(event: TraceEvent): string {
  const parts: string[] = [];
  if (event.supported != null) {
    parts.push(`sup:${event.supported ? "Y" : "N"}`);
  }
  if (event.supportPathExists != null) {
    parts.push(`path:${event.supportPathExists ? "Y" : "N"}`);
  }
  return parts.length > 0 ? parts.join(" ") : "—";
}

function parseWeightsJson(json: string): Record<string, number> {
  try {
    const parsed = JSON.parse(json || "{}") as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const n = Number(v);
      if (!Number.isNaN(n)) out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
}

/** Integer placements per builder that sum to `total`; remainder goes to the first builders. */
function splitStepsAcrossBuilderPlacements(total: number, count: number): number[] {
  if (count <= 0) {
    return [];
  }
  const t = Math.max(0, Math.min(2000, Math.floor(total)));
  const base = Math.floor(t / count);
  const rem = t % count;
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1 : 0));
}

const WEIGHT_CATEGORY_TIPS: Record<string, string> = {
  territory: "How much this builder values claiming empty grid space and area control.",
  surface: "How much this builder values maximizing exposed surface area of its structure.",
  enclosure: "How much this builder values creating enclosed or walled-off regions.",
  chain: "How much this builder values maintaining long continuous chains of bricks.",
  support: "How much this builder values structural support and vertical stability.",
  choke: "How much this builder values blocking opponents at narrow access points.",
  symmetry: "How much this builder values maintaining symmetric placement patterns.",
};

export function BrickBuilderStudio() {
  const [totalSteps, setTotalSteps] = useState("100");
  const [splitPlacementsFromTotalSteps, setSplitPlacementsFromTotalSteps] = useState(true);
  const [cubeCage, setCubeCage] = useState("50");
  const [seed, setSeed] = useState("");
  const [fileName, setFileName] = useState("sample.scad");
  const [saveScad, setSaveScad] = useState(true);
  const [catalog, setCatalog] = useState<CatalogResponse>(DEFAULT_CATALOG);
  const [builders, setBuilders] = useState<BuilderInput[]>(
    DEFAULT_CATALOG.defaultBuilders.map(toBuilderInput),
  );
  const [selectedBuilderFilter, setSelectedBuilderFilter] = useState("all");
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [balanceSeeds, setBalanceSeeds] = useState("1,2,3");
  const [balanceTotalSteps, setBalanceTotalSteps] = useState("40");
  const [balanceCubeCage, setBalanceCubeCage] = useState("120");
  const [balanceResult, setBalanceResult] = useState<BalanceSummaryResponse | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const [currentTick, setCurrentTick] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadCatalog() {
      try {
        const response = await fetch(`${DEFAULT_API_URL}/catalog`);
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as CatalogResponse;
        if (!isMounted) {
          return;
        }

        setCatalog(payload);
        setBuilders((currentBuilders) =>
          currentBuilders.length > 0 ? currentBuilders : payload.defaultBuilders.map((b) => toBuilderInput(b, payload)),
        );
      } catch {
        // Fall back to local defaults when the catalog endpoint is unavailable.
      }
    }

    loadCatalog();
    return () => {
      isMounted = false;
    };
  }, []);

  const downloadUrl = useMemo(() => {
    if (!result?.downloadUrl) {
      return null;
    }

    try {
      return new URL(result.downloadUrl, DEFAULT_API_URL).toString();
    } catch {
      return result.downloadUrl;
    }
  }, [result]);

  const jsonDownloadUrl = useMemo(() => {
    if (!result?.jsonDownloadUrl) {
      return null;
    }

    try {
      return new URL(result.jsonDownloadUrl, DEFAULT_API_URL).toString();
    } catch {
      return result.jsonDownloadUrl;
    }
  }, [result]);

  const maxTick = useMemo(() => {
    if (!result?.timeline || result.timeline.length === 0) return 0;
    return Math.max(...result.timeline.map((t) => t.tick));
  }, [result]);

  const filteredBricks = useMemo(() => {
    if (!result) {
      return [];
    }
    if (selectedBuilderFilter === "all") {
      return result.bricks;
    }
    return result.bricks.filter(
      (brick) => brick.builderId === selectedBuilderFilter,
    );
  }, [result, selectedBuilderFilter]);

  useEffect(() => {
    if (!splitPlacementsFromTotalSteps) {
      return;
    }
    const n = builders.length;
    if (n === 0) {
      return;
    }
    const raw = Number.parseInt(totalSteps, 10);
    const steps = Number.isFinite(raw) ? Math.max(1, Math.min(2000, raw)) : 1;
    const shares = splitStepsAcrossBuilderPlacements(steps, n);
    setBuilders((prev) => {
      if (prev.length !== n) {
        return prev;
      }
      return prev.map((b, i) => ({ ...b, maxPlacements: String(shares[i] ?? 0) }));
    });
  }, [splitPlacementsFromTotalSteps, totalSteps, builders.length]);

  const tickFilteredBricks = useMemo(() => {
    if (currentTick === null) return filteredBricks;
    return filteredBricks.filter((b) => b.tick !== null && b.tick !== undefined && b.tick <= currentTick);
  }, [filteredBricks, currentTick]);

  const currentTickSnapshot = useMemo(() => {
    if (currentTick === null || !result?.timeline) return null;
    return result.timeline.find((t) => t.tick === currentTick) ?? null;
  }, [result, currentTick]);

  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
    if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }
  }, []);

  const startPlayback = useCallback(() => {
    if (!result?.timeline || result.timeline.length === 0) return;
    setIsPlaying(true);
    const start = currentTick ?? 0;
    let tick = start;
    playIntervalRef.current = setInterval(() => {
      tick += 1;
      if (tick > maxTick) {
        stopPlayback();
        return;
      }
      setCurrentTick(tick);
    }, 150);
  }, [result, currentTick, maxTick, stopPlayback]);

  useEffect(() => {
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (result) {
      setCurrentTick(null);
      stopPlayback();
    }
  }, [result, stopPlayback]);

  const recentTrace = useMemo(
    () => result?.trace.slice(-20).reverse() ?? [],
    [result],
  );

  const archetypeProfiles = useMemo(() => {
    const map: Record<string, ArchetypeProfileData> = {};
    if (catalog.archetypes) {
      for (const a of catalog.archetypes) map[a.id] = a;
    }
    return map;
  }, [catalog.archetypes]);

  const archetypeOptions = useMemo(
    () =>
      catalog.archetypes && catalog.archetypes.length > 0
        ? catalog.archetypes
        : [{ id: "territorial", label: "Territorial" }],
    [catalog.archetypes],
  );

  const symmetryOptions = useMemo(
    () =>
      catalog.symmetryModes && catalog.symmetryModes.length > 0
        ? catalog.symmetryModes
        : [{ id: "none", label: "None" }],
    [catalog.symmetryModes],
  );

  const allStrategyShifts = useMemo(
    () =>
      catalog.strategyShifts && catalog.strategyShifts.length > 0
        ? catalog.strategyShifts
        : [
            { id: "expand", label: "Expand" },
            { id: "reinforce", label: "Reinforce" },
            { id: "wrap", label: "Wrap" },
            { id: "pillar", label: "Pillar" },
          ],
    [catalog.strategyShifts],
  );

  const allScoringCategories = useMemo(
    () =>
      catalog.scoringCategories && catalog.scoringCategories.length > 0
        ? catalog.scoringCategories
        : [
            { id: "territory", label: "Territory Control" },
            { id: "surface", label: "Exposed Surface" },
            { id: "enclosure", label: "Enclosure" },
            { id: "chain", label: "Chain Length" },
            { id: "support", label: "Support Quality" },
            { id: "choke", label: "Choke Pressure" },
            { id: "symmetry", label: "Symmetry" },
          ],
    [catalog.scoringCategories],
  );

  const recentTimeline = useMemo(() => result?.timeline?.slice(-30) ?? [], [result]);

  const placementTelemetry = useMemo(
    () =>
      (result?.trace ?? [])
        .filter((event) => event.action === "placed")
        .slice(-25)
        .reverse(),
    [result],
  );

  const generationTone = error
    ? "bad"
    : isLoading
      ? "warn"
      : result
        ? "good"
        : "neutral";
  const exportTone = downloadUrl || jsonDownloadUrl ? "good" : result ? "warn" : "neutral";

  function updateBuilder(index: number, patch: Partial<BuilderInput>) {
    setBuilders((currentBuilders) =>
      currentBuilders.map((builder, builderIndex) =>
        builderIndex === index ? { ...builder, ...patch } : builder,
      ),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    const built = buildSimulationBuildersPayload(builders);
    if (!built.ok) {
      setError(built.error);
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`${DEFAULT_API_URL}/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          totalSteps: Number(totalSteps),
          cubeCage: Number(cubeCage),
          seed: seed === "" ? null : Number(seed),
          saveScad,
          fileName,
          builders: built.builders,
        }),
      });

      if (!response.ok) {
        throw new Error(`Generator request failed with status ${response.status}.`);
      }

      const payload = (await response.json()) as SimulationResponse;
      setResult(payload);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "The generator request failed.";

      setError(
        `${message} Make sure the local Python API is running on ${DEFAULT_API_URL}.`,
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleBalanceRun() {
    setBalanceError(null);
    const built = buildSimulationBuildersPayload(builders);
    if (!built.ok) {
      setBalanceError(built.error);
      return;
    }
    const seeds = balanceSeeds
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => !Number.isNaN(value));
    const effectiveSeeds = seeds.length > 0 ? seeds : [1, 2, 3];

    setBalanceLoading(true);
    setBalanceResult(null);
    try {
      const response = await fetch(`${DEFAULT_API_URL}/balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seeds: effectiveSeeds,
          totalSteps: Number(balanceTotalSteps),
          cubeCage: Number(balanceCubeCage),
          builders: built.builders,
        }),
      });
      if (!response.ok) {
        throw new Error(`Balance request failed with status ${response.status}.`);
      }
      const payload = (await response.json()) as BalanceSummaryResponse;
      setBalanceResult(payload);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Balance request failed.";
      setBalanceError(`${message} Is the API running on ${DEFAULT_API_URL}?`);
    } finally {
      setBalanceLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#1d4ed8_0%,#0f172a_35%,#020617_100%)] text-zinc-50">
      <main className="studio-shell mx-auto min-h-screen w-full max-w-[1920px] px-4 py-4 sm:px-6 lg:px-8">
        <form
          className="flex min-w-0 flex-col gap-5"
          id="studio-generate"
          onSubmit={handleSubmit}
        >
          <StudioPanel className="studio-shell-top sticky top-0 z-40 px-4 py-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-sky-300/80">Run &amp; Export</h2>
                <StatusLight
                  label={isLoading ? "Generating" : result ? "Ready" : "Idle"}
                  tone={generationTone}
                  progress={isLoading}
                />
                <StatusLight label="Builders" tone="info" value={builders.length} />
                <StatusLight label="Visible cubes" tone="info" value={tickFilteredBricks.length} />
                <StatusLight
                  label={downloadUrl || jsonDownloadUrl ? "Exports saved" : "Exports pending"}
                  tone={exportTone}
                />
              </div>
              <button
                className="rounded-full bg-sky-400 px-4 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:bg-sky-400/50"
                disabled={isLoading}
                type="submit"
              >
                {isLoading ? "Generating..." : "Generate model"}
              </button>
            </div>

            <CollapsibleSection
              title="Settings & Exports"
              titleTooltip="Generation parameters (steps, seed, cage) and export file options — everything that controls a run."
              summary={
                <>
                  <span>{totalSteps} steps</span>
                  <span>{cubeCage} cage</span>
                  {seed && <span>seed {seed}</span>}
                  <span>{fileName}</span>
                </>
              }
            >
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-x-3 gap-y-2">
                  <label className="text-sm text-slate-200" htmlFor="totalSteps">
                    <span className="block text-xs font-medium text-slate-400">Steps</span>
                    <input
                      id="totalSteps"
                      className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-slate-50 outline-none transition focus:border-sky-400"
                      min="1"
                      max="2000"
                      type="number"
                      value={totalSteps}
                      onChange={(event) => setTotalSteps(event.target.value)}
                    />
                  </label>

                  <label className="text-sm text-slate-200" htmlFor="seed">
                    <span className="block text-xs font-medium text-slate-400">Seed</span>
                    <input
                      id="seed"
                      className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-slate-50 outline-none transition focus:border-sky-400"
                      placeholder="—"
                      type="number"
                      value={seed}
                      onChange={(event) => setSeed(event.target.value)}
                    />
                  </label>

                  <label className="text-sm text-slate-200" htmlFor="cubeCage">
                    <span className="block text-xs font-medium text-slate-400">Cage</span>
                    <input
                      id="cubeCage"
                      className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-slate-50 outline-none transition focus:border-sky-400"
                      min="10"
                      max="5000"
                      type="number"
                      value={cubeCage}
                      onChange={(event) => setCubeCage(event.target.value)}
                    />
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
                    <input
                      checked={splitPlacementsFromTotalSteps}
                      className="h-3.5 w-3.5 shrink-0 rounded border border-white/20 bg-black/30 accent-emerald-400"
                      type="checkbox"
                      onChange={(event) => setSplitPlacementsFromTotalSteps(event.target.checked)}
                    />
                    Split steps across builders
                  </label>
                  {splitPlacementsFromTotalSteps && (
                    <span className="text-[0.65rem] text-slate-500">
                      (total ÷ builders, remainder to first)
                    </span>
                  )}
                </div>

                <div className="border-t border-white/5 pt-3">
                  <div className="grid grid-cols-[1fr_auto] items-end gap-3">
                    <label className="text-sm text-slate-200" htmlFor="fileName">
                      <span className="block text-xs font-medium text-slate-400">Export file name</span>
                      <input
                        id="fileName"
                        className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-slate-50 outline-none transition focus:border-sky-400"
                        type="text"
                        value={fileName}
                        onChange={(event) => setFileName(event.target.value)}
                      />
                    </label>

                    <label className="flex items-center gap-2 pb-0.5 text-xs text-slate-300">
                      <input
                        checked={saveScad}
                        className="h-4 w-4 accent-sky-400"
                        type="checkbox"
                        onChange={(event) => setSaveScad(event.target.checked)}
                      />
                      Save SCAD
                    </label>
                  </div>
                </div>
              </div>
            </CollapsibleSection>
          </StudioPanel>

          <div className="studio-shell-body">
          <div className="studio-builders-rail studio-side-rail space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-sky-300/80">Builders <span className="text-sky-300/50">({builders.length})</span></p>
                <button
                  className="rounded-full border border-sky-300/30 px-3 py-2 text-xs font-medium text-sky-200 transition hover:border-sky-200 hover:text-white"
                  type="button"
                  onClick={() =>
                    setBuilders((currentBuilders) => [
                      ...currentBuilders,
                      createBuilder(currentBuilders.length),
                    ])
                  }
                >
                  Add builder
                </button>
              </div>

                  {builders.map((builder, index) => {
                    const shapeLabel = getOptionLabel(catalog.shapes, builder.shapeId);
                    const ruleLabel = getOptionLabel(
                      catalog.placementRules,
                      builder.placementRuleId,
                    );

                    return (
                      <CollapsibleSection
                        key={`${builder.id}-${index}`}
                        title={`Builder ${index + 1}`}
                        titleClassName="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-sky-300/80"
                        defaultOpen={index === 0}
                        summary={
                          <>
                            <span className="rounded-full border border-white/10 bg-black/25 px-2 py-1 text-[0.68rem] uppercase tracking-[0.18em] text-slate-300">
                              {builder.color || "Color"}
                            </span>
                            <span>{shapeLabel}</span>
                            <span>{builder.maxPlacements} placements</span>
                          </>
                        }
                      >
                        <div className="space-y-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-xs leading-5 text-slate-400">
                              <p>{ruleLabel}</p>
                              <p>Start anchor: {builder.startAnchor.join(", ")}</p>
                            </div>
                            {builders.length > 1 ? (
                              <button
                                className="rounded-full border border-red-300/20 px-3 py-1.5 text-xs font-medium text-red-200 transition hover:border-red-200/40 hover:text-white"
                                type="button"
                                onClick={() =>
                                  setBuilders((currentBuilders) =>
                                    currentBuilders.filter(
                                      (_, builderIndex) => builderIndex !== index,
                                    ),
                                  )
                                }
                              >
                                Remove
                              </button>
                            ) : null}
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="space-y-2 text-sm text-slate-200">
                              <span className="block font-medium"><Tooltip text="The behavioral profile that shapes this builder's strategy, scoring priorities, and symmetry defaults.">Archetype</Tooltip></span>
                              <select
                                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-slate-50 outline-none transition focus:border-sky-400"
                                value={builder.archetype}
                                onChange={(event) => {
                                  const archId = event.target.value;
                                  const profile = archetypeProfiles[archId];
                                  if (profile) {
                                    updateBuilder(index, {
                                      archetype: archId,
                                      initialStrategy: profile.initialStrategy,
                                      allowedStrategyShifts: [...profile.allowedStrategyShifts],
                                      shiftsEnabled: profile.allowedStrategyShifts.length > 0,
                                      symmetryMode: profile.symmetryMode,
                                      objectiveWeightsJson: JSON.stringify(profile.defaultObjectiveWeights),
                                    });
                                  } else {
                                    updateBuilder(index, { archetype: archId });
                                  }
                                }}
                              >
                                {archetypeOptions.map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="space-y-2 text-sm text-slate-200">
                              <span className="block font-medium"><Tooltip text="How the builder picks among valid candidates — 'legacy' uses the first valid spot, 'competitive' scores all options and picks the best.">Selection mode</Tooltip></span>
                              <select
                                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-slate-50 outline-none transition focus:border-sky-400"
                                value={builder.selectionMode}
                                onChange={(event) =>
                                  updateBuilder(index, { selectionMode: event.target.value })
                                }
                              >
                                {SELECTION_MODE_OPTIONS.map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="space-y-2 text-sm text-slate-200 sm:col-span-2">
                              <span className="block font-medium"><Tooltip text="The algorithm that generates candidate positions and orientations for new bricks.">Placement rule</Tooltip></span>
                              <select
                                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-slate-50 outline-none transition focus:border-sky-400"
                                value={builder.placementRuleId}
                                onChange={(event) =>
                                  updateBuilder(index, {
                                    placementRuleId: event.target.value,
                                  })
                                }
                              >
                                {catalog.placementRules.map((rule) => (
                                  <option key={rule.id} value={rule.id}>
                                    {rule.label}
                                  </option>
                                ))}
                              </select>
                            </label>

                            {/* Objective Weight Sliders */}
                            <div className="sm:col-span-2 space-y-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-3">
                              <span className="block text-sm font-medium text-slate-200">
                                <Tooltip text="Scoring weights that determine how the builder evaluates candidate placements — higher values mean that category matters more. A weight of 0 means the category is ignored.">Objective weights</Tooltip>
                              </span>
                              <div className="space-y-1.5">
                                {(() => {
                                  const weights = parseWeightsJson(builder.objectiveWeightsJson);
                                  return allScoringCategories.map((cat) => {
                                    const val = weights[cat.id] ?? 0;
                                    return (
                                      <div key={cat.id} className="flex items-center gap-2">
                                        <Tooltip text={WEIGHT_CATEGORY_TIPS[cat.id] ?? `How much this builder values ${cat.label.toLowerCase()} when scoring placements.`}>
                                          <span className="w-20 shrink-0 truncate text-xs text-slate-400">{cat.label}</span>
                                        </Tooltip>
                                        <input
                                          type="range"
                                          min={0}
                                          max={5}
                                          step={0.1}
                                          value={val}
                                          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-sky-400 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-sky-400"
                                          onChange={(event) => {
                                            const next = { ...weights, [cat.id]: Number(event.target.value) };
                                            updateBuilder(index, { objectiveWeightsJson: JSON.stringify(next) });
                                          }}
                                        />
                                        <span className="w-8 shrink-0 text-right font-mono text-[0.65rem] tabular-nums text-slate-300">
                                          {val.toFixed(1)}
                                        </span>
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                              <p className="text-[0.6rem] text-slate-500">
                                0 = ignored · 1 = neutral · higher = more important
                              </p>
                            </div>

                            {/* Strategy & Shifts */}
                            <div className="sm:col-span-2 space-y-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-3">
                              <div className="grid gap-3 sm:grid-cols-2">
                                <label className="space-y-1.5 text-sm text-slate-200">
                                  <span className="block font-medium"><Tooltip text="The opening strategy the builder uses at the start of a run (e.g. 'reinforce' strengthens existing structure, 'expand' grows outward).">Strategy</Tooltip></span>
                                  <select
                                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-50 outline-none transition focus:border-sky-400"
                                    value={builder.initialStrategy}
                                    onChange={(event) =>
                                      updateBuilder(index, { initialStrategy: event.target.value })
                                    }
                                  >
                                    {allStrategyShifts.map((s) => (
                                      <option key={s.id} value={s.id}>{s.label}</option>
                                    ))}
                                  </select>
                                </label>

                                <div className="space-y-1.5 text-sm text-slate-200">
                                  <span className="block font-medium">
                                    <Tooltip text="When enabled, the builder can switch strategies mid-run based on game state. Uncheck to lock it to the initial strategy only.">Shifts</Tooltip>
                                  </span>
                                  <label className="flex items-center gap-2 text-xs text-slate-400">
                                    <input
                                      type="checkbox"
                                      checked={builder.shiftsEnabled}
                                      className="h-3.5 w-3.5 shrink-0 rounded border border-white/20 bg-black/30 accent-sky-400"
                                      onChange={(event) =>
                                        updateBuilder(index, { shiftsEnabled: event.target.checked })
                                      }
                                    />
                                    Allow strategy shifts
                                  </label>
                                  {builder.shiftsEnabled && (
                                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                                      {allStrategyShifts.map((s) => (
                                        <label key={s.id} className="flex items-center gap-1.5 text-xs text-slate-300">
                                          <input
                                            type="checkbox"
                                            checked={builder.allowedStrategyShifts.includes(s.id)}
                                            className="h-3 w-3 rounded border border-white/20 bg-black/30 accent-sky-400"
                                            onChange={(event) => {
                                              const next = event.target.checked
                                                ? [...builder.allowedStrategyShifts, s.id]
                                                : builder.allowedStrategyShifts.filter((x) => x !== s.id);
                                              updateBuilder(index, { allowedStrategyShifts: next });
                                            }}
                                          />
                                          {s.label}
                                        </label>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {builder.shiftsEnabled && (
                                <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
                                  <span className="block text-xs font-medium text-slate-300">
                                    <Tooltip text="Adjust when strategy shifts trigger. Lower values make them fire sooner; higher values require more extreme conditions before shifting.">Shift Thresholds</Tooltip>
                                  </span>
                                  {builder.allowedStrategyShifts.includes("pillar") && (
                                    <label className="flex items-center gap-3 text-xs text-slate-400">
                                      <span className="w-28 shrink-0">
                                        <Tooltip text="Shift to Pillar when cantilever + unsupported height reaches this value. Lower = more cautious about structural risk.">Pillar (support risk)</Tooltip>
                                      </span>
                                      <input
                                        type="range"
                                        min="1"
                                        max="10"
                                        step="1"
                                        value={builder.shiftPillarThreshold}
                                        className="flex-1 accent-sky-400"
                                        onChange={(e) => updateBuilder(index, { shiftPillarThreshold: e.target.value })}
                                      />
                                      <span className="w-6 text-right font-mono text-slate-300">{builder.shiftPillarThreshold}</span>
                                    </label>
                                  )}
                                  {builder.allowedStrategyShifts.includes("reinforce") && (
                                    <label className="flex items-center gap-3 text-xs text-slate-400">
                                      <span className="w-28 shrink-0">
                                        <Tooltip text="Shift to Reinforce when exposed faces reaches this value. Lower = thickens structure sooner; higher = lets it stay branchy.">Reinforce (faces)</Tooltip>
                                      </span>
                                      <input
                                        type="range"
                                        min="2"
                                        max="20"
                                        step="1"
                                        value={builder.shiftReinforceThreshold}
                                        className="flex-1 accent-sky-400"
                                        onChange={(e) => updateBuilder(index, { shiftReinforceThreshold: e.target.value })}
                                      />
                                      <span className="w-6 text-right font-mono text-slate-300">{builder.shiftReinforceThreshold}</span>
                                    </label>
                                  )}
                                  {builder.allowedStrategyShifts.includes("wrap") && (
                                    <label className="flex items-center gap-3 text-xs text-slate-400">
                                      <span className="w-28 shrink-0">
                                        <Tooltip text="Shift to Wrap when enemy neighbor count reaches this value. Lower = reacts faster to nearby opponents.">Wrap (enemies)</Tooltip>
                                      </span>
                                      <input
                                        type="range"
                                        min="1"
                                        max="10"
                                        step="1"
                                        value={builder.shiftWrapThreshold}
                                        className="flex-1 accent-sky-400"
                                        onChange={(e) => updateBuilder(index, { shiftWrapThreshold: e.target.value })}
                                      />
                                      <span className="w-6 text-right font-mono text-slate-300">{builder.shiftWrapThreshold}</span>
                                    </label>
                                  )}
                                </div>
                              )}
                            </div>

                          <CollapsibleSection
                            className="sm:col-span-2"
                            title="Placement Rule Editor"
                            defaultOpen={false}
                            summary={
                              <>
                                <span className="text-green-400">{builder.customRule.cube1Offsets.length} C1</span>
                                <span className="text-blue-400">{builder.customRule.cube2Offsets.length} C2</span>
                                {builder.prioritizeShapes && <span>prioritized</span>}
                              </>
                            }
                          >
                            <div className="space-y-3">
                              <p className="text-[10px] leading-relaxed text-slate-500">
                                Paint <span className="text-green-400">green</span> cells where the first cube of the next brick can go (relative to the previous brick).
                                Then paint <span className="text-blue-400">blue</span> cells where the second cube can go (relative to Cube 1).
                                Click a cell to paint it; click again to remove.
                              </p>
                              <ShapeEditorCanvas
                                value={builder.customRule}
                                onChange={(next) => updateBuilder(index, { customRule: next })}
                              />
                              <label className="flex items-center gap-2 text-xs text-slate-400">
                                <input
                                  type="checkbox"
                                  checked={builder.prioritizeShapes}
                                  className="h-3.5 w-3.5 shrink-0 rounded border border-white/20 bg-black/30 accent-sky-400"
                                  onChange={(e) => updateBuilder(index, { prioritizeShapes: e.target.checked })}
                                />
                                <Tooltip text="When checked, the builder tries shapes in order of priority. When unchecked, all shapes are evaluated equally and the best-scoring one wins.">Prioritize shapes</Tooltip>
                              </label>
                            </div>
                          </CollapsibleSection>

                          <CollapsibleSection
                            className="sm:col-span-2"
                            title="More"
                            defaultOpen={false}
                            summary={
                              <>
                                <span className="max-w-[100px] truncate">{builder.id}</span>
                                <span className="hidden sm:inline">{shapeLabel}</span>
                                <span>{builder.maxPlacements} plc</span>
                              </>
                            }
                          >
                            <div className="grid gap-3 sm:grid-cols-2">
                            <label className="space-y-1.5 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 text-sm text-slate-200">
                              <span className="block font-medium"><Tooltip text="Whether each new brick must connect to the builder's most recent placement, enforcing a continuous chain of bricks.">Continuity</Tooltip></span>
                              <select
                                className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-50 outline-none transition focus:border-sky-400"
                                value={builder.continuityMode}
                                onChange={(event) =>
                                  updateBuilder(index, {
                                    continuityMode: event.target.value,
                                  })
                                }
                              >
                                {catalog.continuityModes.map((mode) => (
                                  <option key={mode.id} value={mode.id}>
                                    {mode.label}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="space-y-1.5 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 text-sm text-slate-200">
                              <span className="block font-medium"><Tooltip text="What the builder does when no valid placement exists — backtrack undoes past moves, stop halts the builder, skip waits a tick, fallback tries a random spot.">Failure policy</Tooltip></span>
                              <select
                                className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-50 outline-none transition focus:border-sky-400"
                                value={builder.failurePolicy}
                                onChange={(event) =>
                                  updateBuilder(index, {
                                    failurePolicy: event.target.value,
                                  })
                                }
                              >
                                {catalog.failurePolicies.map((policy) => (
                                  <option key={policy.id} value={policy.id}>
                                    {policy.label}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <div className="sm:col-span-2 grid grid-cols-3 gap-3">
                              {(["X", "Y", "Z"] as const).map((axis, axisIndex) => (
                                <label key={axis} className="space-y-1.5 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 text-sm text-slate-200">
                                  <span className="block font-medium">Start {axis}</span>
                                  <input
                                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-50 outline-none transition focus:border-sky-400"
                                    type="number"
                                    value={builder.startAnchor[axisIndex]}
                                    onChange={(event) =>
                                      updateBuilder(index, {
                                        startAnchor: builder.startAnchor.map(
                                          (value, anchorIndex) =>
                                            anchorIndex === axisIndex
                                              ? event.target.value
                                              : value,
                                        ) as [string, string, string],
                                      })
                                    }
                                  />
                                </label>
                              ))}
                            </div>

                            <label className="space-y-1.5 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 text-sm text-slate-200">
                              <span className="block font-medium"><Tooltip text="A unique name identifying this builder in logs, scores, and the 3D preview.">Id</Tooltip></span>
                              <input
                                className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-50 outline-none transition focus:border-sky-400"
                                type="text"
                                value={builder.id}
                                onChange={(event) =>
                                  updateBuilder(index, { id: event.target.value })
                                }
                              />
                            </label>

                            <label className="space-y-1.5 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 text-sm text-slate-200">
                              <span className="block font-medium"><Tooltip text="The display color used to render this builder's bricks in the 3D preview.">Color</Tooltip></span>
                              <input
                                className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-50 outline-none transition focus:border-sky-400"
                                type="text"
                                value={builder.color}
                                onChange={(event) =>
                                  updateBuilder(index, { color: event.target.value })
                                }
                              />
                            </label>

                            <label className="space-y-1.5 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 text-sm text-slate-200">
                              <span className="block font-medium"><Tooltip text="The brick geometry this builder places each tick (e.g. 1×1 single cube, 2×1 bar).">Shape</Tooltip></span>
                              <select
                                className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-50 outline-none transition focus:border-sky-400"
                                value={builder.shapeId}
                                onChange={(event) =>
                                  updateBuilder(index, { shapeId: event.target.value })
                                }
                              >
                                {catalog.shapes.map((shape) => (
                                  <option key={shape.id} value={shape.id}>
                                    {shape.label}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="space-y-1.5 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 text-sm text-slate-200">
                              <span className="block font-medium"><Tooltip text="Maximum number of bricks this builder is allowed to place during the simulation.">Placements</Tooltip></span>
                              <input
                                className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-50 outline-none transition focus:border-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={splitPlacementsFromTotalSteps}
                                min="0"
                                max="2000"
                                type="number"
                                value={builder.maxPlacements}
                                onChange={(event) =>
                                  updateBuilder(index, {
                                    maxPlacements: event.target.value,
                                  })
                                }
                              />
                            </label>

                            <label className="space-y-1.5 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 text-sm text-slate-200">
                              <span className="block font-medium"><Tooltip text="How many past placements the builder can undo when using the 'backtrack' failure policy.">Backtrack depth</Tooltip></span>
                              <input
                                className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-50 outline-none transition focus:border-sky-400"
                                min="1"
                                max="5000"
                                type="number"
                                value={builder.maxBacktrackDepth}
                                onChange={(event) =>
                                  updateBuilder(index, {
                                    maxBacktrackDepth: event.target.value,
                                  })
                                }
                              />
                            </label>

                            <label className="space-y-1.5 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 text-sm text-slate-200">
                              <span className="block font-medium"><Tooltip text="Mirror or rotational constraint on placements — e.g. mirror_x reflects every brick across the X axis.">Symmetry</Tooltip></span>
                              <select
                                className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-50 outline-none transition focus:border-sky-400"
                                value={builder.symmetryMode}
                                onChange={(event) =>
                                  updateBuilder(index, { symmetryMode: event.target.value })
                                }
                              >
                                {symmetryOptions.map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>

                            </div>
                          </CollapsibleSection>
                          </div>
                        </div>
                      </CollapsibleSection>
                    );
                  })}

              <CollapsibleSection
                title="Balance matchups"
                description="Multi-seed harness using the same builder configs as Generate (no SCAD export)."
                summary={
                  balanceResult ? (
                    <span>{balanceResult.matchCount} seeds</span>
                  ) : (
                    <span>Harness idle</span>
                  )
                }
              >
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="space-y-2 text-sm text-slate-200 sm:col-span-2">
                      <span className="block font-medium">Seeds (comma-separated)</span>
                      <input
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-slate-50 outline-none transition focus:border-sky-400"
                        type="text"
                        value={balanceSeeds}
                        onChange={(event) => setBalanceSeeds(event.target.value)}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-slate-200">
                      <span className="block font-medium">Steps / run</span>
                      <input
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-slate-50 outline-none transition focus:border-sky-400"
                        min={1}
                        max={2000}
                        type="number"
                        value={balanceTotalSteps}
                        onChange={(event) => setBalanceTotalSteps(event.target.value)}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-slate-200 sm:col-span-3">
                      <span className="block font-medium">Cage</span>
                      <input
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-slate-50 outline-none transition focus:border-sky-400"
                        min={10}
                        max={5000}
                        type="number"
                        value={balanceCubeCage}
                        onChange={(event) => setBalanceCubeCage(event.target.value)}
                      />
                    </label>
                  </div>
                  <button
                    className="w-full rounded-full border border-emerald-300/40 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-200 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={balanceLoading}
                    type="button"
                    onClick={() => void handleBalanceRun()}
                  >
                    {balanceLoading ? "Running balance…" : "Run balance series"}
                  </button>
                  {balanceError ? (
                    <p className="text-sm text-red-200">{balanceError}</p>
                  ) : null}
                  {balanceResult ? (
                    <div className="space-y-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-slate-200">
                      <div className="flex flex-wrap gap-3">
                        <Metric label="Matches" value={balanceResult.matchCount} />
                        <Metric
                          label="Avg score gap"
                          value={balanceResult.averageScoreGap}
                        />
                      </div>
                      <div>
                        <p className="text-[0.7rem] uppercase tracking-[0.2em] text-slate-400">
                          Win rates
                        </p>
                        <ul className="mt-2 space-y-1 text-slate-300">
                          {Object.entries(balanceResult.winRates).map(([id, rate]) => (
                            <li key={id}>
                              <span className="font-medium text-white">{id}</span>:{" "}
                              {(rate * 100).toFixed(1)}%
                            </li>
                          ))}
                        </ul>
                      </div>
                      <JsonBlock emptyLabel="No per-seed rows." value={balanceResult.results} />
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Calls POST /balance with the builders above. Requires an API that exposes the
                      balance endpoint.
                    </p>
                  )}
                </div>
              </CollapsibleSection>
          </div>

          <div className="studio-center studio-preview-workspace space-y-5">
            <StudioPanel className="p-4 lg:p-5">
            <p className="mb-3 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-sky-300/80">
              Visualization
            </p>
            {/* Timeline scrubber */}
            {result && maxTick > 0 && (
              <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10"
                    onClick={() => {
                      if (isPlaying) { stopPlayback(); } else { startPlayback(); }
                    }}
                    title={isPlaying ? "Pause" : "Play"}
                  >
                    {isPlaying ? "⏸" : "▶"}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={maxTick}
                    value={currentTick ?? maxTick}
                    className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-sky-400 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-sky-400"
                    onChange={(e) => {
                      stopPlayback();
                      setCurrentTick(Number(e.target.value));
                    }}
                  />
                  <button
                    type="button"
                    className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
                    onClick={() => { stopPlayback(); setCurrentTick(null); }}
                  >
                    Show All
                  </button>
                </div>
                {currentTickSnapshot && (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                    <span>Tick <span className="font-mono text-slate-200">{currentTickSnapshot.tick}</span></span>
                    <span>Bricks <span className="font-mono text-slate-200">{currentTickSnapshot.brickCount}</span></span>
                    <span>+<span className="font-mono text-slate-200">{currentTickSnapshot.placementsThisTick ?? 0}</span> this tick</span>
                    <span>Active <span className="font-mono text-slate-200">{currentTickSnapshot.activeBuilders ?? "?"}</span></span>
                    {currentTickSnapshot.scoresByBuilder && (
                      <>
                        {Object.entries(currentTickSnapshot.scoresByBuilder).map(([bid, score]) => (
                          <span key={bid}>{bid}: <span className="font-mono text-slate-200">{score}</span></span>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            <BrickPreviewCanvas
              bricks={tickFilteredBricks}
              className="mt-4 h-[520px] sm:h-[560px] lg:h-[calc(100vh-13rem)] lg:min-h-[680px]"
            />

            <div className="mt-4 space-y-5 border-t border-white/10 pt-4">
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">
                <label className="flex flex-wrap items-center gap-3">
                  <span className="font-medium text-white">Viewer filter</span>
                  <select
                    className="rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-slate-50 outline-none transition focus:border-sky-400"
                    value={selectedBuilderFilter}
                    onChange={(event) => setSelectedBuilderFilter(event.target.value)}
                  >
                    <option value="all">All builders</option>
                    {result?.builders.map((builder) => (
                      <option key={builder.id} value={builder.id}>
                        {builder.id}
                      </option>
                    )) ?? null}
                  </select>
                </label>
                <StatusLight
                  label={selectedBuilderFilter === "all" ? "All builders" : selectedBuilderFilter}
                  tone="neutral"
                />
                <p className="text-slate-400">
                  Showing {tickFilteredBricks.length} cube{tickFilteredBricks.length === 1 ? "" : "s"}
                  {currentTick !== null && (
                    <span className="ml-1 text-slate-500">(tick {currentTick}/{maxTick})</span>
                  )}
                  .
                </p>
              </div>

              <PanelHeader
                eyebrow="Brick Builder Studio"
                title="Rule-driven generator workspace"
                description="Preview shows committed cubes from the latest simulation. Filter by builder to inspect continuity; open Run Diagnostics on the right for metrics and traces."
              />

              <PanelHeader
                eyebrow="Run Diagnostics"
                title="Output and runtime details"
                description="These panels follow the current run so the preview stays visible while deeper diagnostics remain available on demand."
              />
            </div>
          </StudioPanel>

          {error ? (
            <StudioPanel className="border border-red-400/25 bg-[linear-gradient(180deg,rgba(127,29,29,0.78),rgba(69,10,10,0.72))] p-4">
              <PanelHeader
                title="Generation error"
                description={error}
                actions={<StatusLight label="Attention" tone="bad" />}
              />
            </StudioPanel>
          ) : null}
          </div>

          <StudioPanel className="studio-diagnostics-rail studio-side-rail p-4 lg:p-5">
            <p className="mb-1 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-sky-300/80">
              Run Diagnostics
            </p>
            <div className="space-y-4">
                <CollapsibleSection
                  title="Builder Scores"
                  titleTooltip="Each builder's final score is the sum of seven weighted objective categories (territory, surface, enclosure, chain, support, choke, symmetry) plus a strategy bonus, accumulated over every placement. Higher scores indicate the builder achieved more of what its archetype optimizes for. Expand 'How are scores calculated?' below for the full formula."
                  description="Per-builder scores and strategy state."
                  defaultOpen
                  summary={result ? <span>{result.builderStates.length} builders</span> : <span>No run yet</span>}
                >
                  {result?.builderStates && result.builderStates.length > 0 ? (
                    <>
                    <details className="group mb-3 rounded-xl border border-white/10 bg-black/25">
                      <summary className="cursor-pointer px-3 py-2 text-[11px] font-medium text-sky-300/80 hover:text-sky-200 select-none">
                        How are scores calculated?
                      </summary>
                      <div className="space-y-2 border-t border-white/10 px-3 py-3 text-[11px] leading-relaxed text-slate-400">
                        <p className="text-slate-300">
                          <strong className="text-slate-200">Total score</strong> = sum of (raw metric &times; weight) for each category, plus a strategy bonus.
                        </p>
                        <table className="w-full text-left text-[10px]">
                          <thead className="text-[9px] uppercase tracking-wider text-slate-500">
                            <tr><th className="pb-1 pr-2">Category</th><th className="pb-1">Raw metric</th></tr>
                          </thead>
                          <tbody className="text-slate-400">
                            <tr><td className="pr-2 py-0.5 text-slate-300">Territory</td><td>Empty orthogonal neighbor cells controlled (frontier size)</td></tr>
                            <tr><td className="pr-2 py-0.5 text-slate-300">Surface</td><td>Exposed faces of the placed shape</td></tr>
                            <tr><td className="pr-2 py-0.5 text-slate-300">Enclosure</td><td>friendly_neighbors &times; 1.5 &minus; exposed_faces &times; 0.35 (clamped &ge; 0)</td></tr>
                            <tr><td className="pr-2 py-0.5 text-slate-300">Chain</td><td>Manhattan distance from anchor to continuity reference (in brick units) + leaf bonus</td></tr>
                            <tr><td className="pr-2 py-0.5 text-slate-300">Support</td><td>support_contacts &times; 1.8 + path bonus (4.0) &minus; cantilever &times; 2.5 &minus; unsupported_height &times; 2.0</td></tr>
                            <tr><td className="pr-2 py-0.5 text-slate-300">Choke</td><td>choke_points + enemy contact builders (blocking/contesting opponents)</td></tr>
                            <tr><td className="pr-2 py-0.5 text-slate-300">Symmetry</td><td>Reduction in structural imbalance vs. the builder&apos;s symmetry axis (0 when mode is &quot;none&quot;)</td></tr>
                          </tbody>
                        </table>
                        <p>
                          The <span className="text-slate-300">strategy bonus</span> is an additional unweighted term that rewards placements aligned with the current strategy
                          (e.g., expand rewards frontier control, wrap rewards enemy contact, pillar rewards vertical support, reinforce rewards neighbor balance).
                        </p>
                        <p>
                          Each category&apos;s raw metric is multiplied by its <span className="text-slate-300">objective weight</span> from the builder&apos;s archetype (or per-builder override).
                          Weights are set in the Builder Rule Sets panel under Objective Weights.
                        </p>
                      </div>
                    </details>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {result.builderStates.map((bs) => (
                        <div key={bs.id} className="space-y-2 rounded-xl border border-white/10 bg-black/30 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-semibold text-slate-100">{bs.id}</span>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              bs.status === "active" ? "bg-green-500/20 text-green-300" :
                              bs.status === "completed" ? "bg-sky-500/20 text-sky-300" :
                              "bg-red-500/20 text-red-300"
                            }`}>{bs.status}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5 text-center">
                            <div className="min-w-0">
                              <div className="font-mono text-xs tabular-nums leading-snug text-slate-100">
                                {typeof bs.score === "number" ? bs.score.toFixed(1) : "—"}
                              </div>
                              <div className="text-[10px] uppercase tracking-wide text-slate-500">Score</div>
                            </div>
                            <div className="min-w-0">
                              <div className="font-mono text-xs tabular-nums leading-snug text-slate-100">
                                {bs.placementCount}
                              </div>
                              <div className="text-[10px] uppercase tracking-wide text-slate-500">Placements</div>
                            </div>
                            <div className="min-w-0">
                              <div className="truncate font-mono text-[11px] leading-snug text-slate-200" title={bs.currentStrategy ?? undefined}>
                                {bs.currentStrategy ?? "—"}
                              </div>
                              <div className="text-[10px] uppercase tracking-wide text-slate-500">Strategy</div>
                            </div>
                          </div>
                          {bs.scoreBreakdown && Object.keys(bs.scoreBreakdown).length > 0 && (
                            <div className="space-y-0.5 border-t border-white/5 pt-2">
                              <div className="text-[10px] uppercase tracking-wide text-slate-500">Breakdown</div>
                              <div className="grid grid-cols-1 gap-0.5 text-[11px] sm:grid-cols-2">
                                {Object.entries(bs.scoreBreakdown).map(([cat, val]) => (
                                  <div key={cat} className="flex justify-between gap-2">
                                    <span className="min-w-0 truncate text-slate-400">{cat}</span>
                                    <span className="shrink-0 font-mono tabular-nums text-slate-200">
                                      {typeof val === "number" ? val.toFixed(2) : val}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {bs.archetype && (
                            <div className="text-[11px] leading-snug text-slate-500">
                              Archetype: <span className="text-slate-400">{bs.archetype}</span>
                              {bs.symmetryMode && bs.symmetryMode !== "none" && (
                                <span> · Sym: {bs.symmetryMode}</span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    </>
                  ) : (
                    <p className="text-xs text-slate-500">Run the generator to see builder scores.</p>
                  )}
                </CollapsibleSection>

                <CollapsibleSection
                  title="Run Summary"
                  titleTooltip="Top-level outcome of the latest generation: how many bricks and placements were made, which seed and cage size were used, and download links for SCAD/JSON exports. Use this to quickly confirm a run succeeded and grab export files."
                  description="API target, result metrics, and export actions."
                  defaultOpen
                  summary={
                    result ? (
                      <>
                        <span>{result.metadata.brickCount} bricks</span>
                        <span>{result.metadata.placementCount} placements</span>
                      </>
                    ) : (
                      <span>Awaiting first run</span>
                    )
                  }
                >
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
                      <p className="text-[0.7rem] uppercase tracking-[0.22em] text-slate-400">
                        API target
                      </p>
                      <p className="mt-2 break-all text-sm text-slate-200">{DEFAULT_API_URL}</p>
                    </div>

                    {result ? (
                      <>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          <Metric label="Bricks" value={result.metadata.brickCount} />
                          <Metric label="Placements" value={result.metadata.placementCount} />
                          <Metric label="Builders" value={result.metadata.builderCount} />
                          <Metric label="Brick unit" value={result.metadata.brickUnit} />
                          <Metric label="Seed" value={result.metadata.seed ?? "random"} />
                          <Metric label="Cage" value={result.metadata.cubeCage} />
                        </div>

                        {downloadUrl || jsonDownloadUrl ? (
                          <div className="flex flex-wrap gap-3">
                            {downloadUrl ? (
                              <a
                                className="inline-flex rounded-full border border-sky-300/30 px-4 py-2 font-medium text-sky-200 transition hover:border-sky-200 hover:text-white"
                                href={downloadUrl}
                                rel="noreferrer"
                                target="_blank"
                              >
                                Download SCAD export
                              </a>
                            ) : null}
                            {jsonDownloadUrl ? (
                              <a
                                className="inline-flex rounded-full border border-emerald-300/30 px-4 py-2 font-medium text-emerald-200 transition hover:border-emerald-200 hover:text-white"
                                href={jsonDownloadUrl}
                                rel="noreferrer"
                                target="_blank"
                              >
                                Download JSON export
                              </a>
                            ) : null}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-400">
                            This run rendered in Three.js only and did not save export files.
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-slate-400">
                        Run the generator to populate metrics, exports, and diagnostics.
                      </p>
                    )}
                  </div>
                </CollapsibleSection>

                <CollapsibleSection
                  title="Builder Configs Used"
                  titleTooltip="The exact JSON payload sent to the API for each builder — archetype, brick shape, objective weights, strategy shifts, symmetry mode, and buildability constraints. Useful for verifying that overrides were applied correctly or reproducing a run."
                  description="Serialized builder inputs sent with the latest generation request."
                  summary={result ? <span>{result.builders.length} builders</span> : <span>No run yet</span>}
                >
                  <JsonBlock
                    emptyLabel="Run the generator to inspect the builder configs used for the latest result."
                    value={result?.builders}
                  />
                </CollapsibleSection>

                <CollapsibleSection
                  title="Timeline (recent ticks)"
                  titleTooltip="Step-by-step simulation log: each row is one tick showing how many bricks were placed that step, which builders were active vs. blocked, cumulative brick count, and running per-builder scores. Use this to spot when builders stall or surge."
                  description="Per-tick snapshots from the simulation (newest first in the table)."
                  summary={
                    recentTimeline.length > 0 ? (
                      <span>{recentTimeline.length} ticks shown</span>
                    ) : (
                      <span>No timeline</span>
                    )
                  }
                >
                  {recentTimeline.length > 0 ? (
                    <div className="max-h-64 overflow-auto rounded-2xl border border-white/10">
                      <table className="w-full min-w-[520px] border-collapse text-left text-xs text-slate-200">
                        <thead className="sticky top-0 bg-black/80 text-[0.65rem] uppercase tracking-wider text-slate-400">
                          <tr>
                            <th className="border-b border-white/10 px-3 py-2">Tick</th>
                            <th className="border-b border-white/10 px-3 py-2">Placements Δ</th>
                            <th className="border-b border-white/10 px-3 py-2">Active</th>
                            <th className="border-b border-white/10 px-3 py-2">Blocked</th>
                            <th className="border-b border-white/10 px-3 py-2">Bricks</th>
                            <th className="border-b border-white/10 px-3 py-2">Events</th>
                            <th className="border-b border-white/10 px-3 py-2">Scores</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...recentTimeline].reverse().map((snap) => (
                            <tr
                              key={snap.tick}
                              className="border-b border-white/5 odd:bg-black/20"
                            >
                              <td className="px-3 py-2 font-mono">{snap.tick}</td>
                              <td className="px-3 py-2">
                                {"placementsThisTick" in snap && snap.placementsThisTick != null
                                  ? String(snap.placementsThisTick)
                                  : "—"}
                              </td>
                              <td className="px-3 py-2">
                                {"activeBuilders" in snap && snap.activeBuilders != null
                                  ? String(snap.activeBuilders)
                                  : "—"}
                              </td>
                              <td className="px-3 py-2">
                                {"blockedBuilders" in snap && snap.blockedBuilders != null
                                  ? String(snap.blockedBuilders)
                                  : "—"}
                              </td>
                              <td className="px-3 py-2">
                                {snap.brickCount != null ? String(snap.brickCount) : "—"}
                              </td>
                              <td className="px-3 py-2">
                                {snap.events?.length != null ? snap.events.length : "—"}
                              </td>
                              <td className="max-w-[200px] truncate px-3 py-2 text-slate-400">
                                {snap.scoresByBuilder
                                  ? Object.entries(snap.scoresByBuilder)
                                      .map(([id, v]) => `${id}:${Number(v).toFixed(1)}`)
                                      .join(" ")
                                  : snap.builders
                                      ?.map((b) => `${b.id}:${b.score ?? b.placementCount}`)
                                      .join(" ") ?? "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">
                      Run a simulation to populate the timeline. Older engines may use a different
                      snapshot shape; raw data remains in the full JSON export.
                    </p>
                  )}
                </CollapsibleSection>

                <CollapsibleSection
                  title="Placement telemetry"
                  titleTooltip="Detailed row per brick placed: which builder, what strategy it was using, the score delta added by that placement, per-category breakdown (territory, surface, enclosure, chain, support, choke), structural support status, and whether a strategy shift occurred. Reveals exactly why each placement was chosen."
                  description="Recent placed events with score and support context."
                  summary={
                    placementTelemetry.length > 0 ? (
                      <span>{placementTelemetry.length} placements</span>
                    ) : (
                      <span>No placements</span>
                    )
                  }
                >
                  {placementTelemetry.length > 0 ? (
                    <div className="max-h-72 overflow-auto rounded-2xl border border-white/10">
                      <table className="w-full min-w-[720px] border-collapse text-left text-xs text-slate-200">
                        <thead className="sticky top-0 bg-black/80 text-[0.65rem] uppercase tracking-wider text-slate-400">
                          <tr>
                            <th className="border-b border-white/10 px-2 py-2">Tick</th>
                            <th className="border-b border-white/10 px-2 py-2">Builder</th>
                            <th className="border-b border-white/10 px-2 py-2">Strategy</th>
                            <th className="border-b border-white/10 px-2 py-2">Δ</th>
                            <th className="border-b border-white/10 px-2 py-2">Run / total</th>
                            <th className="border-b border-white/10 px-2 py-2">Breakdown</th>
                            <th className="border-b border-white/10 px-2 py-2">Support</th>
                            <th className="border-b border-white/10 px-2 py-2">Strategy Δ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {placementTelemetry.map((event, rowIndex) => (
                            <tr
                              key={`${event.tick}-${event.builderId}-${event.placementId}-${rowIndex}`}
                              className="border-b border-white/5 odd:bg-black/20"
                            >
                              <td className="px-2 py-2 font-mono">{event.tick}</td>
                              <td className="px-2 py-2">{event.builderId}</td>
                              <td className="max-w-[120px] truncate px-2 py-2">{event.strategy}</td>
                              <td className="px-2 py-2 font-mono">{telemetryDelta(event)}</td>
                              <td className="px-2 py-2 font-mono">{telemetryRunning(event)}</td>
                              <td className="max-w-[220px] truncate px-2 py-2 text-slate-400">
                                {formatTelemetryScoreSummary(event)}
                              </td>
                              <td className="px-2 py-2 font-mono text-[0.65rem]">
                                {telemetrySupport(event)}
                              </td>
                              <td className="max-w-[140px] truncate px-2 py-2 text-slate-400">
                                {event.strategyBefore != null || event.strategyAfter != null
                                  ? `${event.strategyBefore ?? "—"} → ${event.strategyAfter ?? "—"}`
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">
                      No placement trace events yet, or the run did not record scored placements.
                    </p>
                  )}
                </CollapsibleSection>

                <CollapsibleSection
                  title="Recent Trace Events"
                  titleTooltip="Raw engine event log (last 20, newest first): every action including placed, skipped, backtracked, blocked, and strategy_shift events with tick number, builder ID, and reason. The primary tool for debugging why a builder stalled, changed strategy, or was blocked."
                  description="Last 20 trace events, newest first."
                  summary={recentTrace.length > 0 ? <span>{recentTrace.length} events</span> : <span>No events yet</span>}
                >
                  <JsonBlock
                    emptyLabel="Trace events will appear here after the simulation runs."
                    value={recentTrace}
                  />
                </CollapsibleSection>

                <CollapsibleSection
                  title="Export Paths And Raw Response"
                  titleTooltip="Backend file paths where SCAD and JSON exports were written, plus the complete raw API response payload. Use this for programmatic inspection, copy-paste debugging, or verifying that export files landed where expected."
                  description="Low-level payload and file destinations for the latest run."
                  summary={result ? <span>Payload ready</span> : <span>No payload yet</span>}
                >
                  {result ? (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-xs leading-6 text-slate-300">
                        <p>SCAD path: {result.metadata.outputPath ?? "not saved"}</p>
                        <p>JSON path: {result.metadata.jsonOutputPath ?? "not saved"}</p>
                      </div>
                      <JsonBlock emptyLabel="" value={result} />
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">
                      The raw API payload will appear here after a successful run.
                    </p>
                  )}
                </CollapsibleSection>
            </div>
          </StudioPanel>
          </div>
        </form>
      </main>
    </div>
  );
}
