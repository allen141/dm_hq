"use client";

import { Component, useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import type { MapCanvasProps } from "@/lib/map-types";
import MapDomFallback from "@/components/map/map-dom-fallback";
import MapScene from "@/components/map/map-scene";

function supportsWebgl() {
  if (typeof document === "undefined") return true;
  const canvas = document.createElement("canvas");
  try {
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}

function subscribeForcedColors(onChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  const media = window.matchMedia("(forced-colors: active)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function forcedColorsSnapshot() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(forced-colors: active)").matches;
}

function forcedColorsServerSnapshot() { return false; }

class RendererErrorBoundary extends Component<
  { children: ReactNode; onError: (error: Error) => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function MapCanvas(props: MapCanvasProps) {
  const { background, onRendererError } = props;
  const [failure, setFailure] = useState<{ url: string; error: Error } | null>(null);
  const [webglAvailable] = useState(() => supportsWebgl());
  const forcedColors = useSyncExternalStore(subscribeForcedColors, forcedColorsSnapshot, forcedColorsServerSnapshot);
  const activeFailure = failure?.url === background.url ? failure.error : null;

  useEffect(() => {
    if (!forcedColors && !webglAvailable) onRendererError?.(new Error("WebGL is not available."));
  }, [forcedColors, onRendererError, webglAvailable]);

  const fail = useCallback((error: Error) => {
    setFailure((current) => current?.url === background.url ? current : { url: background.url, error });
    onRendererError?.(error);
  }, [background.url, onRendererError]);

  if (forcedColors || activeFailure || webglAvailable === false || !background.url) {
    return <MapDomFallback {...props} reason={forcedColors ? "Forced-colors mode is active." : activeFailure?.message ?? (webglAvailable === false ? "WebGL is not available." : undefined)} />;
  }

  return (
    <div
      className={props.className ? `map-canvas-shell ${props.className}` : "map-canvas-shell"}
      role="application"
      aria-label={`Interactive ${props.mode === "2d" ? "two-dimensional" : "three-dimensional"} map: ${props.background.alt}`}
    >
      <RendererErrorBoundary key={background.url} onError={fail}>
        <Canvas
          frameloop="demand"
          dpr={[1, 1.75]}
          gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
          fallback={<MapDomFallback {...props} reason="WebGL is not available." />}
          onPointerMissed={() => {
            if (!props.placementArmed) props.onSelectPlacement?.(null);
          }}
        >
          <MapScene {...props} onFailure={fail} />
        </Canvas>
      </RendererErrorBoundary>
    </div>
  );
}

export default MapCanvas;
