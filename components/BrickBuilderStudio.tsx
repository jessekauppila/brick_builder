"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { BrickPreviewCanvas, type BrickRecord } from "@/components/BrickPreviewCanvas";

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
      <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-6 py-10 lg:px-10">
        <section className="space-y-4">
          <p className="text-sm uppercase tracking-[0.3em] text-sky-300">
            Local Python + Three.js
          </p>
          <div className="space-y-3">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
              Generate brick models in Python and preview them instantly in the browser.
            </h1>
            <p className="max-w-3xl text-base leading-7 text-zinc-300 sm:text-lg">
              The Python service now treats each colored builder as its own rule set, so
              one simulation tick can place a red shape, a blue shape, and any future
              builders you add to the shared world.
            </p>
          </div>
        </section>

        <section className="grid items-start gap-6 lg:grid-cols-[420px,minmax(0,1fr)] xl:grid-cols-[440px,minmax(0,1fr)]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20 backdrop-blur lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-zinc-200" htmlFor="totalSteps">
                  Total steps
                </label>
                <input
                  id="totalSteps"
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-zinc-50 outline-none transition focus:border-sky-400"
                  min="1"
                  max="2000"
                  type="number"
                  value={totalSteps}
                  onChange={(event) => setTotalSteps(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-zinc-200" htmlFor="seed">
                  Seed
                </label>
                <input
                  id="seed"
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-zinc-50 outline-none transition focus:border-sky-400"
                  placeholder="Optional"
                  type="number"
                  value={seed}
                  onChange={(event) => setSeed(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-zinc-200" htmlFor="cubeCage">
                  Cage size
                </label>
                <input
                  id="cubeCage"
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-zinc-50 outline-none transition focus:border-sky-400"
                  min="10"
                  max="5000"
                  type="number"
                  value={cubeCage}
                  onChange={(event) => setCubeCage(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-zinc-200" htmlFor="fileName">
                  Export file name
                </label>
                <input
                  id="fileName"
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-zinc-50 outline-none transition focus:border-sky-400"
                  type="text"
                  value={fileName}
                  onChange={(event) => setFileName(event.target.value)}
                />
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

              <div className="space-y-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-100">Builder rule sets</p>
                    <p className="mt-1 text-xs leading-6 text-zinc-400">
                      Each step runs every builder in order against the same occupied grid.
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

                <div className="space-y-4">
                  {builders.map((builder, index) => (
                    <div
                      key={`${builder.id}-${index}`}
                      className="space-y-4 rounded-2xl border border-white/10 bg-black/30 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-zinc-100">
                          Builder {index + 1}
                        </p>
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
                          <span className="block font-medium">Continuity</span>
                          <select
                            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-zinc-50 outline-none transition focus:border-sky-400"
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
                    </div>
                  ))}
                </div>
              </div>

              <button
                className="w-full rounded-2xl bg-sky-400 px-4 py-3 font-medium text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:bg-sky-400/50"
                disabled={isLoading}
                type="submit"
              >
                {isLoading ? "Generating..." : "Generate model"}
              </button>
            </form>

            <div className="mt-6 space-y-4 border-t border-white/10 pt-6 text-sm text-zinc-300">
              <div>
                <p className="font-medium text-zinc-100">API target</p>
                <p className="mt-1 break-all text-zinc-400">{DEFAULT_API_URL}</p>
              </div>

              {error ? (
                <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-red-100">
                  {error}
                </div>
              ) : null}

              {result ? (
                <div className="space-y-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-zinc-400">Bricks</p>
                      <p className="text-lg font-semibold text-zinc-50">
                        {result.metadata.brickCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-zinc-400">Placements</p>
                      <p className="text-lg font-semibold text-zinc-50">
                        {result.metadata.placementCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-zinc-400">Builders</p>
                      <p className="text-lg font-semibold text-zinc-50">
                        {result.metadata.builderCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-zinc-400">Brick unit</p>
                      <p className="text-lg font-semibold text-zinc-50">
                        {result.metadata.brickUnit}
                      </p>
                    </div>
                    <div>
                      <p className="text-zinc-400">Seed</p>
                      <p className="text-lg font-semibold text-zinc-50">
                        {result.metadata.seed ?? "random"}
                      </p>
                    </div>
                    <div>
                      <p className="text-zinc-400">Cage</p>
                      <p className="text-lg font-semibold text-zinc-50">
                        {result.metadata.cubeCage}
                      </p>
                    </div>
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
                    <p className="text-zinc-300">
                      This run rendered in Three.js only and did not save export files.
                    </p>
                  )}

                  <details className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                    <summary className="cursor-pointer font-medium text-zinc-100">
                      Builder configs used
                    </summary>
                    <pre className="mt-3 overflow-x-auto text-xs leading-6 text-zinc-300">
                      {JSON.stringify(result.builders, null, 2)}
                    </pre>
                  </details>

                  <details className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                    <summary className="cursor-pointer font-medium text-zinc-100">
                      Builder runtime state
                    </summary>
                    <pre className="mt-3 overflow-x-auto text-xs leading-6 text-zinc-300">
                      {JSON.stringify(result.builderStates, null, 2)}
                    </pre>
                  </details>

                  <details className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                    <summary className="cursor-pointer font-medium text-zinc-100">
                      Recent trace events
                    </summary>
                    <pre className="mt-3 overflow-x-auto text-xs leading-6 text-zinc-300">
                      {JSON.stringify(recentTrace, null, 2)}
                    </pre>
                  </details>

                  <details className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                    <summary className="cursor-pointer font-medium text-zinc-100">
                      Export paths and raw response
                    </summary>
                    <div className="mt-3 space-y-2 text-xs leading-6 text-zinc-300">
                      <p>SCAD path: {result.metadata.outputPath ?? "not saved"}</p>
                      <p>JSON path: {result.metadata.jsonOutputPath ?? "not saved"}</p>
                    </div>
                    <pre className="mt-3 overflow-x-auto text-xs leading-6 text-zinc-300">
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  </details>
                </div>
              ) : (
                <p className="text-zinc-400">
                  Run the generator to populate the preview and export details.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300 backdrop-blur">
              <label className="flex items-center gap-3">
                <span className="font-medium text-zinc-100">Viewer filter</span>
                <select
                  className="rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-zinc-50 outline-none transition focus:border-sky-400"
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
              <p className="text-zinc-400">
                Showing {filteredBricks.length} cube{filteredBricks.length === 1 ? "" : "s"}.
              </p>
            </div>
            <BrickPreviewCanvas
              bricks={filteredBricks}
              className="lg:h-[calc(100vh-16rem)] lg:min-h-[620px]"
            />
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm leading-7 text-zinc-300 backdrop-blur">
              <p>
                The live preview renders the committed cube instances from the simulation.
                Filter by builder to inspect continuity and use the runtime state and trace
                panels to understand why a builder placed, skipped, backtracked, or stopped.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
