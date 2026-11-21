import React from 'react';
import { AnimatePresence } from 'framer-motion';
import { FolderOpen, Image as ImageIcon } from 'lucide-react';
import type { SkinEntry } from '../../services/skin';
import SkinCard from './SkinCard';

interface SkinLibraryGridProps {
  library: SkinEntry[];
  applyingId: string | null;
  onPreview: (skin: SkinEntry | null) => void;
  onApply: (skin: SkinEntry) => Promise<void>;
  onDelete: (skin: SkinEntry) => Promise<void>;
}

export const SkinLibraryGrid: React.FC<SkinLibraryGridProps> = ({
  library,
  applyingId,
  onPreview,
  onApply,
  onDelete,
}) => {
  return (
    <div className="space-y-4 pt-4 border-t border-white/10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <FolderOpen className="w-5 h-5 text-emerald-400" />
          <h3 className="text-white font-black text-base tracking-tight">
            Bibliothèque de Skins
          </h3>
          {library.length > 0 && (
            <span className="text-white/40 text-xs font-mono bg-white/5 px-2 py-0.5 rounded-md">
              {library.length} skin{library.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <span className="text-xs text-white/30">
          Survolez un skin pour l'essayer en direct dans le viewer 3D
        </span>
      </div>

      {library.length === 0 ? (
        <div className="text-center py-12 text-white/30 text-xs rounded-3xl border border-dashed border-white/10 p-8 space-y-2">
          <ImageIcon className="w-8 h-8 mx-auto opacity-30 mb-1" />
          <p className="font-semibold">Votre bibliothèque est vide.</p>
          <p className="text-[11px] text-white/20">
            Importez un skin PNG ci-dessus pour le sauvegarder et le réutiliser
            à tout moment.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3.5">
          <AnimatePresence mode="popLayout">
            {library.map((skin) => (
              <SkinCard
                key={skin.id}
                skin={skin}
                isApplying={applyingId === skin.id}
                onPreview={onPreview}
                onApply={onApply}
                onDelete={onDelete}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default SkinLibraryGrid;
