import type { Metadata } from 'next';
import { ArchiveView } from '@/components/archive/ArchiveView';

export const metadata: Metadata = {
  title: 'Archive',
  description: 'Saved analysis digests with optional on-chain attestation via the AnalysisRegistry contract.',
};

export default function ArchivePage() {
  return <ArchiveView />;
}
