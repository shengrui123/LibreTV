'use client';

import { useRouter } from 'next/navigation';
import { Header } from '@/components/header';
import { AboutDialog } from '@/components/about-dialog';

export default function AboutPage() {
  const router = useRouter();
  return <div className="min-h-screen bg-page"><Header /><AboutDialog onClose={() => router.push('/')} /></div>;
}
