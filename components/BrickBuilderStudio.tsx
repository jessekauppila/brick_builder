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
};

type CatalogOption = {
  id: string;
  label: string;
};

type CatalogResponse = {
  shapes: CatalogOption[];
  placementRules: CatalogOption[];
  failurePolicies: CatalogOption[];
  continuityModes: CatalogOption[];
  defaultBuilders: {
    id: string;
    color: string;
    shapeId: string;
    startAnchor: [number, number, number];
    placementRuleId: string;
    maxPlacements: number;
    failurePolicy: string;
    continuityMode: string;
    maxBacktrackDepth: number | null;
  }[];
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
  }[];
  builderStates: BuilderRuntimeState[];
  bricks: BrickRecord[];
  trace: TraceEvent[];
  scad: string;
  downloadUrl: string | null;
  jsonDownloadUrl: string | null;
};

const DEFAULT_API_URL = process.env.NEXT_PUBLIC_BRICK_API_URL ?? "http://127.0.0.1:8000";
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
  ],
  failurePolicies: [
    { id: "backtrack", label: "Backtrack Through History" },
    { id: "stop", label: "Stop Builder" },
    { id: "skip", label: "Skip Tick" },
    { id: "fallback_random", label: "Fallback To Random Placement" },
  ],
  continuityModes: [{ id: "strict", label: "Strict Continuity" }],
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
    },
  ],
};

function toBuilderInput(builder: CatalogResponse["defaultBuilders"][number]): BuilderInput {
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
  };
}

function getOptionLabel(options: CatalogOption[], value: string) {
  return options.find((option) => option.id === value)?.label ?? value;
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
      <main className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
        <StudioPanel className="p-5 lg:p-6">
          <PanelHeader
            eyebrow="Brick Builder Studio"
            title="Rule-driven generator workspace"
            description="Configure high-level generation settings and per-builder rule sets on the left, then inspect the committed bricks, runtime state, and exports on the right."
            actions={
              <div className="flex flex-wrap gap-2">
                <StatusLight
                  label={isLoading ? "Generating" : result ? "Ready" : "Idle"}
                  tone={generationTone}
                />
                <StatusLight
                  label="Builders"
                  tone="info"
                  value={builders.length}
                />
                <StatusLight
                  label={downloadUrl || jsonDownloadUrl ? "Exports saved" : "Exports pending"}
                  tone={exportTone}
                />
              </div>
            }
          />
        </StudioPanel>

        <section className="grid items-start gap-5 lg:grid-cols-[360px,minmax(0,1fr)] xl:grid-cols-[380px,minmax(0,1fr)]">
          <StudioPanel className="p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
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
            </form>
          </StudioPanel>

          <div className="space-y-5">
            <StudioPanel className="p-4 lg:p-5">
              <PanelHeader
                title="Preview Workspace"
                description="The viewer stays dominant while run diagnostics and export details live in collapsible panels below it."
                actions={
                  <div className="flex flex-wrap gap-2">
                    <StatusLight
                      label="Visible cubes"
                      tone="info"
                      value={filteredBricks.length}
                    />
                    <StatusLight
                      label={selectedBuilderFilter === "all" ? "All builders" : selectedBuilderFilter}
                      tone="neutral"
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
                <p className="text-slate-400">
                  Showing {filteredBricks.length} cube{filteredBricks.length === 1 ? "" : "s"}.
                </p>
              </div>

              <BrickPreviewCanvas
                bricks={filteredBricks}
                className="mt-4 h-[520px] lg:h-[calc(100vh-18rem)] lg:min-h-[620px]"
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
        </section>
      </main>
    </div>
  );
}
