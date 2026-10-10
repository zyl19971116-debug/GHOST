import { getCapabilityReport } from '@/lib/config';
import { jsonOk } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Reports exactly what this deployment can and cannot do. The UI reads this to
 * decide between showing real data and showing an honest "NOT CONFIGURED" state.
 */
export async function GET() {
  return jsonOk(getCapabilityReport(), { headers: { 'Cache-Control': 'no-store' } });
}
