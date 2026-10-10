import type { Metadata } from 'next';
import { Hero } from '@/components/home/Hero';
import { FeatureCards } from '@/components/home/FeatureCards';

export const metadata: Metadata = { title: 'GHOST PROTOCOL AI — The Invisible Intelligence Layer', description: 'On-chain wallet relationship analysis. Read real transactions, map counterparties and trace value flow.' };

export default function HomePage() {
  return (
    <div className="home-shell lg:flex lg:min-h-[calc(100svh-156px)] lg:flex-col">
      <Hero />
      <FeatureCards />
    </div>
  );
}
