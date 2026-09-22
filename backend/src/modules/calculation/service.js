import * as factorRepository from '../../db/repositories/factorRepository.js';
import { tierOf } from '../../domain/factors.js';

// ---------------------------------------------------------------------------
// CO₂ Calculation Engine
// activity input (type, quantity) → fetch factor → compute → tier + sanity.
// ---------------------------------------------------------------------------

export async function listFactors() {
  const factors = await factorRepository.all();
  return {
    factors,
    thresholds: Object.fromEntries(Object.entries(factors).map(([type, f]) => [type, f.sanityMax])),
  };
}

export async function factorFor(type) {
  return factorRepository.get(type);
}

/**
 * Compute the footprint for an activity.
 * @returns {{ok: true, co2: number, factor: object, tier: string}
 *          | {ok: false, status: number, error?: string, needsConfirmation?: boolean, message?: string, computedCo2?: number}}
 */
export async function calculate({ type, quantity, confirmed = false }) {
  const factor = await factorFor(type);
  if (!factor) {
    const available = Object.keys(await factorRepository.all()).join(', ');
    return { ok: false, status: 400, error: `Unknown activity type. Valid types: ${available}` };
  }

  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, status: 400, error: 'Quantity must be a positive number.' };
  }

  const co2 = Number((qty * factor.factor).toFixed(2));

  // DP2 — never clamp silently: extreme input asks for explicit confirmation.
  if (!confirmed && factor.sanityMax && qty > factor.sanityMax) {
    return {
      ok: false,
      status: 422,
      needsConfirmation: true,
      message: `That's ${qty} ${factor.unit} ≈ ${co2.toLocaleString()} kg CO₂ — that looks like it might be a typo. Confirm or edit the value.`,
      computedCo2: co2,
    };
  }

  return { ok: true, co2, factor, tier: tierOf(co2) };
}

export function tierFor(co2) {
  return tierOf(co2);
}

/**
 * What-if simulator: swap `quantity` units of one category for another.
 * Shared by POST /api/simulate and the socket's `simulate` command.
 */
export async function simulate({ fromType, toType, quantity } = {}) {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, status: 400, error: 'quantity must be a positive number' };
  }

  const factors = await factorRepository.all();
  if (!factors[fromType] || !factors[toType]) {
    return { ok: false, status: 400, error: 'fromType and toType must be valid activity types' };
  }

  const before = Number((qty * factors[fromType].factor).toFixed(2));
  const after = Number((qty * factors[toType].factor).toFixed(2));
  const saving = Number((before - after).toFixed(2));

  return {
    ok: true,
    fromType,
    toType,
    quantity: qty,
    before,
    after,
    saving,
    savingPct: before > 0 ? Math.round((saving / before) * 100) : 0,
    monthlySaving: Number((saving * 4).toFixed(2)),
  };
}
