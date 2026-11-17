import React from 'react';
import { motion } from 'framer-motion';
import { Check, Trash2 } from 'lucide-react';
import type { SkinEntry } from '../../services/skin';
import SkinThumbnail from './SkinThumbnail';

interface SkinCardProps {
  skin: SkinEntry;
  isApplying: boolean;
  onPreview: (skin: SkinEntry | null) => void;
  onApply: (skin: SkinEntry) => Promise<void>;
  onDelete: (skin: SkinEntry) => Promise<void>;
}

export const SkinCard: React.FC<SkinCardProps> = ({
  skin,
  isApplying,
  onPreview,
  onApply,
  onDelete,
}) => {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      onMouseEnter={() => onPreview(skin)}
      onMouseLeave={() => onPreview(null)}
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
          type="button"
          onClick={() => void onApply(skin)}
          disabled={isApplying}
          className="flex-1 py-1.5 rounded-xl bg-white/10 hover:bg-emerald-500/25 border border-white/10 text-white/80 hover:text-emerald-300 text-[10px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1"
        >
          <Check className="w-3 h-3" />
          <span>{isApplying ? '...' : 'Activer'}</span>
        </button>
        <button
          type="button"
          onClick={() => void onDelete(skin)}
          className="w-7 h-7 flex items-center justify-center rounded-xl bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-300 border border-white/10 transition-all cursor-pointer"
          title="Supprimer"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </motion.div>
  );
};

export default SkinCard;
