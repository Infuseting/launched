import React, { useEffect, useRef } from 'react';
import * as skinview3d from 'skinview3d';

interface Skin3DViewerProps {
  textureB64: string | null;
  variant?: 'classic' | 'slim';
  width?: number;
  height?: number;
  animate?: boolean;
}

const Skin3DViewer: React.FC<Skin3DViewerProps> = ({
  textureB64,
  variant = 'classic',
  width = 220,
  height = 340,
  animate = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<skinview3d.SkinViewer | null>(null);

  // ── Effect 1: create/destroy the viewer (runs only when dimensions change) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    viewerRef.current?.dispose();

    const viewer = new skinview3d.SkinViewer({
      canvas,
      width,
      height,
      background: 'transparent',
    });

    viewer.controls.enableZoom = true;
    viewer.controls.enableRotate = true;
    viewer.controls.enablePan = false;
    viewer.controls.minDistance = 20;
    viewer.controls.maxDistance = 80;
    viewer.camera.position.set(0, 10, 40);

    viewerRef.current = viewer;

    return () => {
      viewer.dispose();
      viewerRef.current = null;
    };
  }, [width, height]); // ← animate intentionally excluded

  // ── Effect 2: toggle animation without touching the viewer ──
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (animate) {
      const anim = new skinview3d.WalkingAnimation();
      anim.speed = 0.6;
      viewer.animation = anim;
    } else {
      viewer.animation = null; // stops animation, keeps character visible
    }
  }, [animate]);

  // ── Effect 3: update skin texture independently ──
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !textureB64) return;
    void viewer.loadSkin(`data:image/png;base64,${textureB64}`, {
      model: variant === 'slim' ? 'slim' : 'default',
    });
  }, [textureB64, variant]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ borderRadius: '1rem' }}
    />
  );
};

export default Skin3DViewer;
