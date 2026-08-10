"use client";

import { Component, useCallback, useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import type { MapCanvasProps } from "@/lib/map-types";
import MapDomFallback from "@/components/map/map-dom-fallback";
import MapScene from "@/components/map/map-scene";

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
  const activeFailure = failure?.url === background.url ? failure.error : null;

  const fail = useCallback((error: Error) => {
    setFailure((current) => current?.url === background.url ? current : { url: background.url, error });
    onRendererError?.(error);
  }, [background.url, onRendererError]);

  if (activeFailure || !background.url) {
    return <MapDomFallback {...props} reason={activeFailure?.message} />;
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
