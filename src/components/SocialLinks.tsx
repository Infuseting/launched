import React from 'react';
import { motion } from 'framer-motion';
import type { SessionLink } from '../types';
import { open } from "@tauri-apps/plugin-shell";

interface SocialLinksProps {
  links: SessionLink[];
  assetsPath?: string;
}

const SocialLinks: React.FC<SocialLinksProps> = ({ links, assetsPath }) => {
  if (!links || links.length === 0) return null;

  const handleLinkClick = async (url: string) => {
    try {
      await open(url);
    } catch (err) {
      console.error("Failed to open link:", err);
    }
  };

  return (
    <div className="flex flex-col gap-4 items-center">
      {links.map((link, index) => {
        let iconUrl = link.icon;
        const isRemote = iconUrl.startsWith('http') || iconUrl.startsWith('data:');
        
        if (!isRemote && assetsPath) {
          // If it's a local filename, prepend the assetsPath
          iconUrl = `${assetsPath}/${iconUrl}`;
        }

        return (
          <motion.button
            key={index}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 * index, duration: 0.5 }}
            whileHover={{ scale: 1.1, backgroundColor: 'rgba(255, 255, 255, 0.15)' }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleLinkClick(link.url)}
            title={link.name}
            className="w-12 h-12 rounded-2xl bg-black/20 hover:bg-black/40 border border-white/10 backdrop-blur-xl flex items-center justify-center cursor-pointer transition-colors hover:border-white/20 shadow-2xl group"
          >
            {isRemote || (assetsPath && !link.icon.includes(' ')) ? (
              <img 
                src={iconUrl} 
                alt={link.name} 
                className="w-6 h-6 object-contain brightness-0 invert opacity-70 group-hover:opacity-100 transition-opacity"
                onError={(e) => {
                  // Fallback if image fails or is not a URL/path
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).parentElement!.innerHTML = `<span class="text-[10px] uppercase font-bold text-white/50 group-hover:text-white transition-colors">${link.name.substring(0, 2)}</span>`;
                }}
              />
            ) : (
              <span className="text-[10px] uppercase font-bold text-white/50 group-hover:text-white transition-colors">
                {link.name.substring(0, 2)}
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
};

export default SocialLinks;
