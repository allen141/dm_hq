"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { MapControls as ThreeMapControls } from "three/addons/controls/MapControls.js";
import { OrthographicCamera, PerspectiveCamera, type Texture } from "three";
import { clampMapCameraTarget, mapCameraBounds } from "@/lib/map-camera";
import { mapPointFromUv, mapPointToWorld, planeDimensions } from "@/lib/map-coordinates";
import { loadMapTexture } from "@/lib/map-texture";
import type { MapCanvasProps, MapMode } from "@/lib/map-types";
import MapMarker from "@/components/map/map-marker";

type SceneProps = Omit<MapCanvasProps, "className"> & {
  onFailure: (error: Error) => void;
};

function CameraRig({ mode, width, height, resetToken = 0 }: { mode: MapMode; width: number; height: number; resetToken?: number }) {
  const { size, set, invalidate } = useThree();
  const orthographic = useMemo(() => new OrthographicCamera(), []);
  const perspective = useMemo(() => new PerspectiveCamera(42, 1, 0.01, 200), []);
  const camera = mode === "2d" ? orthographic : perspective;

  useLayoutEffect(() => {
    const viewportAspect = Math.max(size.width, 1) / Math.max(size.height, 1);
    const imageAspect = width / height;
    if (mode === "2d") {
      const padding = 1.12;
      const viewWidth = viewportAspect > imageAspect ? height * viewportAspect * padding : width * padding;
      const viewHeight = viewportAspect > imageAspect ? height * padding : (width / viewportAspect) * padding;
      // Three cameras are intentionally configured through their imperative API.
      // eslint-disable-next-line react-hooks/immutability
      orthographic.left = -viewWidth / 2;
      orthographic.right = viewWidth / 2;
      orthographic.top = viewHeight / 2;
      orthographic.bottom = -viewHeight / 2;
      orthographic.near = 0.01;
      orthographic.far = 100;
      orthographic.updateProjectionMatrix();
    } else {
      // eslint-disable-next-line react-hooks/immutability
      perspective.aspect = viewportAspect;
      perspective.updateProjectionMatrix();
    }
    set({ camera });
    invalidate();
  }, [camera, height, invalidate, mode, orthographic, perspective, set, size.height, size.width, width]);

  useLayoutEffect(() => {
    const longestSide = Math.max(width, height);
    if (mode === "2d") {
      // eslint-disable-next-line react-hooks/immutability -- Three cameras are configured through their imperative API.
      camera.zoom = 1;
      camera.position.set(0, longestSide * 1.35, 0.001);
      camera.up.set(0, 0, -1);
    } else {
      camera.zoom = 1;
      camera.position.set(0, longestSide * 0.82, longestSide * 0.92);
      camera.up.set(0, 1, 0);
    }
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    invalidate();
  }, [camera, height, invalidate, mode, resetToken, size.height, size.width, width]);

  return null;
}

function MapControls({ mode, resetToken = 0, planeWidth, planeHeight, enabled }: { mode: MapMode; resetToken?: number; planeWidth: number; planeHeight: number; enabled: boolean }) {
  const { camera, gl, invalidate } = useThree();

  useEffect(() => {
    const longestSide = Math.max(planeWidth, planeHeight);
    const controls = new ThreeMapControls(camera, gl.domElement);
    controls.enableDamping = false;
    controls.enabled = enabled;
    controls.enableRotate = mode === "3d";
    controls.screenSpacePanning = false;
    controls.minDistance = longestSide * 0.25;
    controls.maxDistance = longestSide * 4;
    controls.minZoom = 1;
    controls.maxZoom = 12;
    controls.maxPolarAngle = mode === "3d" ? Math.PI * 0.46 : 0;
    controls.minPolarAngle = mode === "3d" ? Math.PI * 0.08 : 0;
    controls.target.set(0, 0, 0);
    controls.update();
    controls.saveState();
    const handleChange = () => {
      const orthographic = camera instanceof OrthographicCamera ? camera : null;
      const visibleWidth = orthographic ? (orthographic.right - orthographic.left) / orthographic.zoom : undefined;
      const visibleHeight = orthographic ? (orthographic.top - orthographic.bottom) / orthographic.zoom : undefined;
      const bounds = mapCameraBounds(mode, planeWidth, planeHeight, visibleWidth, visibleHeight);
      const constrained = clampMapCameraTarget({ x: controls.target.x, y: controls.target.z }, bounds);
      const shiftX = constrained.x - controls.target.x;
      const shiftZ = constrained.y - controls.target.z;
      if (shiftX || shiftZ) {
        controls.target.x = constrained.x;
        controls.target.z = constrained.y;
        camera.position.x += shiftX;
        camera.position.z += shiftZ;
        camera.updateMatrixWorld();
      }
      invalidate();
    };
    controls.addEventListener("change", handleChange);
    return () => {
      controls.removeEventListener("change", handleChange);
      controls.dispose();
    };
  }, [camera, enabled, gl.domElement, invalidate, mode, planeHeight, planeWidth, resetToken]);

  return null;
}

function ContextGuard({ onFailure }: { onFailure: (error: Error) => void }) {
  const { gl } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (event: Event) => {
      event.preventDefault();
      onFailure(new Error("The WebGL context was lost."));
    };
    canvas.addEventListener("webglcontextlost", lost);
    return () => canvas.removeEventListener("webglcontextlost", lost);
  }, [gl.domElement, onFailure]);
  return null;
}

export function MapScene({
  background,
  items,
  placements,
  mode,
  selectedPlacementId,
  editable = false,
  placementArmed = false,
  resetToken,
  onSelectPlacement,
  onPlace,
  onMovePlacement,
  onFailure,
}: SceneProps) {
  const [loaded, setLoaded] = useState<{ url: string; texture: Texture; width: number; height: number } | null>(null);
  const invalidate = useThree((state) => state.invalidate);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let active = true;
    let effectTexture: Texture | null = null;
    void loadMapTexture(background.url)
      .then((result) => {
        if (!active) {
          result.texture.dispose();
          return;
        }
        effectTexture = result.texture;
        setLoaded({ url: background.url, ...result });
        invalidate();
      })
      .catch((cause: unknown) => {
        if (active) onFailure(cause instanceof Error ? cause : new Error("The map background could not be loaded."));
      });
    return () => {
      active = false;
      effectTexture?.dispose();
    };
  }, [background.url, invalidate, onFailure]);

  const activeTexture = loaded?.url === background.url ? loaded : null;
  const imageSize = activeTexture ? planeDimensions(activeTexture.width, activeTexture.height) : { width: 12, height: 8 };
  const itemById = new Map(items.map((item) => [item.id, item]));
  const markerScale = Math.max(imageSize.width, imageSize.height) / 12;

  function handlePlaneClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    if (placementArmed && event.uv && onPlace) {
      onPlace(mapPointFromUv(event.uv));
    } else {
      onSelectPlacement?.(null);
    }
  }

  return (
    <>
      <color attach="background" args={["#101815"]} />
      <ambientLight intensity={mode === "3d" ? 1.1 : 1.5} />
      <directionalLight position={[4, 10, 5]} intensity={mode === "3d" ? 2.4 : 1.25} />
      <CameraRig mode={mode} width={imageSize.width} height={imageSize.height} resetToken={resetToken} />
      <MapControls mode={mode} resetToken={resetToken} planeWidth={imageSize.width} planeHeight={imageSize.height} enabled={!dragging} />
      <ContextGuard onFailure={onFailure} />
      {activeTexture && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} onClick={handlePlaneClick} receiveShadow>
            <planeGeometry args={[imageSize.width, imageSize.height]} />
            <meshBasicMaterial map={activeTexture.texture} toneMapped={false} />
          </mesh>
          {placements.map((placement) => {
            const world = mapPointToWorld(placement, imageSize.width, imageSize.height);
            return (
              <MapMarker
                key={placement.id}
                placement={placement}
                item={itemById.get(placement.item_id)}
                mode={mode}
                selected={placement.id === selectedPlacementId}
                editable={editable}
                position={[world[0], 0.02, world[2]]}
                scale={markerScale}
                planeWidth={imageSize.width}
                planeHeight={imageSize.height}
                onSelect={(placementId) => onSelectPlacement?.(placementId)}
                onDragStateChange={setDragging}
                onMove={(placementId, point, phase) => onMovePlacement?.(placementId, point, phase)}
              />
            );
          })}
        </>
      )}
    </>
  );
}

export default MapScene;
