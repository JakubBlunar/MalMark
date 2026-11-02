import { useState, useEffect } from 'react';
import { Film } from 'lucide-react';
import type { Anime } from '../../../shared/types';

export function AnimeCover({
  anime,
  large = false,
  lazy = false,
}: {
  anime?: Anime;
  large?: boolean;
  lazy?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const picture = large
    ? anime?.main_picture?.large || anime?.main_picture?.medium
    : anime?.main_picture?.medium || anime?.main_picture?.large;
  useEffect(() => setBroken(false), [picture]);
  return (
    <div className={`cover ${large ? 'large' : ''}`}>
      {picture && !broken ? (
        <img
          src={picture}
          alt={`${anime?.title} cover`}
          loading={lazy ? 'lazy' : undefined}
          onError={() => setBroken(true)}
        />
      ) : (
        <>
          <div className="cover-orbit" />
          <Film size={large ? 32 : 20} />
          <span>ANIME</span>
        </>
      )}
    </div>
  );
}
