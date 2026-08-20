import React from 'react';
import { motion } from 'framer-motion';
import type { SessionLink } from '../types';
import { open } from '@tauri-apps/plugin-shell';
import { Globe, MessageSquare, ExternalLink } from 'lucide-react';

interface SocialLinksProps {
  links: SessionLink[];
  assetsPath?: string;
}

export const SocialLinks: React.FC<SocialLinksProps> = ({ links, assetsPath }) => {
  if (!links || links.length === 0) return null;

  const handleLinkClick = async (url: string) => {
    try {
      await open(url);
    } catch (err) {
      console.error('Failed to open link:', err);
    }
  };

  return (
    <nav aria-label="Liens sociaux" className="flex flex-col gap-2.5 items-center">
      {links.map((link, index) => {
        let iconUrl = link.icon;
        const isRemote = iconUrl.startsWith('http') || iconUrl.startsWith('data:');

        if (!isRemote && assetsPath) {
          iconUrl = `${assetsPath}/${iconUrl}`;
        }

        const isDiscord = link.name.toLowerCase().includes('discord');
        const isWeb = link.name.toLowerCase().includes('site') || link.name.toLowerCase().includes('web');

        return (
          <motion.button
            key={link.url + index}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05 * index, duration: 0.3 }}
            whileHover={{ scale: 1.08, x: -2 }}
            whileTap={{ scale: 0.94 }}
            onClick={() => handleLinkClick(link.url)}
            title={link.name}
            className="group relative w-10 h-10 rounded-2xl bg-neutral-900/70 hover:bg-neutral-800/90 border border-white/10 hover:border-white/20 backdrop-blur-2xl flex items-center justify-center cursor-pointer transition-all duration-200 shadow-[0_8px_32px_rgba(0,0,0,0.3)] text-white/70 hover:text-white"
          >
            {isRemote || (assetsPath && !link.icon.includes(' ')) ? (
              <img
                src={iconUrl}
                alt={link.name}
                className="w-4.5 h-4.5 object-contain brightness-0 invert opacity-70 group-hover:opacity-100 transition-opacity"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : isDiscord ? (
              <MessageSquare className="w-4 h-4" />
            ) : isWeb ? (
              <Globe className="w-4 h-4" />
            ) : (
              <ExternalLink className="w-4 h-4" />
            )}

            {/* Clean tooltip */}
            <span className="pointer-events-none absolute right-12 px-2.5 py-1 rounded-xl bg-neutral-900/95 border border-white/10 text-[10px] font-semibold text-white tracking-wide shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap">
              {link.name}
            </span>
          </motion.button>
        );
      })}
    </nav>
  );
};

export default SocialLinks;
