import { describe, expect, it } from 'vitest';
import { planReceiptDeletion, type DeletionEntry, type DeletionPush } from '../src/receipt-deletion.js';

const entry = (id: string, kind: string, reversesId: string | null = null, variantId = 'v1'): DeletionEntry => ({
  id,
  kind,
  reversesId,
  variantId,
});
const push = (stockEntryId: string, delta: number, reason: DeletionPush['reason'] = 'pushed', locationId = 'L1'): DeletionPush => ({
  stockEntryId,
  delta,
  reason,
  locationId,
});

describe('planReceiptDeletion – was gelöscht wird (G32)', () => {
  it('nimmt die Zugangsbuchungen des Wareneingangs', () => {
    const plan = planReceiptDeletion([entry('z1', 'goods_receipt'), entry('z2', 'goods_receipt', null, 'v2')], []);
    expect(plan.entryIds.sort()).toEqual(['z1', 'z2']);
    expect(plan.blockedBy).toEqual([]);
  });

  it('nimmt Stornos dieser Zugänge mit', () => {
    const plan = planReceiptDeletion([entry('z1', 'goods_receipt'), entry('s1', 'reversal', 'z1')], []);
    expect(plan.entryIds.sort()).toEqual(['s1', 'z1']);
    expect(plan.blockedBy).toEqual([]);
  });

  it('sperrt, wenn ein Verkauf die Chargen nutzt', () => {
    const plan = planReceiptDeletion([entry('z1', 'goods_receipt'), entry('k1', 'sale')], []);
    expect(plan.blockedBy).toEqual(['sale']);
  });

  it('sperrt auch, wenn der Verkauf storniert ist – die Buchungen bleiben im Journal', () => {
    const plan = planReceiptDeletion(
      [entry('z1', 'goods_receipt'), entry('k1', 'sale'), entry('s1', 'reversal', 'k1')],
      [],
    );
    expect(plan.blockedBy).toEqual(['reversal', 'sale']);
  });

  it('nennt jede sperrende Art nur einmal, sortiert', () => {
    const plan = planReceiptDeletion(
      [entry('z1', 'goods_receipt'), entry('k1', 'sale'), entry('k2', 'sale'), entry('i1', 'stocktake')],
      [],
    );
    expect(plan.blockedBy).toEqual(['sale', 'stocktake']);
  });
});

describe('planReceiptDeletion – Shopify zurücknehmen', () => {
  it('zieht übertragene Zugänge je Variante und Lagerort wieder ab', () => {
    const plan = planReceiptDeletion(
      [entry('z1', 'goods_receipt'), entry('z2', 'goods_receipt', null, 'v2'), entry('z3', 'goods_receipt')],
      [push('z1', 4), push('z2', 2), push('z3', 1)],
    );
    expect(plan.shopify).toEqual([
      { variantId: 'v1', locationId: 'L1', delta: -5 },
      { variantId: 'v2', locationId: 'L1', delta: -2 },
    ]);
  });

  it('nichts zurücknehmen, wenn nichts übertragen war', () => {
    expect(planReceiptDeletion([entry('z1', 'goods_receipt')], []).shopify).toEqual([]);
  });

  it('ein übertragenes Storno gleicht den Zugang schon aus', () => {
    const plan = planReceiptDeletion(
      [entry('z1', 'goods_receipt'), entry('s1', 'reversal', 'z1')],
      [push('z1', 4), push('s1', -4)],
    );
    expect(plan.shopify).toEqual([]);
  });

  it('ein noch nicht übertragenes Storno zählt nicht – Shopify hat den Zugang noch', () => {
    const plan = planReceiptDeletion([entry('z1', 'goods_receipt'), entry('s1', 'reversal', 'z1')], [push('z1', 4)]);
    expect(plan.shopify).toEqual([{ variantId: 'v1', locationId: 'L1', delta: -4 }]);
  });

  it('ignoriert vermerkte, aber nie gesendete Buchungen', () => {
    const plan = planReceiptDeletion(
      [entry('z1', 'goods_receipt')],
      [{ stockEntryId: 'z1', delta: 4, reason: 'before_stage4', locationId: null }],
    );
    expect(plan.shopify).toEqual([]);
  });
});
