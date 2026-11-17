import React, { useRef } from 'react';
import { Upload, Image as ImageIcon, Check } from 'lucide-react';
import SkinThumbnail from './SkinThumbnail';

interface SkinUploadFormProps {
  uploadB64: string | null;
  uploadName: string;
  uploadVariant: 'classic' | 'slim';
  isUploading: boolean;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onNameChange: (name: string) => void;
  onVariantChange: (variant: 'classic' | 'slim') => void;
  onSubmit: () => Promise<void>;
}

export const SkinUploadForm: React.FC<SkinUploadFormProps> = ({
  uploadB64,
  uploadName,
  uploadVariant,
  isUploading,
  onFileSelect,
  onNameChange,
  onVariantChange,
  onSubmit,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="col-span-7 bg-white/[0.03] border border-white/10 rounded-3xl p-6 space-y-4">
      <div className="flex items-center gap-2.5 pb-2 border-b border-white/5">
        <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-400/25 flex items-center justify-center text-emerald-400">
          <Upload className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-white font-black text-sm tracking-tight">Importer un Nouveau Skin</h3>
          <p className="text-[11px] text-white/40">Fichier image PNG Minecraft officiel (64x64 ou 128x128)</p>
        </div>
      </div>

      {/* File Drop / Select Area */}
      <button
        type="button"
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
        onChange={onFileSelect}
      />

      {/* Name input */}
      <div className="space-y-1.5">
        <label className="text-white/50 text-[10px] font-bold uppercase tracking-wider block">
          Nom du modèle dans votre bibliothèque
        </label>
        <input
          type="text"
          value={uploadName}
          onChange={(e) => onNameChange(e.target.value)}
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
              onClick={() => onVariantChange(v)}
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
        type="button"
        onClick={() => void onSubmit()}
        disabled={!uploadB64 || isUploading}
        className="w-full py-2.5 px-4 rounded-xl bg-white text-neutral-950 font-bold text-xs hover:bg-neutral-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all flex items-center justify-center gap-2 shadow-sm text-center"
      >
        {isUploading ? (
          <span>Application et enregistrement en cours...</span>
        ) : (
          <>
            <Check className="w-3.5 h-3.5" />
            <span>Appliquer et Sauvegarder dans ma bibliothèque</span>
          </>
        )}
      </button>
    </div>
  );
};

export default SkinUploadForm;
