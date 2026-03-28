"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { BrickPreviewCanvas, type BrickRecord } from "@/components/BrickPreviewCanvas";
import {
  CollapsibleSection,
  JsonBlock,
  Metric,
  PanelHeader,
  StatusLight,
  StudioPanel,
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
};

type CatalogResponse = {
  shapes: CatalogOption[];
  placementRules: CatalogOption[];
  failurePolicies: CatalogOption[];
  continuityModes: CatalogOption[];
  archetypes?: CatalogOption[];
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
  previousStrategy?: string | null;
  strategyChanged?: boolean | null;
  selectionMode?: string | null;
  selectedCandidate?: unknown;
  score?: {
    total?: number;
    deltaVsNextBest?: number;
    categoryBreakdown?: Record<string, number>;
  } | null;
  markers?: { support?: boolean; choke?: boolean } | null;
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
    { id: "competitive_growth", label: "Competitive Growth" },
  ],
  failurePolicies: [
    { id: "backtrack", label: "Backtrack Through History" },
    { id: "stop", label: "Stop Builder" },
    { id: "skip", label: "Skip Tick" },
    { id: "fallback_random", label: "Fallback To Random Placement" },
  ],
  continuityModes: [{ id: "strict", label: "Strict Continuity" }],
  archetypes: [{ id: "territorial", label: "Territorial" }],
  symmetryModes: [{ id: "none", label: "None" }],
  scoringCategories: [],
  defaultBuilders: [
    {
      id: "red",
      color: "Red",
      shapeId: "bar_2x1",
      startAnchor: [0, 0, 0],
      placementRuleId: "alternating_sideways_vertical",
      maxPlacements: 200,
      failurePolicy: "backtrack",
      continuityMode: "strict",
      maxBacktrackDepth: 200,
      archetype: "territorial",
      selectionMode: "legacy",
      symmetryMode: "none",
      objectiveWeights: {},
    },
    {
      id: "blue",
      color: "Blue",
      shapeId: "bar_2x1",
      startAnchor: [40, 0, 0],
      placementRuleId: "alternating_sideways_vertical",
      maxPlacements: 200,
      failurePolicy: "backtrack",
      continuityMode: "strict",
      maxBacktrackDepth: 200,
      archetype: "territorial",
      selectionMode: "legacy",
      symmetryMode: "none",
      objectiveWeights: {},
    },
  ],
};

function toBuilderInput(builder: CatalogResponse["defaultBuilders"][number]): BuilderInput {
  const weights = builder.objectiveWeights ?? {};
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
    archetype: builder.archetype ?? "territorial",
    selectionMode: builder.selectionMode ?? "legacy",
    symmetryMode: builder.symmetryMode ?? "none",
    objectiveWeightsJson: JSON.stringify(weights),
  };
}

function createBuilder(index: number): BuilderInput {
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
    archetype: DEFAULT_CATALOG.archetypes?.[0]?.id ?? "territorial",
    selectionMode: "legacy",
    symmetryMode: DEFAULT_CATALOG.symmetryModes?.[0]?.id ?? "none",
    objectiveWeightsJson: "{}",
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
      allowedStrategyShifts: [],
      initialStrategy: null,
      buildabilityProfile: {},
    });
  }
  return { ok: true as const, builders: payload };
}

function formatTelemetryScoreSummary(event: TraceEvent): string {
  if (event.score && typeof event.score === "object") {
    const breakdown = event.score.categoryBreakdown;
    if (breakdown && Object.keys(breakdown).length > 0) {
      return Object.entries(breakdown)
        .slice(0, 5)
        .map(([key, value]) => `${key}:${Number(value).toFixed(2)}`)
        .join(" ");
    }
    if (event.score.total != null) {
      return `total ${Number(event.score.total).toFixed(3)}`;
    }
  }
  if (event.scores && event.scores.length > 0) {
    return event.scores
      .slice(0, 5)
      .map((line) => `${line.category}:${Number(line.points).toFixed(2)}`)
      .join(" ");
  }
  return "—";
}

function telemetryDelta(event: TraceEvent): string {
  if (event.score?.deltaVsNextBest != null) {
    return Number(event.score.deltaVsNextBest).toFixed(3);
  }
  if (event.scoreDelta != null) {
    return Number(event.scoreDelta).toFixed(3);
  }
  return "—";
}

function telemetryRunning(event: TraceEvent): string {
  if (event.score?.total != null) {
    return Number(event.score.total).toFixed(3);
  }
  if (event.runningScore != null) {
    return Number(event.runningScore).toFixed(3);
  }
  return "—";
}

function telemetrySupport(event: TraceEvent): string {
  if (event.markers) {
    return `s:${event.markers.support ? "Y" : "N"} c:${event.markers.choke ? "Y" : "N"}`;
  }
  const parts: string[] = [];
  if (event.supported != null) {
    parts.push(`sup:${event.supported ? "Y" : "N"}`);
  }
  if (event.supportPathExists != null) {
    parts.push(`path:${event.supportPathExists ? "Y" : "N"}`);
  }
  return parts.length > 0 ? parts.join(" ") : "—";
}

export function BrickBuilderStudio() {
  const [totalSteps, setTotalSteps] = useState("200");
  const [cubeCage, setCubeCage] = useState("200");
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
          currentBuilders.length > 0 ? currentBuilders : payload.defaultBuilders.map(toBuilderInput),
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

  const recentTrace = useMemo(
    () => result?.trace.slice(-20).reverse() ?? [],
    [result],
  );

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
      <main className="studio-workspace mx-auto min-h-screen w-full max-w-[1500px] px-4 py-4 sm:px-6 lg:px-8">
        <StudioPanel className="studio-control-rail p-4">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <PanelHeader
                title="Control Rail"
                description="Builder settings stay on the left so the preview workspace remains visible while you tune the run."
                actions={
                  <button
                    className="rounded-full bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:bg-sky-400/50"
                    disabled={isLoading}
                    type="submit"
                  >
                    {isLoading ? "Generating..." : "Generate model"}
                  </button>
                }
              />

              <CollapsibleSection
                title="Generation Settings"
                description="High-level run controls for the shared simulation."
                defaultOpen
                summary={
                  <>
                    <span>{totalSteps} steps</span>
                    <span>{cubeCage} cage</span>
                  </>
                }
              >
                <div className="grid gap-3">
                  <label className="space-y-2 text-sm text-slate-200" htmlFor="totalSteps">
                    <span className="block font-medium">Total steps</span>
                    <input
                      id="totalSteps"
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-slate-50 outline-none transition focus:border-sky-400"
                      min="1"
                      max="2000"
                      type="number"
                      value={totalSteps}
                      onChange={(event) => setTotalSteps(event.target.value)}
                    />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-2 text-sm text-slate-200" htmlFor="seed">
                      <span className="block font-medium">Seed</span>
                      <input
                        id="seed"
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-slate-50 outline-none transition focus:border-sky-400"
                        placeholder="Optional"
                        type="number"
                        value={seed}
                        onChange={(event) => setSeed(event.target.value)}
                      />
                    </label>

                    <label className="space-y-2 text-sm text-slate-200" htmlFor="cubeCage">
                      <span className="block font-medium">Cage size</span>
                      <input
                        id="cubeCage"
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-slate-50 outline-none transition focus:border-sky-400"
                        min="10"
                        max="5000"
                        type="number"
                        value={cubeCage}
                        onChange={(event) => setCubeCage(event.target.value)}
                      />
                    </label>
                  </div>

                  <label className="space-y-2 text-sm text-slate-200" htmlFor="fileName">
                    <span className="block font-medium">Export file name</span>
                    <input
                      id="fileName"
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-slate-50 outline-none transition focus:border-sky-400"
                      type="text"
                      value={fileName}
                      onChange={(event) => setFileName(event.target.value)}
                    />
                  </label>

                  <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-200">
                    <input
                      checked={saveScad}
                      className="h-4 w-4 accent-sky-400"
                      type="checkbox"
                      onChange={(event) => setSaveScad(event.target.checked)}
                    />
                    Save an OpenSCAD export in `backend/exports/`
                  </label>
                </div>
              </CollapsibleSection>

              <CollapsibleSection
                title="Builder Rule Sets"
                description="Each builder runs against the same occupied grid, so collapsing each card keeps the rail readable."
                defaultOpen
                summary={<span>{builders.length} configured</span>}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-white">Rule set collection</p>
                      <p className="text-xs leading-5 text-slate-400">
                        Add or trim builders without losing sight of the preview workspace.
                      </p>
                    </div>
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
                        description="Collapse finished rule cards to keep the left rail compact."
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
                              <span className="block font-medium">Id</span>
                              <input
                                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-slate-50 outline-none transition focus:border-sky-400"
                                type="text"
                                value={builder.id}
                                onChange={(event) =>
                                  updateBuilder(index, { id: event.target.value })
                                }
                              />
                            </label>

                            <label className="space-y-2 text-sm text-slate-200">
                              <span className="block font-medium">Color</span>
                              <input
                                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-slate-50 outline-none transition focus:border-sky-400"
                                type="text"
                                value={builder.color}
                                onChange={(event) =>
                                  updateBuilder(index, { color: event.target.value })
                                }
                              />
                            </label>

                            <label className="space-y-2 text-sm text-slate-200">
                              <span className="block font-medium">Shape</span>
                              <select
                                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-slate-50 outline-none transition focus:border-sky-400"
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

                            <label className="space-y-2 text-sm text-slate-200">
                              <span className="block font-medium">Placement rule</span>
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

                            <label className="space-y-2 text-sm text-slate-200">
                              <span className="block font-medium">Placements</span>
                              <input
                                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-slate-50 outline-none transition focus:border-sky-400"
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

                            <label className="space-y-2 text-sm text-slate-200">
                              <span className="block font-medium">Failure policy</span>
                              <select
                                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-slate-50 outline-none transition focus:border-sky-400"
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

                            <label className="space-y-2 text-sm text-slate-200">
                              <span className="block font-medium">Continuity</span>
                              <select
                                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-slate-50 outline-none transition focus:border-sky-400"
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

                            <label className="space-y-2 text-sm text-slate-200 sm:col-span-2">
                              <span className="block font-medium">Backtrack depth</span>
                              <input
                                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-slate-50 outline-none transition focus:border-sky-400"
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

                            <label className="space-y-2 text-sm text-slate-200">
                              <span className="block font-medium">Archetype</span>
                              <select
                                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-slate-50 outline-none transition focus:border-sky-400"
                                value={builder.archetype}
                                onChange={(event) =>
                                  updateBuilder(index, { archetype: event.target.value })
                                }
                              >
                                {archetypeOptions.map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="space-y-2 text-sm text-slate-200">
                              <span className="block font-medium">Selection mode</span>
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

                            <label className="space-y-2 text-sm text-slate-200">
                              <span className="block font-medium">Symmetry</span>
                              <select
                                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-slate-50 outline-none transition focus:border-sky-400"
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

                            <label className="space-y-2 text-sm text-slate-200 sm:col-span-2">
                              <span className="block font-medium">Objective weights (JSON)</span>
                              <textarea
                                className="min-h-[88px] w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-xs text-slate-50 outline-none transition focus:border-sky-400"
                                spellCheck={false}
                                value={builder.objectiveWeightsJson}
                                onChange={(event) =>
                                  updateBuilder(index, {
                                    objectiveWeightsJson: event.target.value,
                                  })
                                }
                              />
                              <span className="block text-xs text-slate-500">
                                Use catalog scoring category ids as keys, or {"{}"} for archetype
                                defaults.
                              </span>
                            </label>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-3">
                            {(["X", "Y", "Z"] as const).map((axis, axisIndex) => (
                              <label key={axis} className="space-y-2 text-sm text-slate-200">
                                <span className="block font-medium">Start {axis}</span>
                                <input
                                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-slate-50 outline-none transition focus:border-sky-400"
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
                        </div>
                      </CollapsibleSection>
                    );
                  })}
                </div>
              </CollapsibleSection>

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
            </form>
        </StudioPanel>

        <div className="space-y-5">
          <StudioPanel className="p-4 lg:p-5">
            <PanelHeader
              eyebrow="Brick Builder Studio"
              title="Rule-driven generator workspace"
              description="Tune builders on the left and keep the Three.js scene in view on the right while runtime details stay tucked into collapsible panels below."
              actions={
                <div className="flex flex-wrap gap-2">
                  <StatusLight
                    label={isLoading ? "Generating" : result ? "Ready" : "Idle"}
                    tone={generationTone}
                  />
                  <StatusLight label="Builders" tone="info" value={builders.length} />
                  <StatusLight label="Visible cubes" tone="info" value={filteredBricks.length} />
                  <StatusLight
                    label={downloadUrl || jsonDownloadUrl ? "Exports saved" : "Exports pending"}
                    tone={exportTone}
                  />
                </div>
              }
            />

            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">
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
                Showing {filteredBricks.length} cube{filteredBricks.length === 1 ? "" : "s"}.
              </p>
            </div>

            <BrickPreviewCanvas
              bricks={filteredBricks}
              className="mt-4 h-[520px] sm:h-[560px] lg:h-[calc(100vh-13rem)] lg:min-h-[680px]"
            />

            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm leading-7 text-slate-300">
              <p>
                The live preview renders the committed cube instances from the simulation.
                Filter by builder to inspect continuity and use the diagnostics below to
                understand why a builder placed, skipped, backtracked, or stopped.
              </p>
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

          <StudioPanel className="p-4 lg:p-5">
            <PanelHeader
              eyebrow="Run Diagnostics"
              title="Output and runtime details"
              description="These panels follow the current run so the preview stays visible while deeper diagnostics remain available on demand."
            />

            <div className="mt-4 space-y-4">
                <CollapsibleSection
                  title="Run Summary"
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
                  description="Serialized builder inputs sent with the latest generation request."
                  summary={result ? <span>{result.builders.length} builders</span> : <span>No run yet</span>}
                >
                  <JsonBlock
                    emptyLabel="Run the generator to inspect the builder configs used for the latest result."
                    value={result?.builders}
                  />
                </CollapsibleSection>

                <CollapsibleSection
                  title="Builder Runtime State"
                  description="Per-builder runtime details returned by the simulation."
                  summary={result ? <span>{result.builderStates.length} runtime records</span> : <span>No run yet</span>}
                >
                  <JsonBlock
                    emptyLabel="Runtime state will appear here after the first successful run."
                    value={result?.builderStates}
                  />
                </CollapsibleSection>

                <CollapsibleSection
                  title="Timeline (recent ticks)"
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
                  description="Recent placed events with score and support context (when provided by the engine)."
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
                            <th className="border-b border-white/10 px-2 py-2">Sel.</th>
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
                              <td className="px-2 py-2">{event.selectionMode ?? "—"}</td>
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
                                  : event.previousStrategy != null
                                    ? String(event.previousStrategy)
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
      </main>
    </div>
  );
}
