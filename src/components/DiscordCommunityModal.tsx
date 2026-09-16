import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, Bell, Wrench, X, Shield } from 'lucide-react';

interface DiscordCommunityModalProps {
  isOpen: boolean;
  onJoin: () => void;
  onDismiss: (permanent: boolean) => void;
}

const COUNTDOWN_DURATION_SEC = 5;

export const DiscordCommunityModal: React.FC<DiscordCommunityModalProps> = ({
  isOpen,
  onJoin,
  onDismiss,
}) => {
  const [timeLeftMs, setTimeLeftMs] = useState(COUNTDOWN_DURATION_SEC * 1000);

  // Reset timer whenever the modal opens
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setTimeLeftMs(COUNTDOWN_DURATION_SEC * 1000);
    const stepMs = 50;
    const interval = setInterval(() => {
      setTimeLeftMs(prev => {
        if (prev <= stepMs) {
          clearInterval(interval);
          return 0;
        }
        return prev - stepMs;
      });
    }, stepMs);

    return () => clearInterval(interval);
  }, [isOpen]);

  const isUnlocked = timeLeftMs === 0;
  const secondsLeft = Math.ceil(timeLeftMs / 1000);
  const progressPct = Math.min(100, Math.max(0, ((COUNTDOWN_DURATION_SEC * 1000 - timeLeftMs) / (COUNTDOWN_DURATION_SEC * 1000)) * 100));

  // Escape key listener: only dismiss if unlocked
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isUnlocked) {
          e.preventDefault();
          onDismiss(false);
        } else {
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isUnlocked, onDismiss]);

  const handleBackdropClick = () => {
    if (isUnlocked) {
      onDismiss(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 select-none">
          {/* Backdrop with smooth blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleBackdropClick}
            className={`absolute inset-0 bg-black/80 backdrop-blur-md transition-all ${
              isUnlocked ? 'cursor-pointer' : 'cursor-default'
            }`}
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ type: 'spring', duration: 0.45, bounce: 0.08 }}
            className="relative z-10 w-full max-w-md bg-neutral-900/95 border border-white/10 rounded-3xl p-6 md:p-7 shadow-[0_25px_65px_rgba(0,0,0,0.85)] text-white overflow-hidden space-y-6"
          >
            {/* Ambient Blurple Halo Background Effect */}
            <div className="absolute -top-24 -left-24 w-64 h-64 bg-[#5865F2]/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-[#5865F2]/10 rounded-full blur-3xl pointer-events-none" />

            {/* Header: Badge Discord + Title */}
            <div className="flex items-start justify-between gap-4 relative z-10">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-[#5865F2]/20 border border-[#5865F2]/30 flex items-center justify-center text-[#5865F2] shadow-[0_4px_16px_rgba(88,101,242,0.3)] flex-shrink-0">
                  {/* Official Discord SVG Icon */}
                  <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base tracking-tight text-white">
                      Discord Launched
                    </h3>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#5865F2] bg-[#5865F2]/10 border border-[#5865F2]/25 px-2 py-0.5 rounded-full">
                      Discord
                    </span>
                  </div>
                  <p className="text-white/50 text-xs mt-0.5">
                    Support technique & annonces officielles
                  </p>
                </div>
              </div>

              {/* Close Button (visible and active only when unlocked) */}
              <AnimatePresence>
                {isUnlocked && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    type="button"
                    onClick={() => onDismiss(false)}
                    className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                    title="Fermer"
                  >
                    <X className="w-4 h-4" />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {/* Focused Features: Support & Updates */}
            <div className="space-y-3 relative z-10">
              <p className="text-xs text-white/70 leading-relaxed">
                Rejoins le serveur Discord officiel pour suivre le launcher :
              </p>

              <div className="space-y-2 p-3.5 rounded-2xl bg-black/40 border border-white/5">
                <div className="flex items-center gap-2.5 text-xs text-white/80">
                  <div className="w-6 h-6 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 text-amber-400">
                    <Bell className="w-3.5 h-3.5" />
                  </div>
                  <span>Annonces des nouvelles mises à jour et versions</span>
                </div>

                <div className="flex items-center gap-2.5 text-xs text-white/80">
                  <div className="w-6 h-6 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 text-[#5865F2]">
                    <Wrench className="w-3.5 h-3.5" />
                  </div>
                  <span>Support technique et aide en cas de problème</span>
                </div>
              </div>
            </div>

            {/* Primary Action Button (Immediately Clickable) */}
            <div className="space-y-3 relative z-10 pt-1">
              <button
                type="button"
                onClick={onJoin}
                className="group relative w-full py-3 px-4 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] active:scale-[0.98] transition-all text-white font-bold text-xs md:text-sm flex items-center justify-center gap-2.5 shadow-[0_6px_24px_rgba(88,101,242,0.45)] hover:shadow-[0_8px_30px_rgba(88,101,242,0.6)] cursor-pointer"
              >
                <svg className="w-4.5 h-4.5 fill-current" viewBox="0 0 24 24">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
                <span>Rejoindre le serveur Discord</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-70 group-hover:opacity-100 transition-opacity" />
              </button>

              {/* 5-Second Timer & Dismissal Controls */}
              <div className="pt-2">
                {!isUnlocked ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-white/40">
                      <span>Accès au launcher dans...</span>
                      <span className="font-mono font-bold text-white/70">{secondsLeft}s</span>
                    </div>
                    {/* Visual Countdown Progress Bar */}
                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-white/30 via-[#5865F2] to-white/70 rounded-full transition-all duration-75"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className="flex gap-2.5"
                  >
                    <button
                      type="button"
                      onClick={() => onDismiss(false)}
                      className="flex-1 py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white font-medium text-xs transition-colors cursor-pointer text-center"
                    >
                      Plus tard
                    </button>
                    <button
                      type="button"
                      onClick={() => onDismiss(true)}
                      className="flex-1 py-2.5 px-3 rounded-xl bg-neutral-800/80 hover:bg-neutral-800 border border-white/10 hover:border-white/20 text-white/50 hover:text-white/80 font-medium text-xs transition-colors cursor-pointer text-center"
                      title="Ne plus afficher cette pop-up"
                    >
                      Ne plus afficher
                    </button>
                  </motion.div>
                )}
              </div>
            </div>

            {/* Subdued Footer Note */}
            <div className="pt-1 border-t border-white/5 flex items-center justify-center gap-1.5 text-white/30 text-[10px] relative z-10">
              <Shield className="w-3 h-3" />
              <span>discord.gg/BWaj9JzsX6 • Invitation officielle</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default DiscordCommunityModal;
