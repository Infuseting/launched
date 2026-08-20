import React from 'react';
import { Terminal, Command } from 'lucide-react';

interface SettingsAdvancedTabProps {
  localJvmArgs: string;
  localWrapperCommand: string;
  onJvmArgsChange: (val: string) => void;
  onWrapperCommandChange: (val: string) => void;
}

export const SettingsAdvancedTab: React.FC<SettingsAdvancedTabProps> = ({
  localJvmArgs,
  localWrapperCommand,
  onJvmArgsChange,
  onWrapperCommandChange,
}) => {
  return (
    <div className="space-y-6">
      {/* JVM Arguments Panel */}
      <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 space-y-3">
        <div className="flex items-center gap-2.5 pb-2 border-b border-white/5">
          <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60">
            <Terminal className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-white font-black text-sm tracking-tight">Arguments Personnalisés JVM</h3>
            <p className="text-[11px] text-white/40">Paramètres transmis directement à la machine virtuelle Java</p>
          </div>
        </div>

        <textarea
          rows={4}
          value={localJvmArgs}
          onChange={(e) => onJvmArgsChange(e.target.value)}
          placeholder="-XX:+UseG1GC -XX:+ParallelRefProcEnabled..."
          className="w-full bg-black/40 border border-white/10 focus:border-emerald-500/50 rounded-2xl p-4 text-white font-mono text-xs outline-none transition-colors placeholder-white/20 resize-none"
        />
      </div>

      {/* Wrapper Command Panel */}
      <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 space-y-3">
        <div className="flex items-center gap-2.5 pb-2 border-b border-white/5">
          <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60">
            <Command className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-white font-black text-sm tracking-tight">Commande Wrapper (GameMode / Mangohud...)</h3>
            <p className="text-[11px] text-white/40">Préfixe de commande exécuté avant le binaire Java</p>
          </div>
        </div>

        <input
          type="text"
          value={localWrapperCommand}
          onChange={(e) => onWrapperCommandChange(e.target.value)}
          placeholder="gamemoderun"
          className="w-full bg-black/40 border border-white/10 focus:border-emerald-500/50 rounded-2xl px-4 py-3 text-white font-mono text-xs outline-none transition-colors placeholder-white/20"
        />
      </div>
    </div>
  );
};

export default SettingsAdvancedTab;
