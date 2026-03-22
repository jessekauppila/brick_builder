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
};

function InstancedBricks({ bricks }: { bricks: BrickRecord[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const stats = useMemo(() => {
    if (bricks.length === 0) {
      return { center: [0, 0, 0] as [number, number, number], radius: 40 };
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

    const center: [number, number, number] = [
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      (minZ + maxZ) / 2,
    ];
    const radius = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 40);

    return { center, radius };
  }, [bricks]);

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
      mesh.setColorAt(index, tempColor.set(brick.color));
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, [bricks]);

  return (
    <>
      <gridHelper args={[stats.radius * 2, 20, "#52525b", "#27272a"]} />
      <axesHelper args={[stats.radius * 0.75]} />
      <instancedMesh ref={meshRef} args={[undefined, undefined, bricks.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.4} metalness={0.05} />
      </instancedMesh>
      <OrbitControls
        makeDefault
        target={stats.center}
        minDistance={20}
        maxDistance={stats.radius * 8}
      />
    </>
  );
}

export function BrickPreviewCanvas({ bricks }: { bricks: BrickRecord[] }) {
  if (bricks.length === 0) {
    return (
      <div className="flex h-[480px] items-center justify-center rounded-3xl border border-dashed border-white/15 bg-black/30 text-sm text-zinc-400">
        Generate a model to preview it in Three.js.
      </div>
    );
  }

  const maxDimension = bricks.reduce((largest, brick) => {
    const [x, y, z] = brick.position;
    const [width, height, depth] = brick.size;
    return Math.max(largest, Math.abs(x), Math.abs(y), Math.abs(z), width, height, depth);
  }, 40);

  return (
    <div className="h-[480px] overflow-hidden rounded-3xl border border-white/10 bg-[#050816] shadow-2xl shadow-black/30">
      <Canvas
        camera={{ position: [maxDimension * 3, maxDimension * 2, maxDimension * 3], fov: 45 }}
      >
        <color attach="background" args={["#050816"]} />
        <fog attach="fog" args={["#050816", maxDimension * 2, maxDimension * 10]} />
        <ambientLight intensity={1.2} />
        <directionalLight position={[30, 45, 25]} intensity={1.8} />
        <directionalLight position={[-20, -10, -25]} intensity={0.5} color="#7dd3fc" />
        <InstancedBricks bricks={bricks} />
      </Canvas>
    </div>
  );
}
