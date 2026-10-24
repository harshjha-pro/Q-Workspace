import type { Payment } from '@/types/models';
import { repo, store } from '@/services/store';
import { currentUserId, notify } from '@/services/domain/common';
import { isConfigured } from '@/services/integrations';
import { nowIso, uid } from '@/utils/ids';

export interface CheckoutRequest { description: string; amount: number; kind: Payment['kind']; plan?: string }

/**
 * DEMO checkout. No money moves and no gateway is contacted. A real integration must create
 * the order on the server, open the gateway's checkout, and confirm via a verified webhook
 * before marking anything paid.
 */
export async function demoCheckout(req: CheckoutRequest, simulateFailure = false): Promise<Payment> {
  if (isConfigured('payments')) {
    throw new Error('A payment key is configured but the server-side order endpoint is not implemented yet. See README → Payments.');
  }
  await new Promise((r) => setTimeout(r, 900));
  const gstPct = store.getState().settings.fees.gstPercent;
  const p: Payment = {
    id: uid('pay'), userId: currentUserId() ?? 'anonymous', description: `${req.description} (demo)`, amount: req.amount, gst: Math.round((req.amount * gstPct) / 100),
    status: simulateFailure ? 'demo_failed' : 'demo_success', invoiceNo: `DEMO-INV-${Date.now().toString().slice(-6)}`, plan: req.plan, kind: req.kind, createdAt: nowIso(), demo: true
  };
  repo.insert('payments', p);
  if (!simulateFailure) notify(p.userId, 'account', 'Demo payment recorded', `${req.description} — no real money was charged.`, '/payments');
  return p;
}
