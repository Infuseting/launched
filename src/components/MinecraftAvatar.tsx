import React, { useEffect, useState } from 'react';
import { User as UserIcon } from 'lucide-react';

interface MinecraftAvatarProps {
  uuid?: string | null;
  alt?: string;
  size?: number;
  fallbackIcon?: React.ReactNode;
  className?: string;
}

/**
 * Renders a Minecraft player head avatar using mc-heads.net with minotar.net fallback.
 */
export const MinecraftAvatar: React.FC<MinecraftAvatarProps> = ({
  uuid,
  alt = '',
  size = 64,
  fallbackIcon,
  className = 'w-full h-full object-cover rendering-pixelated',
}) => {
  const [fallbackTried, setFallbackTried] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFallbackTried(false);
    setFailed(false);
  }, [uuid]);

  if (!uuid || failed) {
    return (
      <>
        {fallbackIcon ?? (
          <UserIcon aria-hidden="true" className="w-5 h-5 text-white/40" />
        )}
      </>
    );
  }

  const src = fallbackTried
    ? `https://minotar.net/avatar/${uuid}/${size}`
    : `https://mc-heads.net/avatar/${uuid}/${size}`;

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => {
        if (!fallbackTried) {
          setFallbackTried(true);
        } else {
          setFailed(true);
        }
      }}
    />
  );
};

export default MinecraftAvatar;
