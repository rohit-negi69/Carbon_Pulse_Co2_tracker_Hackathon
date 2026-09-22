// Fixed emission factors for the whole app. Single source of truth.
export const FACTORS = {
  car: { label: 'Car travel', unit: 'km', factor: 0.2 }, // kg CO2 per km
  bus: { label: 'Bus travel', unit: 'km', factor: 0.08 },
  flight: { label: 'Flight', unit: 'km', factor: 0.25 },
  electricity: { label: 'Electricity', unit: 'kWh', factor: 0.8 },
  veg_meal: { label: 'Veg meal', unit: 'meals', factor: 0.5 },
  non_veg_meal: { label: 'Non-veg meal', unit: 'meals', factor: 2.0 },
};

// Absurd-input thresholds (DP2): quantity beyond this triggers a confirmation
// instead of being accepted silently. Chosen so honest edge cases survive but
// obvious typos (500,000 km) get caught.
export const ABSURD_THRESHOLDS = {
  car: 1000, // km in a day is already extreme
  bus: 2000,
  flight: 5000, // longer than any single commercial flight
  electricity: 100, // kWh in a day for a household is very high
  veg_meal: 10,
  non_veg_meal: 10,
};
