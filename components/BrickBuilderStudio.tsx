"use client";

import { FormEvent, useMemo, useState } from "react";

import { BrickPreviewCanvas, type BrickRecord } from "@/components/BrickPreviewCanvas";

type SimulationResponse = {
  metadata: {
    totalSteps: number;
    brickUnit: number;
    cubeCage: number;
    brickCount: number;
    outputPath: string | null;
    jsonOutputPath: string | null;
    seed: number | null;
  };
  bricks: BrickRecord[];
  scad: string;
  downloadUrl: string | null;
  jsonDownloadUrl: string | null;
};

const DEFAULT_API_URL = process.env.NEXT_PUBLIC_BRICK_API_URL ?? "http://127.0.0.1:8000";

export function BrickBuilderStudio() {
  const [totalSteps, setTotalSteps] = useState("200");
  const [seed, setSeed] = useState("");
  const [fileName, setFileName] = useState("sample.scad");
  const [saveScad, setSaveScad] = useState(true);
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
          seed: seed === "" ? null : Number(seed),
          saveScad,
          fileName,
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
              The Python service stays responsible for the brick algorithm. This UI sends it
              generation settings, receives structured brick data, renders the model in
              Three.js, and links to the saved OpenSCAD export.
            </p>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[360px,minmax(0,1fr)]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20 backdrop-blur">
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
                </div>
              ) : (
                <p className="text-zinc-400">
                  Run the generator to populate the preview and export details.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <BrickPreviewCanvas bricks={result?.bricks ?? []} />
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm leading-7 text-zinc-300 backdrop-blur">
              <p>
                The live preview uses the Python API&apos;s brick-instance JSON rather than
                parsing `sample.scad`. That keeps browser rendering fast while preserving
                OpenSCAD output for export workflows.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
