import React, { useEffect, useRef } from 'react';

// ─── Thumbnail using a static canvas ─────────────────────────────────────────
// Uses the 2D atlas approach only for small library thumbnails (no WebGL waste)

const PARTS = {
  head:  { sx: 8,  sy: 8,  sw: 8, sh: 8,  dx: 4, dy: 0,  dw: 8, dh: 8  },
  torso: { sx: 20, sy: 20, sw: 8, sh: 12, dx: 4, dy: 8,  dw: 8, dh: 12 },
  armR:  { sx: 44, sy: 20, sw: 4, sh: 12, dx: 0, dy: 8,  dw: 4, dh: 12 },
  armL:  { sx: 36, sy: 52, sw: 4, sh: 12, dx: 12, dy: 8, dw: 4, dh: 12 },
  legR:  { sx: 4,  sy: 20, sw: 4, sh: 12, dx: 4, dy: 20, dw: 4, dh: 12 },
  legL:  { sx: 20, sy: 52, sw: 4, sh: 12, dx: 8, dy: 20, dw: 4, dh: 12 },
  hat:   { sx: 40, sy: 8,  sw: 8, sh: 8,  dx: 4, dy: 0,  dw: 8, dh: 8  },
};

interface SkinThumbnailProps {
  textureB64: string;
  scale?: number;
}

const SkinThumbnail: React.FC<SkinThumbnailProps> = ({ textureB64, scale = 5 }) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !textureB64) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const S = scale;
    canvas.width = 16 * S;
    canvas.height = 32 * S;
    ctx.imageSmoothingEnabled = false;

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      Object.values(PARTS).forEach(p => {
        ctx.drawImage(img, p.sx, p.sy, p.sw, p.sh, p.dx * S, p.dy * S, p.dw * S, p.dh * S);
      });
    };
    img.src = `data:image/png;base64,${textureB64}`;
  }, [textureB64, scale]);

  return (
    <canvas
      ref={ref}
      width={16 * scale}
      height={32 * scale}
      style={{ imageRendering: 'pixelated' }}
    />
  );
};

export default SkinThumbnail;
