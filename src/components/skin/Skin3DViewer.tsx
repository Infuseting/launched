import React, { useEffect, useRef } from 'react';
import * as skinview3d from 'skinview3d';

interface Skin3DViewerProps {
  textureB64?: string | null;
  skinUrl?: string | null;
  variant?: 'classic' | 'slim';
  width?: number;
  height?: number;
  animate?: boolean;
}

const DEFAULT_STEVE_SKIN = 'https://textures.minecraft.net/texture/1a429d89cc0c3260840b2a7585a9ef2249e0c5d35a51cf163351d7ea94e7';
const DEFAULT_ALEX_SKIN = 'https://textures.minecraft.net/texture/3e67ae8a89151522f281e05be3ff5e79603cf3d7a858ff8f5c3577dcf95f5043';

export const Skin3DViewer: React.FC<Skin3DViewerProps> = ({
  textureB64,
  skinUrl,
  variant = 'classic',
  width = 320,
  height = 440,
  animate = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<skinview3d.SkinViewer | null>(null);

  // Initialize and dispose the Three.js viewer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    viewerRef.current?.dispose();

    // Do NOT pass background string (causes Three.js to fallback to solid white)
    const viewer = new skinview3d.SkinViewer({
      canvas,
      width,
      height,
      zoom: 0.95, // Player fills the full height
      fov: 48,
    });

    viewer.controls.enableZoom = true;
    viewer.controls.enableRotate = true;
    viewer.controls.enablePan = false;
    viewer.controls.minDistance = 10;
    viewer.controls.maxDistance = 60;
    viewer.camera.position.set(0, 2, 36);

    viewerRef.current = viewer;

    // Apply animation immediately
    if (animate) {
      const anim = new skinview3d.WalkingAnimation();
      anim.speed = 0.6;
      viewer.animation = anim;
    }

    // Apply skin texture immediately
    const modelType = variant === 'slim' ? 'slim' : 'default';
    if (textureB64) {
      void viewer.loadSkin(`data:image/png;base64,${textureB64}`, { model: modelType });
    } else if (skinUrl) {
      void viewer.loadSkin(skinUrl, { model: modelType });
    } else {
      void viewer.loadSkin(variant === 'slim' ? DEFAULT_ALEX_SKIN : DEFAULT_STEVE_SKIN, { model: modelType });
    }

    return () => {
      viewer.dispose();
      viewerRef.current = null;
    };
  }, [width, height]);

  // Update animation when animate prop changes
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    if (animate) {
      const anim = new skinview3d.WalkingAnimation();
      anim.speed = 0.6;
      viewer.animation = anim;
    } else {
      viewer.animation = null;
    }
  }, [animate]);

  // Update skin texture when textureB64, skinUrl, or variant changes
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const modelType = variant === 'slim' ? 'slim' : 'default';
    if (textureB64) {
      void viewer.loadSkin(`data:image/png;base64,${textureB64}`, { model: modelType });
    } else if (skinUrl) {
      void viewer.loadSkin(skinUrl, { model: modelType });
    } else {
      void viewer.loadSkin(variant === 'slim' ? DEFAULT_ALEX_SKIN : DEFAULT_STEVE_SKIN, { model: modelType });
    }
  }, [textureB64, skinUrl, variant]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="cursor-grab active:cursor-grabbing outline-none block"
    />
  );
};

export default Skin3DViewer;
