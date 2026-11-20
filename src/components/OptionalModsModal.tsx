import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SlidersHorizontal,
  X,
  Check,
  Search,
  Folder,
  Sparkles,
  Palette,
  Box,
  FileCode,
  HardDrive,
  CheckSquare,
  Square,
  Loader2,
  ArrowUpCircle,
  RefreshCw,
} from 'lucide-react';
import type { Session, OptionalFileItem } from '../types';
import { getSessionOptionalFiles } from '../services/sessions';

interface OptionalModsModalProps {
  isOpen: boolean;
  session: Session | null;
  isFirstSync?: boolean;
  hasUpdates?: boolean;
  onClose: () => void;
  onSave: (sessionName: string, enabledFiles: string[], allOptionalFiles: string[]) => Promise<void>;
}

function formatBytes(bytesStr: string): string {
  const bytes = parseInt(bytesStr, 10);
  if (isNaN(bytes) || bytes <= 0) return '0 Ko';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function getFolderIcon(folder: string) {
  const lower = folder.toLowerCase();
  if (lower.includes('shader')) return Sparkles;
  if (lower.includes('resource') || lower.includes('texture')) return Palette;
  if (lower.includes('mod')) return Box;
  if (lower.includes('config')) return FileCode;
  return Folder;
}

export const OptionalModsModal: React.FC<OptionalModsModalProps> = ({
  isOpen,
  session,
  isFirstSync = false,
  hasUpdates = false,
  onClose,
  onSave,
}) => {
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<OptionalFileItem[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);

  // Load files when modal opens
  useEffect(() => {
    if (!isOpen || !session) return;

    let isMounted = true;
    setLoading(true);
    setLoaded(false);
    setFiles([]);
    setSelectedPaths(new Set());
    setError(null);
    setSearchQuery('');

    getSessionOptionalFiles(session)
      .then((data) => {
        if (!isMounted) return;
        setFiles(data);
        setLoaded(true);
        const initialSelected = new Set<string>();
        data.forEach((f) => {
          if (f.isEnabled) {
            initialSelected.add(f.destPath);
          }
        });
        setSelectedPaths(initialSelected);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('Failed to load optional files:', err);
        setError(typeof err === 'string' ? err : 'Impossible de récupérer la liste des fichiers optionnels.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, session]);

  // Group files by folder
  const groupedFiles = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const filtered = files.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.folder.toLowerCase().includes(q) ||
        f.destPath.toLowerCase().includes(q)
    );

    const map: Record<string, OptionalFileItem[]> = Object.create(null);
    for (const f of filtered) {
      const folderKey = f.folder || 'Autres';
      if (!map[folderKey]) {
        map[folderKey] = [];
      }
      map[folderKey].push(f);
    }
    return map;
  }, [files, searchQuery]);

  // Files with updates available
  const updateFiles = useMemo(() => {
    return files.filter((f) => f.hasUpdate);
  }, [files]);

  // Toggle single file
  const toggleFile = (destPath: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(destPath)) {
        next.delete(destPath);
      } else {
        next.add(destPath);
      }
      return next;
    });
  };

  // Toggle entire folder
  const toggleFolder = (folderName: string, enable: boolean) => {
    const folderFiles = groupedFiles[folderName] ?? [];
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      folderFiles.forEach((f) => {
        if (enable) {
          next.add(f.destPath);
        } else {
          next.delete(f.destPath);
        }
      });
      return next;
    });
  };

  // Select all / Deselect all
  const selectAll = (enable: boolean) => {
    if (enable) {
      setSelectedPaths(new Set(files.map((f) => f.destPath)));
    } else {
      setSelectedPaths(new Set());
    }
  };

  // Select all updated files
  const handleUpdateAll = () => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      updateFiles.forEach((f) => next.add(f.destPath));
      return next;
    });
  };

  const handleConfirm = async () => {
    if (!session || saving || loading || !loaded) return;
    setSaving(true);
    setError(null);
    try {
      const allOptional = files.map((f) => f.destPath);
      await onSave(session.name, Array.from(selectedPaths), allOptional);
    } catch (err) {
      console.error('Failed to save optional files:', err);
      setError(typeof err === 'string' ? err : err instanceof Error ? err.message : 'Erreur lors de la sauvegarde des modifications.');
    } finally {
      setSaving(false);
    }
  };

  const isUpdateMode = hasUpdates || updateFiles.length > 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 select-none"
        >
          {/* Backdrop */}
          <div
            onClick={saving ? undefined : onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="optional-files-title"
            initial={{ opacity: 0, scale: 0.96, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 15 }}
            transition={{ type: 'spring', duration: 0.35, bounce: 0.05 }}
            className="relative z-10 w-full max-w-3xl max-h-[85vh] bg-neutral-900/98 border border-white/10 rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.8)] text-white overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-black/30 flex-shrink-0">
              <div className="flex items-center gap-3.5">
                <div
                  className={`w-11 h-11 rounded-2xl border flex items-center justify-center flex-shrink-0 transition-all ${
                    isUpdateMode
                      ? 'bg-amber-500/15 border-amber-500/30 text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.2)]'
                      : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
                  }`}
                >
                  {isUpdateMode ? (
                    <ArrowUpCircle className="w-5 h-5 text-amber-400" />
                  ) : (
                    <SlidersHorizontal className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 id="optional-files-title" className="font-bold text-base tracking-tight text-white">
                      {isUpdateMode
                        ? 'Mises à jour des fichiers optionnels'
                        : isFirstSync
                        ? 'Personnalisez votre modpack'
                        : 'Fichiers & Mods Optionnels'}
                    </h3>
                    {session && (
                      <span className="text-[11px] font-medium text-emerald-300 bg-emerald-500/15 px-2.5 py-0.5 rounded-lg border border-emerald-500/25">
                        {session.name}
                      </span>
                    )}
                  </div>
                  <p className="text-white/50 text-xs mt-0.5">
                    {isUpdateMode
                      ? 'Des versions plus récentes sont disponibles sur le serveur pour vos fichiers optionnels.'
                      : isFirstSync
                      ? 'Sélectionnez les mods, shaders ou packs de textures optionnels à télécharger.'
                      : 'Activez ou désactivez les éléments optionnels sans avoir à tout retélécharger.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={saving ? undefined : onClose}
                disabled={saving}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40"
                title="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Toolbar: Search & Select All */}
            <fieldset disabled={loading || saving || !loaded} className="p-4 px-6 border-b border-white/5 bg-white/[0.02] flex items-center justify-between gap-4 flex-shrink-0">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Rechercher un fichier ou dossier..."
                  aria-label="Rechercher un fichier ou dossier"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 focus:border-emerald-500/40 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-white/20 outline-none transition-all"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => selectAll(true)}
                  className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Tout cocher</span>
                </button>
                <button
                  type="button"
                  onClick={() => selectAll(false)}
                  className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 text-white/40" />
                  <span>Tout décocher</span>
                </button>
              </div>
            </fieldset>

            {/* Updates Banner */}
            {updateFiles.length > 0 && (
              <div className="mx-6 mt-4 p-3.5 px-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between gap-3 text-amber-200 flex-shrink-0 shadow-[0_0_20px_rgba(245,158,11,0.08)]">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400 flex-shrink-0">
                    <ArrowUpCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-amber-200">
                      {updateFiles.length} mise{updateFiles.length > 1 ? 's' : ''} à jour disponible{updateFiles.length > 1 ? 's' : ''}
                    </p>
                    <p className="text-[11px] text-amber-200/70">
                      Une nouvelle version est disponible sur le serveur pour vos fichiers optionnels.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleUpdateAll}
                  disabled={saving || loading || !loaded}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-[0_0_15px_rgba(245,158,11,0.25)] flex-shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Tout mettre à jour</span>
                </button>
              </div>
            )}

            {/* Content Body: Grouped List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {error && (
                <div className="p-3.5 px-4 rounded-xl bg-red-500/15 border border-red-500/25 text-red-300 text-xs flex items-center justify-between">
                  <span>{error}</span>
                  <button type="button" onClick={() => setError(null)} className="text-red-400 hover:text-red-200">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {loading ? (
                <div className="py-16 flex flex-col items-center justify-center gap-3 text-white/40">
                  <Loader2 className="w-7 h-7 animate-spin text-emerald-400" />
                  <span className="text-xs">Chargement des fichiers optionnels...</span>
                </div>
              ) : Object.keys(groupedFiles).length === 0 ? (
                <div className="py-16 text-center text-white/40 space-y-1">
                  <Box className="w-8 h-8 mx-auto opacity-30" />
                  <p className="text-xs font-semibold">Aucun fichier optionnel trouvé</p>
                  <p className="text-[11px] text-white/25">
                    {searchQuery ? 'Modifiez votre recherche.' : 'Ce serveur n’a configuré aucun fichier optionnel.'}
                  </p>
                </div>
              ) : (
                Object.entries(groupedFiles).map(([folderName, folderFiles]) => {
                  const Icon = getFolderIcon(folderName);
                  const allFolderSelected = folderFiles.every((f) => selectedPaths.has(f.destPath));
                  const someFolderSelected = folderFiles.some((f) => selectedPaths.has(f.destPath));
                  const selectedCount = folderFiles.filter((f) => selectedPaths.has(f.destPath)).length;

                  return (
                    <div
                      key={folderName}
                      className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden"
                    >
                      {/* Subfolder Header with whole-folder toggle */}
                      <div className="p-3.5 px-4 bg-white/[0.04] border-b border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <span className="font-bold text-xs uppercase tracking-wider text-white">
                              {folderName}
                            </span>
                            <span className="ml-2 text-[10px] text-white/40 font-mono">
                              ({selectedCount}/{folderFiles.length} activé{folderFiles.length > 1 ? 's' : ''})
                            </span>
                          </div>
                        </div>

                        {/* Whole-folder check/uncheck button */}
                        <button
                          type="button"
                          onClick={() => toggleFolder(folderName, !allFolderSelected)}
                          disabled={saving}
                          className={`
                            px-3 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer border
                            ${
                              allFolderSelected
                                ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
                                : someFolderSelected
                                ? 'bg-amber-500/20 border-amber-500/30 text-amber-300'
                                : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                            }
                          `}
                        >
                          <Check className={`w-3 h-3 ${allFolderSelected ? 'opacity-100' : 'opacity-40'}`} />
                          <span>
                            {allFolderSelected
                              ? 'Dossier activé'
                              : someFolderSelected
                              ? 'Partiellement activé'
                              : 'Activer tout le dossier'}
                          </span>
                        </button>
                      </div>

                      {/* Folder Files List */}
                      <div className="divide-y divide-white/5">
                        {folderFiles.map((file) => {
                          const isChecked = selectedPaths.has(file.destPath);

                          return (
                            <div
                              key={file.destPath}
                              role="checkbox"
                              tabIndex={saving ? -1 : 0}
                              aria-disabled={saving}
                              aria-label={file.name}
                              aria-checked={isChecked}
                              onKeyDown={(e) => {
                                if (!saving && (e.key === ' ' || e.key === 'Enter')) {
                                  e.preventDefault();
                                  toggleFile(file.destPath);
                                }
                              }}
                              onClick={saving ? undefined : () => toggleFile(file.destPath)}
                              className={`
                                p-3 px-4 flex items-center justify-between gap-4 transition-colors cursor-pointer outline-none focus-visible:bg-white/10
                                ${isChecked ? 'bg-emerald-500/[0.04] hover:bg-emerald-500/[0.07]' : 'hover:bg-white/[0.03]'}
                              `}
                            >
                              <div className="flex items-center gap-3.5 min-w-0">
                                {/* Checkbox */}
                                <div
                                  className={`
                                    w-5 h-5 rounded-lg border flex items-center justify-center transition-all flex-shrink-0
                                    ${
                                      isChecked
                                        ? 'bg-emerald-500 border-emerald-400 text-neutral-950 shadow-[0_0_10px_rgba(16,185,129,0.4)]'
                                        : 'border-white/20 bg-black/40 text-transparent'
                                    }
                                  `}
                                >
                                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                                </div>

                                <div className="min-w-0">
                                  <p className={`text-xs font-medium truncate ${isChecked ? 'text-white' : 'text-white/60'}`}>
                                    {file.name}
                                  </p>
                                  <p className="text-[10px] text-white/30 font-mono truncate">
                                    {file.destPath}
                                  </p>
                                  {file.oldVersionPath && (
                                    <p className="text-[10px] text-amber-400/90 font-mono truncate flex items-center gap-1 mt-0.5">
                                      <RefreshCw className="w-2.5 h-2.5 animate-spin-slow" />
                                      Remplace l&apos;ancienne version : {file.oldVersionPath.split('/').pop()}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2.5 flex-shrink-0">
                                {/* Size */}
                                <span className="text-[10px] font-mono text-white/40">
                                  {formatBytes(file.size)}
                                </span>

                                {/* Status Badge */}
                                {file.hasUpdate ? (
                                  <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 border border-amber-500/35 text-[10px] font-bold text-amber-300 flex items-center gap-1 shadow-[0_0_10px_rgba(245,158,11,0.2)]">
                                    <ArrowUpCircle className="w-3 h-3 text-amber-400" />
                                    Mise à jour
                                  </span>
                                ) : file.isDownloaded ? (
                                  isChecked ? (
                                    <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-[10px] font-bold text-emerald-300">
                                      Actif
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/25 text-[10px] font-bold text-amber-300">
                                      Désactivé (local)
                                    </span>
                                  )
                                ) : (
                                  <span className="px-2 py-0.5 rounded-lg bg-sky-500/15 border border-sky-500/25 text-[10px] font-bold text-sky-300">
                                    À télécharger
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-4 px-6 border-t border-white/10 bg-black/40 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2 text-xs text-white/40">
                <HardDrive className="w-3.5 h-3.5" />
                <span>
                  {selectedPaths.size} fichier{selectedPaths.size > 1 ? 's' : ''} sélectionné{selectedPaths.size > 1 ? 's' : ''}
                </span>
                {updateFiles.length > 0 && (
                  <span className="ml-2 text-amber-300/80 font-medium">
                    ({updateFiles.length} à mettre à jour)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="px-4 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={saving || loading || !loaded}
                  className={`px-6 py-2.5 rounded-2xl text-neutral-950 text-xs font-black flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 ${
                    isUpdateMode
                      ? 'bg-amber-400 hover:bg-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.35)]'
                      : 'bg-emerald-500 hover:bg-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)]'
                  }`}
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>
                    {isUpdateMode
                      ? isFirstSync
                        ? 'Mettre à jour et Synchroniser'
                        : 'Enregistrer la sélection'
                      : isFirstSync
                      ? 'Valider et Synchroniser'
                      : 'Enregistrer'}
                  </span>
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
