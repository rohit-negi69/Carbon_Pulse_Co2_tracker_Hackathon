// The CO₂ Calculation Engine's source data.
// Fixed emission factors from the brief; seeded into the `emission_factors`
// collection on boot so lookups flow through the database layer like any other
// domain data, while this file stays the single source of truth.
export const SEED_FACTORS = [
  { type: 'car', label: 'Car travel', unit: 'km', factor: 0.2, sanityMax: 1000, scope: 'scope-1' },
  { type: 'bus', label: 'Bus travel', unit: 'km', factor: 0.08, sanityMax: 2000, scope: 'scope-3' },
  { type: 'flight', label: 'Flight', unit: 'km', factor: 0.25, sanityMax: 5000, scope: 'scope-3' },
  { type: 'electricity', label: 'Electricity', unit: 'kWh', factor: 0.8, sanityMax: 100, scope: 'scope-2' },
  { type: 'veg_meal', label: 'Veg meal', unit: 'meals', factor: 0.5, sanityMax: 10, scope: 'scope-3' },
  { type: 'non_veg_meal', label: 'Non-veg meal', unit: 'meals', factor: 2.0, sanityMax: 10, scope: 'scope-3' },
];

// Fallback registry used before/without a database connection.
export const FACTORS = Object.fromEntries(
  SEED_FACTORS.map((f) => [f.type, { label: f.label, unit: f.unit, factor: f.factor, sanityMax: f.sanityMax, scope: f.scope }])
);

export const ABSURD_THRESHOLDS = Object.fromEntries(SEED_FACTORS.map((f) => [f.type, f.sanityMax]));

export const CATEGORY_TYPES = SEED_FACTORS.map((f) => f.type);

// Impact tiers keep the history filter and the UI badges in agreement.
export function tierOf(co2) {
  if (co2 > 10) return 'high';
  if (co2 >= 2) return 'med';
  return 'low';
}
