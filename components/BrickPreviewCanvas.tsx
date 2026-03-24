"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

export type BrickRecord = {
  id: number;
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  builderId?: string | null;
  shapeId?: string | null;
  placementId?: string | null;
  tick?: number | null;
  supported?: boolean | null;
  strategy?: string | null;
  score?: number | null;
};

type SceneBounds = {
  center: [number, number, number];
  radius: number;
};

function getSceneBounds(bricks: BrickRecord[]): SceneBounds {
  if (bricks.length === 0) {
    return { center: [0, 0, 0], radius: 40 };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const brick of bricks) {
    const [x, y, z] = brick.position;
    const [width, height, depth] = brick.size;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
    maxZ = Math.max(maxZ, z + depth);
  }

  return {
    center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
    radius: Math.max(maxX - minX, maxY - minY, maxZ - minZ, 40),
  };
}

function InstancedBricks({
  bricks,
  displayMode,
  highlightedPlacementIds,
}: {
  bricks: BrickRecord[];
  displayMode: "builder" | "support";
  highlightedPlacementIds: Set<string>;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const bounds = useMemo(() => getSceneBounds(bricks), [bricks]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }

    const tempObject = new THREE.Object3D();
    const tempColor = new THREE.Color();

    bricks.forEach((brick, index) => {
      const [x, y, z] = brick.position;
      const [width, height, depth] = brick.size;

      tempObject.position.set(x + width / 2, y + height / 2, z + depth / 2);
      tempObject.scale.set(width, height, depth);
      tempObject.updateMatrix();

      mesh.setMatrixAt(index, tempObject.matrix);
      const baseColor =
        displayMode === "support"
          ? brick.supported
            ? "#22c55e"
            : "#ef4444"
          : brick.color;
      tempColor.set(baseColor);
      if (brick.placementId && highlightedPlacementIds.has(brick.placementId)) {
        tempColor.lerp(new THREE.Color("#f8fafc"), 0.38);
      }
      mesh.setColorAt(index, tempColor);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [bricks]);

  return (
    <>
      <gridHelper args={[bounds.radius * 2, 20, "#52525b", "#27272a"]} />
      <axesHelper args={[bounds.radius * 0.75]} />
      <instancedMesh ref={meshRef} args={[undefined, undefined, bricks.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.4} metalness={0.05} />
      </instancedMesh>
      <OrbitControls
        makeDefault
        target={bounds.center}
        minDistance={20}
        maxDistance={bounds.radius * 8}
      />
    </>
  );
}

export function BrickPreviewCanvas({
  bricks,
  className = "",
  displayMode = "builder",
  highlightedPlacementIds = [],
}: {
  bricks: BrickRecord[];
  className?: string;
  displayMode?: "builder" | "support";
  highlightedPlacementIds?: string[];
}) {
  if (bricks.length === 0) {
    return (
      <div
        className={`flex h-[480px] items-center justify-center rounded-3xl border border-dashed border-white/15 bg-black/30 text-sm text-zinc-400 ${className}`}
      >
        Generate a model to preview it in Three.js.
      </div>
    );
  }

  const bounds = getSceneBounds(bricks);
  const [centerX, centerY, centerZ] = bounds.center;
  const cameraNear = Math.max(bounds.radius / 500, 0.1);
  const cameraFar = bounds.radius * 24;
  const cameraPosition: [number, number, number] = [
    centerX + bounds.radius * 2.5,
    centerY + bounds.radius * 1.8,
    centerZ + bounds.radius * 2.5,
  ];

  return (
    <div
      className={`h-[480px] overflow-hidden rounded-3xl border border-white/10 bg-[#050816] shadow-2xl shadow-black/30 ${className}`}
    >
      <Canvas camera={{ position: cameraPosition, fov: 45, near: cameraNear, far: cameraFar }}>
        <color attach="background" args={["#050816"]} />
        <ambientLight intensity={1.2} />
        <directionalLight position={[30, 45, 25]} intensity={1.8} />
        <directionalLight position={[-20, -10, -25]} intensity={0.5} color="#7dd3fc" />
        <InstancedBricks
          bricks={bricks}
          displayMode={displayMode}
          highlightedPlacementIds={new Set(highlightedPlacementIds)}
        />
      </Canvas>
    </div>
  );
}
