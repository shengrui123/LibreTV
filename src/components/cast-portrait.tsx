'use client';

import { Cover } from './home-rows';

export function CastPortrait({ url, name }: { url?: string; name: string }) {
  return (
    <div className="w-full h-32 mb-3">
      <Cover url={url} alt={name} className="w-full h-full object-cover rounded-xl" />
    </div>
  );
}
