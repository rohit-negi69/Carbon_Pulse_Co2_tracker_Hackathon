import mongoose from 'mongoose';
import { FACTORS } from './factors.js';

const activitySchema = new mongoose.Schema({
  type: { type: String, required: true, enum: Object.keys(FACTORS) },
  quantity: { type: Number, required: true, min: 0.0001 },
  date: { type: String, required: true }, // YYYY-MM-DD
  notes: { type: String, default: '' }, // optional free-text label (route, appliance, meal)
  co2: { type: Number, required: true }, // kg, computed at write time
  createdAt: { type: Date, default: Date.now },
});

const targetSchema = new mongoose.Schema({
  key: { type: String, default: 'singleton', unique: true },
  weeklyTarget: { type: Number, default: 50 }, // kg CO2 per week
});

export function getModels() {
  const Activity = mongoose.models.Activity || mongoose.model('Activity', activitySchema);
  const Target = mongoose.models.Target || mongoose.model('Target', targetSchema);
  return { Activity, Target };
}
