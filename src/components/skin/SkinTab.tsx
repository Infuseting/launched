import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLauncherState } from '../../state';
import * as skinService from '../../services/skin';
import type { SkinEntry, MinecraftProfile } from '../../services/skin';
import Skin3DViewer from './Skin3DViewer';
import SkinThumbnail from './SkinThumbnail';
import {
  Play,
  Pause,
  RotateCcw,
  Upload,
  Image as ImageIcon,
  Check,
  Trash2,
  AlertCircle,
  CheckCircle2,
  FolderOpen,
  MousePointerClick,
  Sparkles,
} from 'lucide-react';

export const SkinTab: React.FC = () => {
  const launcherState = useLauncherState();
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
        const resp = await fetch(prof.skinUrl);
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
      if (fileInputRef.current) fileInputRef.current.value = '';
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
      await skinService.applySkinFromHistory(skin.id);
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
      {/* Toast Notifications */}
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

      {/* Top section: 3D viewer + Upload form */}
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
            {/* Subtle floor pedestal glow */}
            <div
              className="absolute bottom-4 inset-x-8 h-16 rounded-full opacity-40 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at center, rgba(52,211,153,0.3) 0%, transparent 70%)' }}
            />

            <Skin3DViewer
              textureB64={viewer3dB64}
              skinUrl={profile?.skinUrl || (launcherState.authCache?.uuid ? `https://mc-heads.net/skin/${launcherState.authCache.uuid}` : undefined)}
              variant={viewer3dVariant}
              width={320}
              height={440}
              animate={animating}
            />
          </div>

          {/* Viewer Controls */}
          <div className="flex gap-2.5 w-full">
            <button
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

          {(profile?.name || launcherState.authCache?.name) && (
            <div className="text-xs font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-500/25 px-3 py-1 rounded-xl">
              Joueur : {profile?.name || launcherState.authCache?.name}
            </div>
          )}
        </div>

        {/* Upload Form Card */}
        <div className="col-span-7 bg-white/[0.03] border border-white/10 rounded-3xl p-6 space-y-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-white/5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-400/25 flex items-center justify-center text-emerald-400">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-white font-black text-sm tracking-tight">Importer un Nouveau Skin</h3>
              <p className="text-[11px] text-white/40">Fichier image PNG Minecraft officiel (64x64)</p>
            </div>
          </div>

          {/* File Drop / Select Area */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-28 rounded-2xl border-2 border-dashed border-white/15 hover:border-emerald-500/40 bg-black/40 hover:bg-black/50 flex flex-col items-center justify-center gap-2.5 transition-all cursor-pointer group"
          >
            {uploadB64 ? (
              <div className="flex items-center gap-4">
                <SkinThumbnail textureB64={uploadB64} scale={3.5} />
                <div className="text-left">
                  <span className="text-xs font-bold text-emerald-300 block">Skin prêt pour import</span>
                  <span className="text-[10px] text-white/40">Cliquez pour choisir une autre image</span>
                </div>
              </div>
            ) : (
              <>
                <ImageIcon className="w-7 h-7 text-white/30 group-hover:text-emerald-400/70 transition-colors" />
                <span className="text-xs font-bold text-white/40 group-hover:text-white/70 transition-colors uppercase tracking-wider">
                  Glissez ou sélectionnez un fichier PNG
                </span>
              </>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,image/png"
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* Name input */}
          <div className="space-y-1.5">
            <label className="text-white/50 text-[10px] font-bold uppercase tracking-wider block">
              Nom du modèle dans votre bibliothèque
            </label>
            <input
              type="text"
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              placeholder="ex: Guerrier Sombre, Mineur, Skin d'été..."
              className="w-full bg-black/40 border border-white/10 focus:border-emerald-500/50 rounded-xl px-4 py-2.5 text-white text-xs outline-none transition-colors placeholder-white/20"
            />
          </div>

          {/* Arm Model Variant Selector */}
          <div className="space-y-1.5">
            <label className="text-white/50 text-[10px] font-bold uppercase tracking-wider block">
              Modèle de bras (Épaisseur)
            </label>
            <div className="flex gap-3">
              {(['classic', 'slim'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setUploadVariant(v)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    uploadVariant === v
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                      : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                  }`}
                >
                  {v === 'classic' ? 'Steve (4px classique)' : 'Alex (3px fin)'}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => void handleUpload()}
            disabled={!uploadB64 || isUploading}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-400 text-neutral-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_6px_25px_rgba(52,211,153,0.35)] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
          >
            {isUploading ? (
              <span>Application et enregistrement en cours...</span>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Appliquer et Sauvegarder dans ma bibliothèque</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Skin Library Section */}
      <div className="space-y-4 pt-4 border-t border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FolderOpen className="w-5 h-5 text-emerald-400" />
            <h3 className="text-white font-black text-base tracking-tight">Bibliothèque de Skins</h3>
            {library.length > 0 && (
              <span className="text-white/40 text-xs font-mono bg-white/5 px-2 py-0.5 rounded-md">
                {library.length} skin{library.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <span className="text-xs text-white/30">Survolez un skin pour l'essayer en direct dans le viewer 3D</span>
        </div>

        {library.length === 0 ? (
          <div className="text-center py-12 text-white/30 text-xs rounded-3xl border border-dashed border-white/10 p-8 space-y-2">
            <ImageIcon className="w-8 h-8 mx-auto opacity-30 mb-1" />
            <p className="font-semibold">Votre bibliothèque est vide.</p>
            <p className="text-[11px] text-white/20">Importez un skin PNG ci-dessus pour le sauvegarder et le réutiliser à tout moment.</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3.5">
            <AnimatePresence mode="popLayout">
              {library.map((skin) => (
                <motion.div
                  key={skin.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onMouseEnter={() => setPreviewSkin({ b64: skin.textureB64, variant: skin.variant })}
                  onMouseLeave={() => setPreviewSkin(null)}
                  className="group relative bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 hover:border-emerald-500/40 rounded-2xl p-3 flex flex-col items-center gap-2.5 transition-all duration-200 shadow-md"
                >
                  <div className="bg-black/40 rounded-xl p-2.5 flex items-center justify-center w-full min-h-[85px] group-hover:scale-105 transition-transform duration-200">
                    <SkinThumbnail textureB64={skin.textureB64} scale={3.2} />
                  </div>

                  <p className="text-white/90 text-xs font-bold text-center truncate w-full px-1" title={skin.name}>
                    {skin.name}
                  </p>

                  <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-md bg-white/5 text-white/50 border border-white/5">
                    {skin.variant === 'slim' ? 'Alex' : 'Steve'}
                  </span>

                  <div className="flex gap-1.5 w-full pt-1">
                    <button
                      onClick={() => void handleApply(skin)}
                      disabled={applyingId === skin.id}
                      className="flex-1 py-1.5 rounded-xl bg-white/10 hover:bg-emerald-500/25 border border-white/10 text-white/80 hover:text-emerald-300 text-[10px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1"
                    >
                      <Check className="w-3 h-3" />
                      <span>{applyingId === skin.id ? '...' : 'Activer'}</span>
                    </button>
                    <button
                      onClick={() => void handleDelete(skin)}
                      className="w-7 h-7 flex items-center justify-center rounded-xl bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-300 border border-white/10 transition-all cursor-pointer"
                      title="Supprimer"
                    >
                      <Trash2 className="w-3 h-3" />
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
