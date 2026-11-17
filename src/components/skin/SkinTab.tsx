import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import * as skinService from '../../services/skin';
import type { SkinEntry, MinecraftProfile } from '../../services/skin';
import Skin3DViewer from './Skin3DViewer';
import SkinUploadForm from './SkinUploadForm';
import SkinLibraryGrid from './SkinLibraryGrid';
import {
  Play,
  Pause,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  MousePointerClick,
} from 'lucide-react';

export const SkinTab: React.FC = () => {
  const { authCache } = useAuth();
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

  const notify = (type: 'ok' | 'err', msg: string) => {
    if (type === 'ok') {
      setSuccess(msg);
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError(msg);
      setTimeout(() => setError(null), 5000);
    }
  };

  const syncProfileFromMojang = useCallback(async () => {
    try {
      const prof = await skinService.getMinecraftProfile();
      setProfile(prof);
      if (prof.skinUrl) {
        const secureUrl = prof.skinUrl.replace(/^http:\/\//i, 'https://');
        const resp = await fetch(secureUrl);
        const blob = await resp.blob();
        const b64 = await new Promise<string>((res) => {
          const r = new FileReader();
          r.onloadend = () => res((r.result as string).split(',')[1]);
          r.readAsDataURL(blob);
        });
        setCurrentSkinB64(b64);
      } else {
        setCurrentSkinB64(null);
      }
      setCurrentVariant(prof.skinVariant?.toLowerCase() === 'slim' ? 'slim' : 'classic');
    } catch (e) {
      console.error('Failed to sync profile from Mojang:', e);
    }
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [lib] = await Promise.all([skinService.getSkinHistory(), syncProfileFromMojang()]);
      setLibrary(lib);
    } catch (e) {
      notify('err', String(e));
    } finally {
      setIsLoading(false);
    }
  }, [syncProfileFromMojang]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const viewer3dB64 = previewSkin?.b64 ?? uploadB64 ?? currentSkinB64;
  const viewer3dVariant = previewSkin?.variant ?? uploadVariant ?? currentVariant;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.png') && file.type !== 'image/png') {
      notify('err', 'Seuls les fichiers PNG sont acceptés.');
      return;
    }
    if (!uploadName) setUploadName(file.name.replace('.png', ''));

    const r = new FileReader();
    r.onloadend = () => {
      const dataUrl = r.result as string;
      const b64 = dataUrl.split(',')[1];

      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!((w === 64 && h === 64) || (w === 128 && h === 128))) {
          notify('err', `Dimensions de skin invalides (${w}×${h}px). Mojang exige 64×64 ou 128×128.`);
          return;
        }
        setUploadB64(b64);
      };
      img.onerror = () => notify('err', 'Impossible de lire le fichier PNG.');
      img.src = dataUrl;
    };
    r.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!uploadB64) {
      notify('err', 'Veuillez sélectionner un fichier de skin PNG.');
      return;
    }
    setIsUploading(true);
    try {
      const entry = await skinService.uploadSkin(uploadName.trim() || 'Mon Skin', uploadB64, uploadVariant);
      setLibrary((prev) => [entry, ...prev]);
      setCurrentSkinB64(uploadB64);
      setCurrentVariant(uploadVariant);
      setUploadB64(null);
      setUploadName('');
      notify('ok', `"${entry.name}" appliqué et enregistré dans votre bibliothèque !`);
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
      await skinService.applySkinFromHistory(skin.id, skin);
      setCurrentSkinB64(skin.textureB64);
      setCurrentVariant(skin.variant);
      notify('ok', `"${skin.name}" est maintenant votre skin actif !`);
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
      setLibrary((prev) => prev.filter((s) => s.id !== skin.id));
    } catch (e) {
      notify('err', String(e));
    }
  };

  const handleReset = async () => {
    if (!confirm('Réinitialiser au skin Mojang par défaut ?')) return;
    try {
      await skinService.resetSkin();
      setCurrentSkinB64(null);
      notify('ok', 'Skin réinitialisé par défaut.');
      await syncProfileFromMojang();
    } catch (e) {
      notify('err', String(e));
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-8 h-8 border-2 border-emerald-400/20 border-t-emerald-400 rounded-full animate-spin" />
        <p className="text-white/40 text-xs font-medium">Chargement du studio de skins...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <AnimatePresence>
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-xs font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-lg"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{success}</span>
          </motion.div>
        )}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="bg-red-500/15 border border-red-400/30 text-red-300 text-xs font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-lg"
          >
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-12 gap-8 items-start">
        {/* 3D Viewer Card */}
        <div className="col-span-5 flex flex-col items-center gap-3">
          <div
            className="w-full relative rounded-3xl overflow-hidden border border-white/10 shadow-[0_25px_60px_rgba(0,0,0,0.7)] flex items-center justify-center p-2"
            style={{
              background: 'radial-gradient(ellipse at 50% 30%, #1a2232 0%, #090c14 100%)',
              minHeight: '460px',
            }}
          >
            <div
              className="absolute bottom-4 inset-x-8 h-16 rounded-full opacity-40 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at center, rgba(52,211,153,0.3) 0%, transparent 70%)' }}
            />

            <Skin3DViewer
              textureB64={viewer3dB64}
              skinUrl={profile?.skinUrl || (authCache?.uuid ? `https://mc-heads.net/skin/${authCache.uuid}` : undefined)}
              variant={viewer3dVariant}
              width={320}
              height={440}
              animate={animating}
            />
          </div>

          <div className="flex gap-2.5 w-full">
            <button
              type="button"
              onClick={() => setAnimating((a) => !a)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-xs font-bold uppercase tracking-wider border transition-all cursor-pointer shadow-md ${
                animating
                  ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
                  : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
              }`}
            >
              {animating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{animating ? 'Pause' : 'Marche'}</span>
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-md"
              title="Réinitialiser au skin par défaut"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Défaut</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-white/30 font-medium">
            <MousePointerClick className="w-3.5 h-3.5 opacity-60" />
            <span>Glisser pour pivoter · Molette pour zoomer</span>
          </div>

          {(profile?.name || authCache?.name) && (
            <div className="text-xs font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-500/25 px-3 py-1 rounded-xl">
              Joueur : {profile?.name || authCache?.name}
            </div>
          )}
        </div>

        {/* Upload Form */}
        <SkinUploadForm
          uploadB64={uploadB64}
          uploadName={uploadName}
          uploadVariant={uploadVariant}
          isUploading={isUploading}
          onFileSelect={handleFileSelect}
          onNameChange={setUploadName}
          onVariantChange={setUploadVariant}
          onSubmit={handleUpload}
        />
      </div>

      {/* Library Grid */}
      <SkinLibraryGrid
        library={library}
        applyingId={applyingId}
        onPreview={(skin) =>
          setPreviewSkin(skin ? { b64: skin.textureB64, variant: skin.variant } : null)
        }
        onApply={handleApply}
        onDelete={handleDelete}
      />
    </div>
  );
};

export default SkinTab;
