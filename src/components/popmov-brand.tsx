import { cn } from '@/lib/utils';

export function PopmovMascot({ className, animated = false }: { className?: string; animated?: boolean }) {
  return <span aria-hidden="true" className={cn('popmov-mascot relative inline-flex shrink-0', animated && 'popmov-mascot-loading', className)}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/brand/popmov-mark.webp" alt="" width={512} height={512} className="h-full w-full rounded-[24%] object-contain" draggable={false} />
    {animated && <span className="popmov-sparkle pointer-events-none absolute -right-1 top-0 text-white drop-shadow-md">✦</span>}
  </span>;
}

export function PopmovWordmark({ className }: { className?: string }) {
  return <span className={cn('popmov-wordmark', className)}>POPMOV</span>;
}

export function PopmovBrand({ className }: { className?: string }) {
  return <span className={cn('inline-flex items-center gap-2', className)}><PopmovMascot className="h-10 w-10" /><PopmovWordmark className="text-[28px]" /></span>;
}

export function PopmovLoader({ label = '小鹿正在准备好片…', className }: { label?: string; className?: string }) {
  return <div role="status" className={cn('popmov-loader flex flex-col items-center justify-center gap-4 text-center', className)}>
    <PopmovMascot animated className="h-24 w-24 sm:h-28 sm:w-28" />
    <div><PopmovWordmark className="text-3xl" /><p className="mt-1 text-xs text-muted">{label}</p></div>
    <span aria-hidden="true" className="popmov-loading-dots flex gap-1.5"><i /><i /><i /></span>
  </div>;
}
