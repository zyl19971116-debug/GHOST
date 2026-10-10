import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AnalyzeConsole } from '@/components/analyze/AnalyzeConsole';
import { Skeleton } from '@/components/ui/input';

export const metadata: Metadata = {
  title: 'Analyze',
  description:
    'Enter an EVM wallet address to read its real on-chain transactions, capital flow, counterparties, contract interactions and deterministic pattern flags.',
};

export default function AnalyzePage() {
  return (
    <Suspense
      fallback={
        <div className="container max-w-[1600px] space-y-4 pt-8">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-32 w-full" />
        </div>
      }
    >
      <AnalyzeConsole />
    </Suspense>
  );
}
