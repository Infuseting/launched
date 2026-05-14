import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as skinview3d from 'skinview3d';
import * as skinService from '../services/skin';
import type { SkinEntry, MinecraftProfile } from '../services/skin';

// ─── 3D Skin Viewer ───────────────────────────────────────────────────────────

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

const SkinThumbnail: React.FC<{ textureB64: string; scale?: number }> = ({ textureB64, scale = 5 }) => {
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

// ─── SkinTab ──────────────────────────────────────────────────────────────────

const SkinTab: React.FC = () => {
  const [profile, setProfile] = useState<MinecraftProfile | null>(null);
  const [library, setLibrary] = useState<SkinEntry[]>([]);
  const [currentSkinB64, setCurrentSkinB64] = useState<string | null>(null);
  const [currentVariant, setCurrentVariant] = useState<'classic' | 'slim'>('classic');
  const [previewSkin, setPreviewSkin] = useState<{ b64: string; variant: 'classic' | 'slim' } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [uploadVariant, setUploadVariant] = useState<'classic' | 'slim'>('classic');
  const [uploadName, setUploadName] = useState('');
  const [uploadB64, setUploadB64] = useState<string | null>(null);

  const [animating, setAnimating] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const notify = (type: 'ok' | 'err', msg: string) => {
    if (type === 'ok') { setSuccess(msg); setTimeout(() => setSuccess(null), 3000); }
    else               { setError(msg);   setTimeout(() => setError(null),   6000); }
  };

  const syncProfileFromMojang = useCallback(async () => {
    try {
      const prof = await skinService.getMinecraftProfile();
      setProfile(prof);
      if (prof.skinUrl) {
        // Fetch the active skin texture from Mojang
        const resp = await fetch(prof.skinUrl);
        const blob = await resp.blob();
        const b64 = await new Promise<string>(res => {
          const r = new FileReader();
          r.onloadend = () => res((r.result as string).split(',')[1]);
          r.readAsDataURL(blob);
        });
        setCurrentSkinB64(b64);
      } else {
        // Reset case
        setCurrentSkinB64(null);
      }
      setCurrentVariant(prof.skinVariant?.toLowerCase() === 'slim' ? 'slim' : 'classic');
    } catch (e) {
      console.error("Failed to sync profile from Mojang:", e);
    }
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [lib] = await Promise.all([
        skinService.getSkinHistory(),
        syncProfileFromMojang() // also fetches profile and updates currentSkinB64
      ]);
      setLibrary(lib);
    } catch (e) {
      notify('err', String(e));
    } finally {
      setIsLoading(false);
    }
  }, [syncProfileFromMojang]);

  useEffect(() => { void loadData(); }, [loadData]);

  // The 3D viewer shows: preview (during upload) → current skin
  const viewer3dB64 = previewSkin?.b64 ?? uploadB64 ?? currentSkinB64;
  const viewer3dVariant = previewSkin?.variant ?? uploadVariant ?? currentVariant;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.png') && file.type !== 'image/png') {
      notify('err', 'Only PNG files are supported.');
      return;
    }
    if (!uploadName) setUploadName(file.name.replace('.png', ''));

    const r = new FileReader();
    r.onloadend = () => {
      const dataUrl = r.result as string;
      const b64 = dataUrl.split(',')[1];

      // Validate dimensions: Mojang only accepts 64×64 (or 128×128 HD)
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!((w === 64 && h === 64) || (w === 128 && h === 128))) {
          notify('err', `Invalid skin size: ${w}×${h}px. Mojang requires exactly 64×64 pixels.`);
          return;
        }
        setUploadB64(b64);
      };
      img.onerror = () => notify('err', 'Could not read the PNG file.');
      img.src = dataUrl;
    };
    r.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!uploadB64) { notify('err', 'Select a PNG skin file first.'); return; }
    setIsUploading(true);
    try {
      const entry = await skinService.uploadSkin(uploadName.trim() || 'My Skin', uploadB64, uploadVariant);
      setLibrary(prev => [entry, ...prev]);
      setCurrentSkinB64(uploadB64);
      setCurrentVariant(uploadVariant);
      setUploadB64(null);
      setUploadName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      notify('ok', `✓ "${entry.name}" applied & saved to library!`);
      // Re-sync with Mojang to be 100% sure the displayed skin is correct
      await syncProfileFromMojang();
    } catch (e) {
      notify('err', String(e));
    } finally {
      setIsUploading(false);
    }
  };

  const handleApply = async (skin: SkinEntry) => {
    setApplyingId(skin.id);
    try {
      await skinService.applySkinFromHistory(skin.id);
      setCurrentSkinB64(skin.textureB64);
      setCurrentVariant(skin.variant);
      notify('ok', `✓ "${skin.name}" applied!`);
      // Re-sync with Mojang
      await syncProfileFromMojang();
    } catch (e) {
      notify('err', String(e));
    } finally {
      setApplyingId(null);
    }
  };

  const handleDelete = async (skin: SkinEntry) => {
    try {
      await skinService.deleteSkinFromHistory(skin.id);
      setLibrary(prev => prev.filter(s => s.id !== skin.id));
    } catch (e) {
      notify('err', String(e));
    }
  };

  const handleReset = async () => {
    if (!confirm('Reset to default Mojang skin?')) return;
    try {
      await skinService.resetSkin();
      setCurrentSkinB64(null);
      notify('ok', '✓ Skin reset to default.');
      // Re-sync with Mojang
      await syncProfileFromMojang();
    } catch (e) {
      notify('err', String(e));
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-10 h-10 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
        <p className="text-white/40 text-sm">Loading skin data…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast notifications */}
      <AnimatePresence>
        {success && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-sm font-semibold px-4 py-3 rounded-2xl">
            {success}
          </motion.div>
        )}
        {error && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="bg-red-500/15 border border-red-400/30 text-red-300 text-sm font-semibold px-4 py-3 rounded-2xl">
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Top section: 3D viewer + upload form side by side ── */}
      <div className="flex gap-5 items-start">

        {/* 3D Viewer card */}
        <div className="flex-shrink-0 flex flex-col items-center gap-3">
          <div className="relative rounded-2xl overflow-hidden border border-white/10"
               style={{ background: 'linear-gradient(135deg, #0d1117 0%, #161b27 50%, #0d1117 100%)' }}>
            <Skin3DViewer
              textureB64={viewer3dB64}
              variant={viewer3dVariant}
              width={200}
              height={300}
              animate={animating}
            />
            {/* Subtle vignette overlay */}
            <div className="absolute inset-0 pointer-events-none"
                 style={{ background: 'radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.4) 100%)' }} />
          </div>

          {/* Viewer controls */}
          <div className="flex gap-2 w-full">
            <button
              onClick={() => setAnimating(a => !a)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all cursor-pointer ${
                animating
                  ? 'bg-indigo-500/20 border-indigo-400/30 text-indigo-300'
                  : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
              }`}
            >
              <sl-icon name={animating ? 'pause-fill' : 'play-fill'} />
              {animating ? 'Stop' : 'Walk'}
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/40 hover:text-white/70 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
            >
              <sl-icon name="arrow-counterclockwise" />
              Reset
            </button>
          </div>

          {/* Drag tip */}
          <p className="text-white/20 text-[9px] text-center font-medium tracking-wide">
            🖱 Drag to rotate · Scroll to zoom
          </p>

          {profile && (
            <p className="text-white/30 text-[10px] font-mono">{profile.name}</p>
          )}
        </div>

        {/* Upload form */}
        <div className="flex-1 bg-white/5 border border-white/10 rounded-3xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <sl-icon name="cloud-upload-fill" style={{ fontSize: '0.9rem' }} />
            <h3 className="text-white font-black tracking-tight text-sm">Add to Library</h3>
          </div>

          {/* File drop zone */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-24 rounded-2xl border-2 border-dashed border-white/15 hover:border-white/35 bg-black/20 hover:bg-black/30 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer group"
          >
            {uploadB64 ? (
              <div className="flex items-center gap-3">
                <SkinThumbnail textureB64={uploadB64} scale={4} />
                <span className="text-white/60 text-xs font-medium group-hover:text-white/80 transition-colors">
                  Click to change
                </span>
              </div>
            ) : (
              <>
                <sl-icon name="image" style={{ fontSize: '1.4rem', color: 'rgba(255,255,255,0.25)' }} />
                <span className="text-white/25 text-[11px] font-bold uppercase tracking-wider group-hover:text-white/45 transition-colors">
                  Select a PNG skin
                </span>
              </>
            )}
          </button>
          <input ref={fileInputRef} type="file" accept=".png,image/png" className="hidden" onChange={handleFileSelect} />

          {/* Name */}
          <div className="space-y-1">
            <label className="text-white/35 text-[9px] font-black uppercase tracking-widest">Name</label>
            <input
              type="text"
              value={uploadName}
              onChange={e => setUploadName(e.target.value)}
              placeholder="My awesome skin…"
              className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-white/30 transition-colors placeholder-white/20"
            />
          </div>

          {/* Variant */}
          <div className="space-y-1">
            <label className="text-white/35 text-[9px] font-black uppercase tracking-widest">Arm Model</label>
            <div className="flex gap-2">
              {(['classic', 'slim'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setUploadVariant(v)}
                  className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all cursor-pointer ${
                    uploadVariant === v
                      ? v === 'slim'
                        ? 'bg-violet-500/30 border-violet-400/50 text-violet-200'
                        : 'bg-amber-500/30 border-amber-400/50 text-amber-200'
                      : 'bg-white/5 border-white/10 text-white/35 hover:bg-white/10'
                  }`}
                >
                  {v === 'classic' ? '◼ Steve' : '✦ Alex'}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => void handleUpload()}
            disabled={!uploadB64 || isUploading}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-400 to-lime-300 text-zinc-950 font-black text-xs uppercase tracking-wider transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isUploading ? 'Uploading…' : 'Apply & Save to Library'}
          </button>
        </div>
      </div>

      {/* ── Skin Library ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <sl-icon name="collection-fill" style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)' }} />
          <h3 className="text-white font-black tracking-tight text-sm">My Library</h3>
          {library.length > 0 && (
            <span className="text-white/30 text-[10px] font-mono ml-1">({library.length} skin{library.length > 1 ? 's' : ''})</span>
          )}
        </div>

        {library.length === 0 ? (
          <div className="text-center py-10 text-white/20 text-xs space-y-2">
            <sl-icon name="box-seam" style={{ fontSize: '2rem', display: 'block', margin: '0 auto' }} />
            <p>Your library is empty.<br />Upload a skin above to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            <AnimatePresence mode="popLayout">
              {library.map(skin => (
                <motion.div
                  key={skin.id}
                  layout
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  onMouseEnter={() => setPreviewSkin({ b64: skin.textureB64, variant: skin.variant })}
                  onMouseLeave={() => setPreviewSkin(null)}
                  className="group relative bg-white/5 hover:bg-white/8 border border-white/10 hover:border-white/20 rounded-2xl p-3 flex flex-col items-center gap-2 transition-all"
                >
                  {/* Skin preview thumbnail */}
                  <div className="bg-black/30 rounded-xl p-2 flex items-end justify-center" style={{ minHeight: 64 }}>
                    <SkinThumbnail textureB64={skin.textureB64} scale={4} />
                  </div>

                  {/* Name */}
                  <p className="text-white/70 text-[9px] font-bold text-center truncate w-full px-1" title={skin.name}>
                    {skin.name}
                  </p>

                  {/* Variant badge */}
                  <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border ${
                    skin.variant === 'slim'
                      ? 'bg-violet-500/15 border-violet-400/20 text-violet-400'
                      : 'bg-amber-500/15 border-amber-400/20 text-amber-400'
                  }`}>
                    {skin.variant === 'slim' ? '✦ Alex' : '◼ Steve'}
                  </span>

                  {/* Actions */}
                  <div className="flex gap-1 w-full">
                    <button
                      onClick={() => void handleApply(skin)}
                      disabled={applyingId === skin.id}
                      className="flex-1 py-1.5 rounded-xl bg-white/10 hover:bg-emerald-500/25 hover:border-emerald-400/30 border border-white/10 text-white/70 hover:text-emerald-300 text-[9px] font-black uppercase tracking-wider transition-all disabled:opacity-40 cursor-pointer"
                    >
                      {applyingId === skin.id ? '…' : 'Apply'}
                    </button>
                    <button
                      onClick={() => void handleDelete(skin)}
                      className="w-7 h-7 flex items-center justify-center rounded-xl bg-white/5 hover:bg-red-500/20 hover:border-red-400/30 border border-white/10 text-white/30 hover:text-red-300 text-[10px] transition-all cursor-pointer"
                      title="Remove from library"
                    >
                      ✕
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
};

export default SkinTab;
