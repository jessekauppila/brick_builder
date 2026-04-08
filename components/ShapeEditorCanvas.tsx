"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useCallback, useMemo, useState } from "react";

type V3 = [number, number, number];
type PaintMode = "cube1" | "cube2";

export type PlacementRulePaint = {
  cube1Offsets: V3[];
  cube2Offsets: V3[];
};

const PREVIOUS_BRICK: V3[] = [
  [0, 0, 0],
  [1, 0, 0],
];

const CUBE1_REF: V3[] = [[0, 0, 0]];

function k(v: V3) {
  return `${v[0]},${v[1]},${v[2]}`;
}

function parse(s: string): V3 {
  return s.split(",").map(Number) as V3;
}

function toThree(v: V3): [number, number, number] {
  return [v[0], v[2], -v[1]];
}

function isAdjacent(a: V3, b: V3) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) === 1;
}

function adjacentToAny(cell: V3, refs: V3[]) {
  return refs.some((r) => isAdjacent(cell, r));
}

function buildSlots(refs: V3[], pad: number): V3[] {
  let x0 = Infinity,
    y0 = Infinity,
    z0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity,
    z1 = -Infinity;
  for (const [x, y, z] of refs) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  }
  const refSet = new Set(refs.map(k));
  const slots: V3[] = [];
  for (let x = x0 - pad; x <= x1 + pad; x++)
    for (let y = y0 - pad; y <= y1 + pad; y++)
      for (let z = Math.max(-1, z0 - 1); z <= z1 + pad; z++)
        if (!refSet.has(k([x, y, z]))) slots.push([x, y, z]);
  return slots;
}

function Cell({
  pos,
  color,
  opacity,
  wireframe,
  onClick,
  onEnter,
  onLeave,
}: {
  pos: V3;
  color: string;
  opacity: number;
  wireframe?: boolean;
  onClick?: () => void;
  onEnter?: () => void;
  onLeave?: () => void;
}) {
  const p = toThree(pos);
  return (
    <mesh
      position={p}
      onClick={
        onClick
          ? (e) => {
              e.stopPropagation();
              onClick();
            }
          : undefined
      }
      onPointerOver={
        onEnter
          ? (e) => {
              e.stopPropagation();
              onEnter();
            }
          : undefined
      }
      onPointerOut={onLeave}
    >
      <boxGeometry args={[0.92, 0.92, 0.92]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={opacity}
        wireframe={wireframe}
        depthWrite={opacity > 0.5}
      />
    </mesh>
  );
}

function EditorScene({
  mode,
  cube1Set,
  cube2Set,
  hovered,
  onToggle,
  onHover,
  onUnhover,
}: {
  mode: PaintMode;
  cube1Set: Set<string>;
  cube2Set: Set<string>;
  hovered: string | null;
  onToggle: (key: string) => void;
  onHover: (key: string) => void;
  onUnhover: () => void;
}) {
  const refs = mode === "cube1" ? PREVIOUS_BRICK : CUBE1_REF;
  const paintedSet = mode === "cube1" ? cube1Set : cube2Set;
  const paintColor = mode === "cube1" ? "#22c55e" : "#3b82f6";
  const refColor = mode === "cube1" ? "#64748b" : "#22c55e";

  const slots = useMemo(() => buildSlots(refs, 2), [mode]);

  const gridCenter = useMemo(() => {
    const cx = refs.reduce((s, v) => s + v[0], 0) / refs.length;
    const cy = refs.reduce((s, v) => s + v[1], 0) / refs.length;
    return toThree([cx, cy, 0] as V3);
  }, [mode]);

  return (
    <>
      <ambientLight intensity={1.0} />
      <directionalLight position={[5, 8, 5]} intensity={1.5} />
      <directionalLight position={[-3, -2, -5]} intensity={0.4} color="#7dd3fc" />

      {refs.map((cell) => (
        <Cell key={`ref-${k(cell)}`} pos={cell} color={refColor} opacity={0.88} />
      ))}

      {Array.from(paintedSet).map((key) => {
        const cell = parse(key);
        const isHov = hovered === key;
        return (
          <Cell
            key={`p-${key}`}
            pos={cell}
            color={paintColor}
            opacity={isHov ? 0.55 : 0.72}
            onClick={() => onToggle(key)}
            onEnter={() => onHover(key)}
            onLeave={onUnhover}
          />
        );
      })}

      {slots
        .filter((cell) => !paintedSet.has(k(cell)))
        .map((cell) => {
          const key = k(cell);
          const isHov = hovered === key;
          const adj = adjacentToAny(cell, refs);
          return (
            <Cell
              key={`s-${key}`}
              pos={cell}
              color={isHov ? paintColor : adj ? "#475569" : "#334155"}
              opacity={isHov ? 0.4 : adj ? 0.12 : 0.04}
              wireframe={!isHov}
              onClick={() => onToggle(key)}
              onEnter={() => onHover(key)}
              onLeave={onUnhover}
            />
          );
        })}

      <group position={[gridCenter[0], -0.52, gridCenter[2]]}>
        <gridHelper args={[10, 10, "#1e293b", "#1e293b"]} />
      </group>

      <OrbitControls
        makeDefault
        target={[gridCenter[0], 0.4, gridCenter[2]]}
        minDistance={3}
        maxDistance={14}
      />
    </>
  );
}

export function ShapeEditorCanvas({
  value,
  onChange,
}: {
  value: PlacementRulePaint;
  onChange: (next: PlacementRulePaint) => void;
}) {
  const [mode, setMode] = useState<PaintMode>("cube1");
  const [hovered, setHovered] = useState<string | null>(null);

  const cube1Set = useMemo(() => new Set(value.cube1Offsets.map(k)), [value.cube1Offsets]);
  const cube2Set = useMemo(() => new Set(value.cube2Offsets.map(k)), [value.cube2Offsets]);

  const toggle = useCallback(
    (key: string) => {
      if (mode === "cube1") {
        const next = new Set(cube1Set);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        onChange({ ...value, cube1Offsets: Array.from(next).map(parse) });
      } else {
        const next = new Set(cube2Set);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        onChange({ ...value, cube2Offsets: Array.from(next).map(parse) });
      }
    },
    [mode, cube1Set, cube2Set, value, onChange],
  );

  const clearMode = useCallback(() => {
    if (mode === "cube1") onChange({ ...value, cube1Offsets: [] });
    else onChange({ ...value, cube2Offsets: [] });
  }, [mode, value, onChange]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMode("cube1")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            mode === "cube1"
              ? "bg-green-500/20 text-green-300 ring-1 ring-green-500/30"
              : "bg-white/5 text-slate-400 hover:bg-white/10"
          }`}
        >
          Cube 1 Zones
        </button>
        <button
          type="button"
          onClick={() => setMode("cube2")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            mode === "cube2"
              ? "bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/30"
              : "bg-white/5 text-slate-400 hover:bg-white/10"
          }`}
        >
          Cube 2 Zones
        </button>
        <button
          type="button"
          onClick={clearMode}
          className="ml-auto rounded-lg bg-white/5 px-2.5 py-1.5 text-[10px] text-slate-500 transition hover:bg-red-500/10 hover:text-red-400"
        >
          Clear {mode === "cube1" ? "Cube 1" : "Cube 2"}
        </button>
      </div>

      <div className="flex gap-4 text-[10px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: mode === "cube1" ? "#64748b" : "#22c55e" }}
          />
          {mode === "cube1" ? "Previous brick (reference)" : "Cube 1 (reference)"}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: mode === "cube1" ? "#22c55e" : "#3b82f6" }}
          />
          {mode === "cube1" ? "Allowed Cube 1 spots" : "Allowed Cube 2 spots"}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm border border-slate-600" />
          Wireframe = click to paint
        </span>
      </div>

      <div className="h-[320px] overflow-hidden rounded-2xl border border-white/10 bg-[#050816] shadow-lg shadow-black/20">
        <Canvas camera={{ position: [5, 3.5, 5], fov: 40 }}>
          <color attach="background" args={["#050816"]} />
          <EditorScene
            mode={mode}
            cube1Set={cube1Set}
            cube2Set={cube2Set}
            hovered={hovered}
            onToggle={toggle}
            onHover={setHovered}
            onUnhover={() => setHovered(null)}
          />
        </Canvas>
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span>
          Cube 1 spots:{" "}
          <span className="font-mono text-green-400">{value.cube1Offsets.length}</span>
        </span>
        <span>
          Cube 2 spots:{" "}
          <span className="font-mono text-blue-400">{value.cube2Offsets.length}</span>
        </span>
        {value.cube1Offsets.length > 0 && value.cube2Offsets.length > 0 && (
          <span className="ml-auto text-[10px] text-slate-600">
            {value.cube1Offsets.length * value.cube2Offsets.length} possible combinations
          </span>
        )}
      </div>
    </div>
  );
}
