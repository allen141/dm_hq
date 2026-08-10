"use client";

import { useRef } from "react";
import { Plane, Vector3 } from "three";
import { mapWorldToPoint } from "@/lib/map-coordinates";
import type { ThreeEvent } from "@react-three/fiber";
import type { MapCanvasPlacement, MapItem, MapMode, MapPoint } from "@/lib/map-types";

type MapMarkerProps = {
  placement: MapCanvasPlacement;
  item?: MapItem;
  mode: MapMode;
  selected: boolean;
  position: [number, number, number];
  scale: number;
  planeWidth: number;
  planeHeight: number;
  onSelect: (placementId: string) => void;
  onDragStateChange: (dragging: boolean) => void;
  onMove: (placementId: string, point: MapPoint, phase: "preview" | "commit") => void;
};

const COLORS = {
  note: "#e2b96b",
  entity: "#61d7c5",
  session: "#aa82e8",
};

export function MapMarker({ placement, item, mode, selected, position, scale, planeWidth, planeHeight, onSelect, onDragStateChange, onMove }: MapMarkerProps) {
  const kind = item?.kind === "entity" || item?.kind === "session" ? item.kind : "note";
  const archived = item?.status === "archived";
  const color = archived ? "#87918f" : COLORS[kind];
  const markerScale = scale * (selected ? 1.2 : 1);
  const drag = useRef<{ pointerId: number; startX: number; startY: number; moved: boolean; lastPoint: MapPoint | null } | null>(null);

  function stopMapControls(event: ThreeEvent<PointerEvent | MouseEvent>) {
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
  }

  function pointOnMap(event: ThreeEvent<PointerEvent>): MapPoint | null {
    const intersection = event.ray.intersectPlane(
      new Plane(new Vector3(0, 1, 0), 0),
      new Vector3(),
    );
    return intersection ? mapWorldToPoint(intersection.x, intersection.z, planeWidth, planeHeight) : null;
  }

  function select(event: ThreeEvent<MouseEvent>) {
    stopMapControls(event);
    onSelect(placement.id);
  }

  function startDrag(event: ThreeEvent<PointerEvent>) {
    stopMapControls(event);
    const captureTarget = event.target as unknown as { setPointerCapture?: (pointerId: number) => void };
    captureTarget.setPointerCapture?.(event.pointerId);
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false, lastPoint: null };
    onSelect(placement.id);
    onDragStateChange(true);
  }

  function moveDrag(event: ThreeEvent<PointerEvent>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    stopMapControls(event);
    if (!current.moved && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 3) return;
    const point = pointOnMap(event);
    if (!point) return;
    current.moved = true;
    current.lastPoint = point;
    onMove(placement.id, point, "preview");
  }

  function finishDrag(event: ThreeEvent<PointerEvent>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    stopMapControls(event);
    const captureTarget = event.target as unknown as { releasePointerCapture?: (pointerId: number) => void };
    captureTarget.releasePointerCapture?.(event.pointerId);
    if (current.moved && current.lastPoint) onMove(placement.id, current.lastPoint, "commit");
    drag.current = null;
    onDragStateChange(false);
  }

  return (
    <group
      position={position}
      scale={markerScale}
      onClick={select}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      userData={{ placementId: placement.id, title: placement.caption || item?.title }}
    >
      {selected && (
        <mesh position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.27, 0.35, 32]} />
          <meshBasicMaterial color="#fff1b8" transparent opacity={0.95} depthWrite={false} />
        </mesh>
      )}
      {kind === "entity" && (
        <group position={[0, mode === "3d" ? 0.3 : 0.18, 0]}>
          <mesh rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.2, 0.52, 8]} />
            <meshStandardMaterial color={color} roughness={0.45} transparent={archived} opacity={archived ? 0.55 : 1} />
          </mesh>
          <mesh position={[0, 0.28, 0]}>
            <sphereGeometry args={[0.16, 18, 12]} />
            <meshStandardMaterial color={color} emissive={selected ? color : "#000000"} emissiveIntensity={selected ? 0.3 : 0} transparent={archived} opacity={archived ? 0.55 : 1} />
          </mesh>
        </group>
      )}
      {kind === "note" && (
        <mesh position={[0, mode === "3d" ? 0.2 : 0.12, 0]} rotation={[0, Math.PI / 4, 0]}>
          <boxGeometry args={[0.34, mode === "3d" ? 0.36 : 0.18, 0.34]} />
          <meshStandardMaterial color={color} emissive={selected ? color : "#000000"} emissiveIntensity={selected ? 0.25 : 0} roughness={0.55} transparent={archived} opacity={archived ? 0.55 : 1} />
        </mesh>
      )}
      {kind === "session" && (
        <group position={[0, mode === "3d" ? 0.22 : 0.13, 0]}>
          <mesh>
            <sphereGeometry args={[0.23, 18, 12]} />
            <meshStandardMaterial color={color} emissive={selected ? color : "#000000"} emissiveIntensity={selected ? 0.3 : 0} roughness={0.35} transparent={archived} opacity={archived ? 0.55 : 1} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.32, 0.045, 8, 28]} />
            <meshBasicMaterial color={archived ? "#9aa19f" : "#d7c1ff"} transparent={archived} opacity={archived ? 0.55 : 1} />
          </mesh>
        </group>
      )}
    </group>
  );
}

export default MapMarker;
