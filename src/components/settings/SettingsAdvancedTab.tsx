import React from 'react';
import { motion } from 'framer-motion';

interface SettingsAdvancedTabProps {
  localJvmArgs: string;
  localWrapperCommand: string;
  refs: {
    jvmArgsRef: React.RefObject<HTMLElement>;
    wrapperCommandRef: React.RefObject<HTMLElement>;
  };
}

const SettingsAdvancedTab: React.FC<SettingsAdvancedTabProps> = ({
  localJvmArgs,
  localWrapperCommand,
  refs,
}) => {
  return (
    <motion.div
      key="advanced"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="space-y-3">
        <label className="text-white font-black tracking-tight flex items-center gap-2">
          <sl-icon name="braces"></sl-icon> JVM Arguments
        </label>
        <sl-textarea
          ref={refs.jvmArgsRef as any}
          placeholder="-Xmx4G -XX:+UseG1GC..."
          rows={6}
          value={localJvmArgs}
          style={{ '--sl-input-background-color': 'rgba(255,255,255,0.05)', '--sl-input-border-color': 'rgba(255,255,255,0.1)' }}
        ></sl-textarea>
      </div>

      <div className="space-y-3">
        <label className="text-white font-black tracking-tight flex items-center gap-2">
          <sl-icon name="command"></sl-icon> Wrapper Command
        </label>
        <sl-input
          ref={refs.wrapperCommandRef as any}
          placeholder="e.g. optirun"
          value={localWrapperCommand}
        ></sl-input>
      </div>
    </motion.div>
  );
};

export default SettingsAdvancedTab;
