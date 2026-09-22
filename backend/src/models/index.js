import mongoose from 'mongoose';
import { CATEGORY_TYPES } from '../domain/factors.js';

// ---------------------------------------------------------------------------
// Data layer schemas. Mirrors the diagram's table list:
// activities · emission_factors · weekly_targets · notifications ·
// analytics_summary · activity_history
// ---------------------------------------------------------------------------

const activitySchema = new mongoose.Schema(
  {
    type: { type: String, required: true, enum: CATEGORY_TYPES, index: true },
    quantity: { type: Number, required: true, min: 0.0001 },
    date: { type: String, required: true, index: true }, // YYYY-MM-DD
    notes: { type: String, default: '', trim: true, maxlength: 160 },
    co2: { type: Number, required: true }, // kg, computed by the calculation engine
    factorUsed: { type: Number, required: true }, // auditability: the factor at write time
    tier: { type: String, enum: ['low', 'med', 'high'], index: true },
    source: { type: String, enum: ['form', 'chat', 'api'], default: 'form' },
    confirmed: { type: Boolean, default: false }, // DP2: was an extreme value confirmed?
  },
  { timestamps: true }
);

const targetSchema = new mongoose.Schema({
  key: { type: String, default: 'singleton', unique: true },
  weeklyTarget: { type: Number, default: 50, min: 1 },
  history: [{ value: Number, at: { type: Date, default: Date.now } }],
});

const factorSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, unique: true },
    label: String,
    unit: String,
    factor: Number,
    sanityMax: Number,
    scope: String,
  },
  { timestamps: true }
);

const notificationSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['warn', 'exceeded', 'insight', 'info'], required: true },
    title: String,
    body: String,
    severity: { type: String, enum: ['low', 'med', 'high'], default: 'med' },
    read: { type: Boolean, default: false, index: true },
    meta: { type: Object, default: {} },
    dedupeKey: { type: String, index: true },
  },
  { timestamps: true }
);

const historySchema = new mongoose.Schema(
  {
    action: { type: String, enum: ['created', 'deleted', 'target-changed'], required: true },
    entityId: String,
    snapshot: Object,
  },
  { timestamps: true }
);

const summarySchema = new mongoose.Schema(
  {
    period: { type: String, required: true, unique: true }, // e.g. 2026-W39
    start: String,
    end: String,
    total: Number,
    byCategory: Object,
    activityCount: Number,
    target: Number,
    exceeded: Boolean,
  },
  { timestamps: true }
);

// A GPS tracking session: raw fixes in, a classified mode and a CO₂ figure out.
const tripSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ['active', 'completed', 'discarded'], default: 'active', index: true },
    label: { type: String, default: '', trim: true, maxlength: 80 },
    mode: { type: String, default: 'unknown', index: true },
    autoMode: { type: String, default: 'unknown' },
    corrected: { type: Boolean, default: false },
    distanceKm: { type: Number, default: 0 },
    durationMin: { type: Number, default: 0 },
    avgSpeedKmh: { type: Number, default: 0 },
    maxSpeedKmh: { type: Number, default: 0 },
    co2: { type: Number, default: 0 },
    factorUsed: { type: Number, default: 0 },
    activityType: { type: String, default: null },
    activityId: { type: String, default: null },
    points: { type: Array, default: [] },
    startedAt: Date,
    endedAt: Date,
    logged: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// User-confirmed text→category pairs. Feeds online learning for the classifier.
const trainingExampleSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    text: { type: String, required: true, maxlength: 240 },
    source: { type: String, default: 'confirmed-prediction' },
  },
  { timestamps: true }
);

function model(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

export const models = {
  Activity: model('Activity', activitySchema),
  Target: model('WeeklyTarget', targetSchema),
  Factor: model('EmissionFactor', factorSchema),
  Notification: model('Notification', notificationSchema),
  History: model('ActivityHistory', historySchema),
  Summary: model('AnalyticsSummary', summarySchema),
  Trip: model('Trip', tripSchema),
  TrainingExample: model('TrainingExample', trainingExampleSchema),
};
