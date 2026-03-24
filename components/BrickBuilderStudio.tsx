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

type CatalogOption = {
  id: string;
  label: string;
};

type CatalogArchetype = CatalogOption & {
  defaultObjectiveWeights: Record<string, number>;
  allowedStrategyShifts: string[];
  initialStrategy: string;
  buildabilityProfile: {
    maxCantilever: number;
    maxUnsupportedHeight: number;
    requireSupportPath: boolean;
    allowPillarDrop: boolean;
    requireHostContact: boolean;
  };
  symmetryMode: string;
};

type BuildabilityInput = {
  maxCantilever: string;
  maxUnsupportedHeight: string;
  requireSupportPath: boolean;
  allowPillarDrop: boolean;
  requireHostContact: boolean;
};

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
  objectiveWeights: Record<string, string>;
  allowedStrategyShifts: string[];
  initialStrategy: string;
  buildabilityProfile: BuildabilityInput;
  symmetryMode: string;
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
  archetype: string;
  currentStrategy: string;
  allowedStrategyShifts: string[];
  symmetryMode: string;
  score: number;
  scoreBreakdown: Record<string, number>;
  buildabilityProfile: {
    maxCantilever: number;
    maxUnsupportedHeight: number;
    requireSupportPath: boolean;
    allowPillarDrop: boolean;
    requireHostContact: boolean;
  };
};

type ScoreEvent = {
  category: string;
  points: number;
  reason: string;
};

type TraceEvent = {
  tick: number;
  builderId: string;
  action: string;
  message: string;
  placementId: string | null;
  strategy: string | null;
  referenceCell: [number, number, number] | null;
  status: string | null;
  scoreDelta: number;
  scores: ScoreEvent[];
  runningScore: number;
  strategyBefore: string | null;
  strategyAfter: string | null;
  supportPathExists: boolean | null;
  supported: boolean | null;
};

type BuilderConfigResponse = {
  id: string;
  color: string;
  shapeId: string;
  startAnchor: [number, number, number];
  placementRuleId: string;
  maxPlacements: number;
  failurePolicy: string;
  continuityMode: string;
  maxBacktrackDepth: number | null;
  archetype: string;
  objectiveWeights: Record<string, number>;
  allowedStrategyShifts: string[];
  initialStrategy: string;
  buildabilityProfile: {
    maxCantilever: number;
    maxUnsupportedHeight: number;
    requireSupportPath: boolean;
    allowPillarDrop: boolean;
    requireHostContact: boolean;
  };
  symmetryMode: string;
};

type TickSnapshot = {
  tick: number;
  brickCount: number;
  placementCount: number;
  builders: BuilderRuntimeState[];
  events: TraceEvent[];
};

type CatalogResponse = {
  shapes: CatalogOption[];
  placementRules: CatalogOption[];
  failurePolicies: CatalogOption[];
  continuityModes: CatalogOption[];
  archetypes: CatalogArchetype[];
  strategyShifts: CatalogOption[];
  symmetryModes: CatalogOption[];
  scoringCategories: CatalogOption[];
  defaultBuilders: BuilderConfigResponse[];
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
  builders: BuilderConfigResponse[];
  builderStates: BuilderRuntimeState[];
  bricks: BrickRecord[];
  trace: TraceEvent[];
  timeline: TickSnapshot[];
  scad: string;
  downloadUrl: string | null;
  jsonDownloadUrl: string | null;
};

const DEFAULT_API_URL =
  process.env.NEXT_PUBLIC_BRICK_API_URL ?? "http://127.0.0.1:8000";
const DEFAULT_SCORING_CATEGORIES: CatalogOption[] = [
  { id: "territory", label: "Territory Control" },
  { id: "surface", label: "Exposed Surface" },
  { id: "enclosure", label: "Enclosure" },
  { id: "chain", label: "Chain Length" },
  { id: "support", label: "Support Quality" },
  { id: "choke", label: "Choke Pressure" },
  { id: "symmetry", label: "Symmetry" },
];
const DEFAULT_CATALOG: CatalogResponse = {
  shapes: [
    { id: "single_1x1", label: "1x1" },
    { id: "bar_2x1", label: "2x1 Bar" },
    { id: "bar_3x1", label: "3x1 Bar" },
  ],
  placementRules: [{ id: "competitive_growth", label: "Competitive Growth" }],
  failurePolicies: [
    { id: "backtrack", label: "Backtrack Through History" },
    { id: "stop", label: "Stop Builder" },
    { id: "skip", label: "Skip Tick" },
    { id: "fallback_random", label: "Fallback To Random Placement" },
  ],
  continuityModes: [{ id: "strict", label: "Strict Continuity" }],
  archetypes: [
    {
      id: "fortress",
      label: "Fortress",
      defaultObjectiveWeights: {
        territory: 0.6,
        surface: 0.5,
        enclosure: 2.2,
        chain: 0.3,
        support: 2,
        choke: 0.8,
        symmetry: 0.9,
      },
      allowedStrategyShifts: ["expand", "reinforce", "pillar"],
      initialStrategy: "reinforce",
      buildabilityProfile: {
        maxCantilever: 1,
        maxUnsupportedHeight: 2,
        requireSupportPath: true,
        allowPillarDrop: true,
        requireHostContact: false,
      },
      symmetryMode: "mirror_x",
    },
    {
      id: "vine",
      label: "Vine",
      defaultObjectiveWeights: {
        territory: 1,
        surface: 1.1,
        enclosure: 0.2,
        chain: 2.4,
        support: 0.7,
        choke: 1.7,
        symmetry: 0.1,
      },
      allowedStrategyShifts: ["expand", "wrap"],
      initialStrategy: "expand",
      buildabilityProfile: {
        maxCantilever: 2,
        maxUnsupportedHeight: 1,
        requireSupportPath: true,
        allowPillarDrop: false,
        requireHostContact: true,
      },
      symmetryMode: "none",
    },
    {
      id: "coral",
      label: "Coral",
      defaultObjectiveWeights: {
        territory: 0.9,
        surface: 2.3,
        enclosure: 0.4,
        chain: 1.7,
        support: 1,
        choke: 0.5,
        symmetry: 0.4,
      },
      allowedStrategyShifts: ["expand", "reinforce"],
      initialStrategy: "expand",
      buildabilityProfile: {
        maxCantilever: 2,
        maxUnsupportedHeight: 2,
        requireSupportPath: true,
        allowPillarDrop: false,
        requireHostContact: false,
      },
      symmetryMode: "radial",
    },
    {
      id: "territorial",
      label: "Territorial",
      defaultObjectiveWeights: {
        territory: 2.5,
        surface: 1.1,
        enclosure: 0.7,
        chain: 0.7,
        support: 1.1,
        choke: 1,
        symmetry: 0.2,
      },
      allowedStrategyShifts: ["expand", "wrap", "pillar"],
      initialStrategy: "expand",
      buildabilityProfile: {
        maxCantilever: 2,
        maxUnsupportedHeight: 2,
        requireSupportPath: true,
        allowPillarDrop: true,
        requireHostContact: false,
      },
      symmetryMode: "none",
    },
  ],
  strategyShifts: [
    { id: "expand", label: "Expand" },
    { id: "reinforce", label: "Reinforce" },
    { id: "wrap", label: "Wrap" },
    { id: "pillar", label: "Pillar" },
  ],
  symmetryModes: [
    { id: "none", label: "No Symmetry" },
    { id: "mirror_x", label: "Mirror Across X" },
    { id: "mirror_y", label: "Mirror Across Y" },
    { id: "radial", label: "Radial Balance" },
  ],
  scoringCategories: DEFAULT_SCORING_CATEGORIES,
  defaultBuilders: [
    {
      id: "fortress-red",
      color: "#ef4444",
      shapeId: "bar_2x1",
      startAnchor: [0, 0, 0],
      placementRuleId: "competitive_growth",
      maxPlacements: 180,
      failurePolicy: "backtrack",
      continuityMode: "strict",
      maxBacktrackDepth: 200,
      archetype: "fortress",
      objectiveWeights: {
        territory: 0.6,
        surface: 0.5,
        enclosure: 2.2,
        chain: 0.3,
        support: 2,
        choke: 0.8,
        symmetry: 0.9,
      },
      allowedStrategyShifts: ["expand", "reinforce", "pillar"],
      initialStrategy: "reinforce",
      buildabilityProfile: {
        maxCantilever: 1,
        maxUnsupportedHeight: 2,
        requireSupportPath: true,
        allowPillarDrop: true,
        requireHostContact: false,
      },
      symmetryMode: "mirror_x",
    },
    {
      id: "vine-blue",
      color: "#38bdf8",
      shapeId: "bar_2x1",
      startAnchor: [40, 0, 0],
      placementRuleId: "competitive_growth",
      maxPlacements: 180,
      failurePolicy: "backtrack",
      continuityMode: "strict",
      maxBacktrackDepth: 200,
      archetype: "vine",
      objectiveWeights: {
        territory: 1,
        surface: 1.1,
        enclosure: 0.2,
        chain: 2.4,
        support: 0.7,
        choke: 1.7,
        symmetry: 0.1,
      },
      allowedStrategyShifts: ["expand", "wrap"],
      initialStrategy: "expand",
      buildabilityProfile: {
        maxCantilever: 2,
        maxUnsupportedHeight: 1,
        requireSupportPath: true,
        allowPillarDrop: false,
        requireHostContact: true,
      },
      symmetryMode: "none",
    },
  ],
};

function toWeightStrings(weights: Record<string, number>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(weights).map(([key, value]) => [key, String(value)]),
  );
}

function buildabilityToInput(
  buildability: BuilderConfigResponse["buildabilityProfile"],
): BuildabilityInput {
  return {
    maxCantilever: String(buildability.maxCantilever),
    maxUnsupportedHeight: String(buildability.maxUnsupportedHeight),
    requireSupportPath: buildability.requireSupportPath,
    allowPillarDrop: buildability.allowPillarDrop,
    requireHostContact: buildability.requireHostContact,
  };
}

function toBuilderInput(builder: BuilderConfigResponse): BuilderInput {
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
    archetype: builder.archetype,
    objectiveWeights: toWeightStrings(builder.objectiveWeights),
    allowedStrategyShifts: [...builder.allowedStrategyShifts],
    initialStrategy: builder.initialStrategy,
    buildabilityProfile: buildabilityToInput(builder.buildabilityProfile),
    symmetryMode: builder.symmetryMode,
  };
}

function applyArchetypeDefaults(
  builder: BuilderInput,
  archetypeId: string,
  catalog: CatalogResponse,
): BuilderInput {
  const archetype = catalog.archetypes.find((item) => item.id === archetypeId);
  if (!archetype) {
    return { ...builder, archetype: archetypeId };
  }
  return {
    ...builder,
    archetype: archetypeId,
    objectiveWeights: toWeightStrings(archetype.defaultObjectiveWeights),
    allowedStrategyShifts: [...archetype.allowedStrategyShifts],
    initialStrategy: archetype.initialStrategy,
    buildabilityProfile: buildabilityToInput(archetype.buildabilityProfile),
    symmetryMode: archetype.symmetryMode,
  };
}

function createBuilder(index: number, catalog: CatalogResponse): BuilderInput {
  const fallback = catalog.defaultBuilders[index % catalog.defaultBuilders.length];
  if (fallback) {
    return toBuilderInput({
      ...fallback,
      id: `builder-${index + 1}`,
      startAnchor: [index * 20, index * 20, 0],
    });
  }
  return {
    id: `builder-${index + 1}`,
    color: "#22c55e",
    shapeId: catalog.shapes[0]?.id ?? "single_1x1",
    startAnchor: ["0", "0", "0"],
    placementRuleId: catalog.placementRules[0]?.id ?? "competitive_growth",
    maxPlacements: "120",
    failurePolicy: catalog.failurePolicies[0]?.id ?? "backtrack",
    continuityMode: catalog.continuityModes[0]?.id ?? "strict",
    maxBacktrackDepth: "120",
    archetype: catalog.archetypes[0]?.id ?? "fortress",
    objectiveWeights: toWeightStrings(
      catalog.archetypes[0]?.defaultObjectiveWeights ?? {},
    ),
    allowedStrategyShifts: [...(catalog.archetypes[0]?.allowedStrategyShifts ?? [])],
    initialStrategy: catalog.archetypes[0]?.initialStrategy ?? "expand",
    buildabilityProfile: buildabilityToInput(
      catalog.archetypes[0]?.buildabilityProfile ?? {
        maxCantilever: 2,
        maxUnsupportedHeight: 2,
        requireSupportPath: true,
        allowPillarDrop: false,
        requireHostContact: false,
      },
    ),
    symmetryMode: catalog.archetypes[0]?.symmetryMode ?? "none",
  };
}

function formatScore(value: number) {
  return value.toFixed(1);
}

function toneForStatus(status: string): "neutral" | "good" | "warn" | "bad" | "info" {
  if (status === "active") {
    return "info";
  }
  if (status === "completed") {
    return "good";
  }
  if (status === "blocked") {
    return "bad";
  }
  return "neutral";
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
  const [displayMode, setDisplayMode] = useState<"builder" | "support">("builder");
  const [playbackTick, setPlaybackTick] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
        setBuilders(payload.defaultBuilders.map(toBuilderInput));
      } catch {
        // Fall back to local defaults when the catalog endpoint is unavailable.
      }
    }

    loadCatalog();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!result?.timeline.length) {
      setPlaybackTick(0);
      setIsPlaying(false);
      return;
    }
    setPlaybackTick(result.timeline[result.timeline.length - 1]?.tick ?? 0);
    setIsPlaying(false);
  }, [result]);

  useEffect(() => {
    if (!isPlaying || !result?.timeline.length) {
      return;
    }
    const maxTick = result.timeline[result.timeline.length - 1]?.tick ?? 0;
    const timer = window.setInterval(() => {
      setPlaybackTick((current) => {
        if (current >= maxTick) {
          window.clearInterval(timer);
          setIsPlaying(false);
          return maxTick;
        }
        return current + 1;
      });
    }, 650);
    return () => window.clearInterval(timer);
  }, [isPlaying, result]);

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

  const timelineMaxTick = result?.timeline[result.timeline.length - 1]?.tick ?? 0;
  const currentSnapshot = useMemo(() => {
    if (!result?.timeline.length) {
      return null;
    }
    return (
      result.timeline.find((snapshot) => snapshot.tick === playbackTick) ??
      result.timeline[result.timeline.length - 1]
    );
  }, [playbackTick, result]);

  const filteredBricks = useMemo(() => {
    if (!result) {
      return [];
    }
    return result.bricks.filter((brick) => {
      if ((brick.tick ?? 0) > playbackTick) {
        return false;
      }
      return selectedBuilderFilter === "all"
        ? true
        : brick.builderId === selectedBuilderFilter;
    });
  }, [playbackTick, result, selectedBuilderFilter]);

  const highlightedPlacementIds = useMemo(
    () =>
      (currentSnapshot?.events ?? [])
        .map((event) => event.placementId)
        .filter((placementId): placementId is string => Boolean(placementId)),
    [currentSnapshot],
  );

  const liveEvents = useMemo(() => currentSnapshot?.events ?? [], [currentSnapshot]);
  const currentBuilders = useMemo(
    () =>
      [...(currentSnapshot?.builders ?? result?.builderStates ?? [])].sort(
        (left, right) => right.score - left.score,
      ),
    [currentSnapshot, result],
  );

  function updateBuilder(index: number, patch: Partial<BuilderInput>) {
    setBuilders((currentBuilders) =>
      currentBuilders.map((builder, builderIndex) =>
        builderIndex === index ? { ...builder, ...patch } : builder,
      ),
    );
  }

  function updateBuilderWeight(
    builderIndex: number,
    categoryId: string,
    value: string,
  ) {
    setBuilders((currentBuilders) =>
      currentBuilders.map((builder, index) =>
        index === builderIndex
          ? {
              ...builder,
              objectiveWeights: {
                ...builder.objectiveWeights,
                [categoryId]: value,
              },
            }
          : builder,
      ),
    );
  }

  function toggleStrategy(builderIndex: number, strategyId: string) {
    setBuilders((currentBuilders) =>
      currentBuilders.map((builder, index) => {
        if (index !== builderIndex) {
          return builder;
        }
        const nextStrategies = builder.allowedStrategyShifts.includes(strategyId)
          ? builder.allowedStrategyShifts.filter((item) => item !== strategyId)
          : [...builder.allowedStrategyShifts, strategyId];
        return {
          ...builder,
          allowedStrategyShifts: nextStrategies,
          initialStrategy: nextStrategies.includes(builder.initialStrategy)
            ? builder.initialStrategy
            : nextStrategies[0] ?? builder.initialStrategy,
        };
      }),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

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
          builders: builders.map((builder) => ({
            id: builder.id.trim(),
            color: builder.color.trim(),
            shapeId: builder.shapeId,
            startAnchor: builder.startAnchor.map((value) => Number(value)) as [
              number,
              number,
              number,
            ],
            placementRuleId: builder.placementRuleId,
            maxPlacements: Number(builder.maxPlacements),
            failurePolicy: builder.failurePolicy,
            continuityMode: builder.continuityMode,
            maxBacktrackDepth:
              builder.maxBacktrackDepth === ""
                ? null
                : Number(builder.maxBacktrackDepth),
            archetype: builder.archetype,
            objectiveWeights: Object.fromEntries(
              Object.entries(builder.objectiveWeights).map(([categoryId, value]) => [
                categoryId,
                Number(value),
              ]),
            ),
            allowedStrategyShifts: builder.allowedStrategyShifts,
            initialStrategy: builder.initialStrategy,
            buildabilityProfile: {
              maxCantilever: Number(builder.buildabilityProfile.maxCantilever),
              maxUnsupportedHeight: Number(
                builder.buildabilityProfile.maxUnsupportedHeight,
              ),
              requireSupportPath: builder.buildabilityProfile.requireSupportPath,
              allowPillarDrop: builder.buildabilityProfile.allowPillarDrop,
              requireHostContact: builder.buildabilityProfile.requireHostContact,
            },
            symmetryMode: builder.symmetryMode,
          })),
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

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#1d4ed8_0%,#0f172a_35%,#020617_100%)] text-zinc-50">
      <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-6 py-10 lg:px-10">
        <section className="space-y-4">
          <p className="text-sm uppercase tracking-[0.3em] text-sky-300">
            Competitive Builder Studio
          </p>
          <div className="space-y-3">
            <h1 className="max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">
              Tune competitive builders, then replay the growth battle tick by tick.
            </h1>
            <p className="max-w-4xl text-base leading-7 text-zinc-300 sm:text-lg">
              Mix archetypes, strategy shifts, support rules, and scoring weights, then
              scrub through the run to see where points are made and when silhouettes pivot.
            </p>
          </div>
        </section>

        <section className="grid items-start gap-6 lg:grid-cols-[450px,minmax(0,1fr)]">
          <StudioPanel className="space-y-5 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20 backdrop-blur lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
            <PanelHeader
              eyebrow="Simulation Setup"
              title="Competitive Builder Config"
              description="Set up each builder’s objective weights, shift menu, and buildability profile."
            />

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm text-zinc-200">
                  <span className="block font-medium">Total steps</span>
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-zinc-50 outline-none transition focus:border-sky-400"
                    min="1"
                    max="2000"
                    type="number"
                    value={totalSteps}
                    onChange={(event) => setTotalSteps(event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm text-zinc-200">
                  <span className="block font-medium">Cage size</span>
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-zinc-50 outline-none transition focus:border-sky-400"
                    min="10"
                    max="5000"
                    type="number"
                    value={cubeCage}
                    onChange={(event) => setCubeCage(event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm text-zinc-200">
                  <span className="block font-medium">Seed</span>
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-zinc-50 outline-none transition focus:border-sky-400"
                    placeholder="Optional"
                    type="number"
                    value={seed}
                    onChange={(event) => setSeed(event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm text-zinc-200">
                  <span className="block font-medium">Export file</span>
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-zinc-50 outline-none transition focus:border-sky-400"
                    type="text"
                    value={fileName}
                    onChange={(event) => setFileName(event.target.value)}
                  />
                </label>
              </div>

              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-200">
                <input
                  checked={saveScad}
                  className="h-4 w-4 accent-sky-400"
                  type="checkbox"
                  onChange={(event) => setSaveScad(event.target.checked)}
                />
                Save an OpenSCAD export in `backend/exports/`
              </label>

              <CollapsibleSection
                title="Builder Rule Sets"
                description="Each builder gets its own shape language, strategy menu, and structural tolerance."
                defaultOpen
                summary={
                  <button
                    className="rounded-full border border-sky-300/30 px-3 py-2 text-xs font-medium text-sky-200 transition hover:border-sky-200 hover:text-white"
                    type="button"
                    onClick={() =>
                      setBuilders((currentBuilders) => [
                        ...currentBuilders,
                        createBuilder(currentBuilders.length, catalog),
                      ])
                    }
                  >
                    Add builder
                  </button>
                }
              >
                <div className="space-y-4">
                  {builders.map((builder, index) => (
                    <div
                      key={`${builder.id}-${index}`}
                      className="space-y-4 rounded-3xl border border-white/10 bg-black/30 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-zinc-100">
                            Builder {index + 1}
                          </p>
                          <p className="text-xs text-zinc-400">{builder.archetype}</p>
                        </div>
                        {builders.length > 1 ? (
                          <button
                            className="text-xs font-medium text-red-200 transition hover:text-white"
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
                        <label className="space-y-2 text-sm text-zinc-200">
                          <span className="block font-medium">Id</span>
                          <input
                            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-zinc-50 outline-none transition focus:border-sky-400"
                            type="text"
                            value={builder.id}
                            onChange={(event) =>
                              updateBuilder(index, { id: event.target.value })
                            }
                          />
                        </label>
                        <label className="space-y-2 text-sm text-zinc-200">
                          <span className="block font-medium">Color</span>
                          <input
                            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-zinc-50 outline-none transition focus:border-sky-400"
                            type="text"
                            value={builder.color}
                            onChange={(event) =>
                              updateBuilder(index, { color: event.target.value })
                            }
                          />
                        </label>
                        <label className="space-y-2 text-sm text-zinc-200">
                          <span className="block font-medium">Archetype</span>
                          <select
                            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-zinc-50 outline-none transition focus:border-sky-400"
                            value={builder.archetype}
                            onChange={(event) =>
                              updateBuilder(
                                index,
                                applyArchetypeDefaults(
                                  builder,
                                  event.target.value,
                                  catalog,
                                ),
                              )
                            }
                          >
                            {catalog.archetypes.map((archetype) => (
                              <option key={archetype.id} value={archetype.id}>
                                {archetype.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-2 text-sm text-zinc-200">
                          <span className="block font-medium">Shape</span>
                          <select
                            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-zinc-50 outline-none transition focus:border-sky-400"
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
                        <label className="space-y-2 text-sm text-zinc-200">
                          <span className="block font-medium">Placement rule</span>
                          <select
                            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-zinc-50 outline-none transition focus:border-sky-400"
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
                        <label className="space-y-2 text-sm text-zinc-200">
                          <span className="block font-medium">Placements</span>
                          <input
                            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-zinc-50 outline-none transition focus:border-sky-400"
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
                        <label className="space-y-2 text-sm text-zinc-200">
                          <span className="block font-medium">Failure policy</span>
                          <select
                            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-zinc-50 outline-none transition focus:border-sky-400"
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
                        <label className="space-y-2 text-sm text-zinc-200">
                          <span className="block font-medium">Initial strategy</span>
                          <select
                            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-zinc-50 outline-none transition focus:border-sky-400"
                            value={builder.initialStrategy}
                            onChange={(event) =>
                              updateBuilder(index, {
                                initialStrategy: event.target.value,
                              })
                            }
                          >
                            {catalog.strategyShifts
                              .filter((option) =>
                                builder.allowedStrategyShifts.includes(option.id),
                              )
                              .map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.label}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label className="space-y-2 text-sm text-zinc-200">
                          <span className="block font-medium">Symmetry</span>
                          <select
                            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-zinc-50 outline-none transition focus:border-sky-400"
                            value={builder.symmetryMode}
                            onChange={(event) =>
                              updateBuilder(index, { symmetryMode: event.target.value })
                            }
                          >
                            {catalog.symmetryModes.map((mode) => (
                              <option key={mode.id} value={mode.id}>
                                {mode.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-2 text-sm text-zinc-200">
                          <span className="block font-medium">Backtrack depth</span>
                          <input
                            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-zinc-50 outline-none transition focus:border-sky-400"
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
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        {(["X", "Y", "Z"] as const).map((axis, axisIndex) => (
                          <label key={axis} className="space-y-2 text-sm text-zinc-200">
                            <span className="block font-medium">Start {axis}</span>
                            <input
                              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-zinc-50 outline-none transition focus:border-sky-400"
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

                      <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Strategy shifts
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {catalog.strategyShifts.map((option) => {
                            const isEnabled = builder.allowedStrategyShifts.includes(
                              option.id,
                            );
                            return (
                              <label
                                key={option.id}
                                className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs transition ${
                                  isEnabled
                                    ? "border-sky-300/40 bg-sky-400/10 text-sky-100"
                                    : "border-white/10 bg-black/20 text-slate-300"
                                }`}
                              >
                                <input
                                  checked={isEnabled}
                                  className="h-3.5 w-3.5 accent-sky-400"
                                  type="checkbox"
                                  onChange={() => toggleStrategy(index, option.id)}
                                />
                                {option.label}
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Objective weights
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {catalog.scoringCategories.map((category) => (
                            <label key={category.id} className="space-y-2 text-sm text-zinc-200">
                              <span className="block font-medium">{category.label}</span>
                              <input
                                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-zinc-50 outline-none transition focus:border-sky-400"
                                step="0.1"
                                type="number"
                                value={builder.objectiveWeights[category.id] ?? "0"}
                                onChange={(event) =>
                                  updateBuilderWeight(
                                    index,
                                    category.id,
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Buildability
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="space-y-2 text-sm text-zinc-200">
                            <span className="block font-medium">Max cantilever</span>
                            <input
                              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-zinc-50 outline-none transition focus:border-sky-400"
                              min="0"
                              type="number"
                              value={builder.buildabilityProfile.maxCantilever}
                              onChange={(event) =>
                                updateBuilder(index, {
                                  buildabilityProfile: {
                                    ...builder.buildabilityProfile,
                                    maxCantilever: event.target.value,
                                  },
                                })
                              }
                            />
                          </label>
                          <label className="space-y-2 text-sm text-zinc-200">
                            <span className="block font-medium">
                              Max unsupported height
                            </span>
                            <input
                              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-zinc-50 outline-none transition focus:border-sky-400"
                              min="0"
                              type="number"
                              value={builder.buildabilityProfile.maxUnsupportedHeight}
                              onChange={(event) =>
                                updateBuilder(index, {
                                  buildabilityProfile: {
                                    ...builder.buildabilityProfile,
                                    maxUnsupportedHeight: event.target.value,
                                  },
                                })
                              }
                            />
                          </label>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          {(
                            [
                              {
                                key: "requireSupportPath",
                                label: "Support path",
                              },
                              {
                                key: "allowPillarDrop",
                                label: "Allow pillar drop",
                              },
                              {
                                key: "requireHostContact",
                                label: "Require host contact",
                              },
                            ] as const
                          ).map((item) => (
                            <label
                              key={item.key}
                              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-200"
                            >
                              <input
                                checked={builder.buildabilityProfile[item.key]}
                                className="h-4 w-4 accent-sky-400"
                                type="checkbox"
                                onChange={(event) =>
                                  updateBuilder(index, {
                                    buildabilityProfile: {
                                      ...builder.buildabilityProfile,
                                      [item.key]: event.target.checked,
                                    },
                                  })
                                }
                              />
                              {item.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>

              <button
                className="w-full rounded-2xl bg-sky-400 px-4 py-3 font-medium text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:bg-sky-400/50"
                disabled={isLoading}
                type="submit"
              >
                {isLoading ? "Generating..." : "Generate competitive run"}
              </button>
            </form>

            <div className="space-y-3 border-t border-white/10 pt-5 text-sm text-zinc-300">
              <p className="font-medium text-zinc-100">API target</p>
              <p className="break-all text-zinc-400">{DEFAULT_API_URL}</p>
              {error ? (
                <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-red-100">
                  {error}
                </div>
              ) : null}
            </div>
          </StudioPanel>

          <div className="space-y-5">
            <StudioPanel className="space-y-5 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
              <PanelHeader
                eyebrow="Playback"
                title="Tick Replay And Scoreboard"
                description="Scrub the run to watch strategy pivots, score swings, and support risk evolve."
                actions={
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="rounded-full border border-white/10 px-4 py-2 text-sm text-zinc-100 transition hover:border-sky-300 hover:text-white"
                      type="button"
                      onClick={() => setPlaybackTick(0)}
                    >
                      Reset
                    </button>
                    <button
                      className="rounded-full border border-sky-300/30 px-4 py-2 text-sm text-sky-100 transition hover:border-sky-200 hover:text-white"
                      type="button"
                      onClick={() => setIsPlaying((current) => !current)}
                    >
                      {isPlaying ? "Pause" : "Play"}
                    </button>
                  </div>
                }
              />

              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
                <Metric
                  label="Tick"
                  value={result ? `${playbackTick}/${timelineMaxTick}` : "0/0"}
                />
                <Metric
                  label="Bricks"
                  value={currentSnapshot?.brickCount ?? result?.metadata.brickCount ?? 0}
                />
                <Metric
                  label="Placements"
                  value={
                    currentSnapshot?.placementCount ??
                    result?.metadata.placementCount ??
                    0
                  }
                />
                <Metric
                  label="Builders"
                  value={result?.metadata.builderCount ?? builders.length}
                />
                <Metric label="Seed" value={result?.metadata.seed ?? (seed || "random")} />
                <Metric label="Cage" value={result?.metadata.cubeCage ?? cubeCage} />
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr),300px]">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-300">
                    <label className="flex items-center gap-3">
                      <span className="font-medium text-zinc-100">Builder filter</span>
                      <select
                        className="rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-zinc-50 outline-none transition focus:border-sky-400"
                        value={selectedBuilderFilter}
                        onChange={(event) =>
                          setSelectedBuilderFilter(event.target.value)
                        }
                      >
                        <option value="all">All builders</option>
                        {result?.builders.map((builder) => (
                          <option key={builder.id} value={builder.id}>
                            {builder.id}
                          </option>
                        )) ?? null}
                      </select>
                    </label>
                    <label className="flex items-center gap-3">
                      <span className="font-medium text-zinc-100">Overlay</span>
                      <select
                        className="rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-zinc-50 outline-none transition focus:border-sky-400"
                        value={displayMode}
                        onChange={(event) =>
                          setDisplayMode(event.target.value as "builder" | "support")
                        }
                      >
                        <option value="builder">Builder colors</option>
                        <option value="support">Support risk</option>
                      </select>
                    </label>
                    <p className="text-zinc-400">
                      Showing {filteredBricks.length} cube
                      {filteredBricks.length === 1 ? "" : "s"} through tick {playbackTick}.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                    <input
                      className="w-full accent-sky-400"
                      disabled={!result}
                      max={timelineMaxTick}
                      min={0}
                      type="range"
                      value={playbackTick}
                      onChange={(event) => setPlaybackTick(Number(event.target.value))}
                    />
                  </div>

                  <BrickPreviewCanvas
                    bricks={filteredBricks}
                    className="lg:h-[calc(100vh-22rem)] lg:min-h-[620px]"
                    displayMode={displayMode}
                    highlightedPlacementIds={highlightedPlacementIds}
                  />
                </div>

                <div className="space-y-4">
                  <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                      Scoreboard
                    </p>
                    <div className="space-y-3">
                      {currentBuilders.length ? (
                        currentBuilders.map((builder) => (
                          <div
                            key={builder.id}
                            className="rounded-2xl border border-white/10 bg-black/30 p-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-white">
                                  {builder.id}
                                </p>
                                <p className="text-xs text-slate-400">
                                  {builder.archetype} · {builder.currentStrategy}
                                </p>
                              </div>
                              <StatusLight
                                label={builder.status}
                                tone={toneForStatus(builder.status)}
                                value={`${formatScore(builder.score)} pts`}
                              />
                            </div>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              {Object.entries(builder.scoreBreakdown)
                                .sort((left, right) => right[1] - left[1])
                                .slice(0, 4)
                                .map(([categoryId, value]) => (
                                  <div
                                    key={categoryId}
                                    className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300"
                                  >
                                    <p className="text-slate-400">{categoryId}</p>
                                    <p className="mt-1 font-semibold text-white">
                                      {formatScore(value)}
                                    </p>
                                  </div>
                                ))}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-400">
                          Generate a run to populate the scoreboard.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                      Tick events
                    </p>
                    <div className="space-y-3">
                      {liveEvents.length ? (
                        liveEvents.map((event, index) => (
                          <div
                            key={`${event.builderId}-${event.action}-${index}`}
                            className="rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-slate-200"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[0.7rem] uppercase tracking-[0.18em] text-slate-300">
                                {event.action}
                              </span>
                              <span className="font-semibold text-white">
                                {event.builderId}
                              </span>
                              {event.strategy ? (
                                <span className="text-sky-200">{event.strategy}</span>
                              ) : null}
                              {event.scoreDelta ? (
                                <span className="text-emerald-200">
                                  +{formatScore(event.scoreDelta)}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-2 text-slate-300">{event.message}</p>
                            {event.scores.length ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {event.scores.map((score) => (
                                  <span
                                    key={`${event.builderId}-${score.category}-${score.reason}`}
                                    className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-[0.7rem] text-emerald-100"
                                  >
                                    {score.category}: {formatScore(score.points)}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-400">
                          No events recorded for this tick yet.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </StudioPanel>

            <div className="grid gap-5 xl:grid-cols-[1.4fr,1fr]">
              <StudioPanel className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                <PanelHeader
                  eyebrow="Artifacts"
                  title="Exports And Runtime Data"
                  description="Download artifacts or inspect the structured payload driving the replay."
                />
                <div className="flex flex-wrap gap-3">
                  {downloadUrl ? (
                    <a
                      className="inline-flex rounded-full border border-sky-300/30 px-4 py-2 font-medium text-sky-200 transition hover:border-sky-200 hover:text-white"
                      href={downloadUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Download SCAD
                    </a>
                  ) : null}
                  {jsonDownloadUrl ? (
                    <a
                      className="inline-flex rounded-full border border-emerald-300/30 px-4 py-2 font-medium text-emerald-200 transition hover:border-emerald-200 hover:text-white"
                      href={jsonDownloadUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Download JSON
                    </a>
                  ) : null}
                </div>
                <CollapsibleSection title="Builder configs used" defaultOpen>
                  <JsonBlock
                    value={result?.builders ?? null}
                    emptyLabel="Generate a run to see builder configs."
                  />
                </CollapsibleSection>
                <CollapsibleSection title="Final runtime state">
                  <JsonBlock
                    value={result?.builderStates ?? null}
                    emptyLabel="Generate a run to see runtime state."
                  />
                </CollapsibleSection>
                <CollapsibleSection title="Recent trace">
                  <JsonBlock
                    value={result?.trace.slice(-25) ?? null}
                    emptyLabel="Generate a run to see trace events."
                  />
                </CollapsibleSection>
              </StudioPanel>

              <StudioPanel className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                <PanelHeader
                  eyebrow="Reading The Run"
                  title="What To Watch"
                  description="Use the replay to decide whether your scoring model is creating the silhouettes you want."
                />
                <div className="space-y-3 text-sm leading-7 text-zinc-300">
                  <p>
                    `builder` overlay emphasizes identity and territorial spread.
                    `support` overlay reveals whether the current structure stays buildable.
                  </p>
                  <p>
                    Strong rules produce visible shape changes when strategy shifts fire.
                    If the score moves but the silhouette barely changes, the weighting is
                    probably too abstract.
                  </p>
                  <p>
                    Choke, score, and symmetry events are there to explain why a run felt
                    cool or awkward, so you can tune the weights and thresholds deliberately.
                  </p>
                </div>
              </StudioPanel>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
