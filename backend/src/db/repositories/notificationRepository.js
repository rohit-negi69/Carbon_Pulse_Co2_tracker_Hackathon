import { usingMongo, memory, nextId, models } from '../index.js';

// Notification repository (the "Alerts / Nudges" store).

export async function push(notification) {
  if (notification.dedupeKey) {
    const existing = await find({ dedupeKey: notification.dedupeKey });
    if (existing.length) return existing[0];
  }
  if (usingMongo()) {
    const created = await models.Notification.create(notification);
    return created.toObject();
  }
  const stored = { _id: nextId(), read: false, createdAt: new Date(), ...notification };
  memory.notifications.unshift(stored);
  return stored;
}

export async function find({ dedupeKey, unreadOnly } = {}) {
  if (usingMongo()) {
    const query = {};
    if (dedupeKey) query.dedupeKey = dedupeKey;
    if (unreadOnly) query.read = false;
    return models.Notification.find(query).sort({ createdAt: -1 }).limit(50).lean();
  }
  let rows = [...memory.notifications];
  if (dedupeKey) rows = rows.filter((n) => n.dedupeKey === dedupeKey);
  if (unreadOnly) rows = rows.filter((n) => !n.read);
  return rows.slice(0, 50);
}

export async function markAllRead() {
  if (usingMongo()) {
    await models.Notification.updateMany({ read: false }, { read: true });
    return true;
  }
  memory.notifications = memory.notifications.map((n) => ({ ...n, read: true }));
  return true;
}

export async function markRead(id) {
  if (usingMongo()) return models.Notification.findByIdAndUpdate(id, { read: true }, { new: true }).lean();
  const found = memory.notifications.find((n) => String(n._id) === String(id));
  if (found) found.read = true;
  return found || null;
}
