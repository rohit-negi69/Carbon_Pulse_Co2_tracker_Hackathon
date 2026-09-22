import * as notificationRepository from '../../db/repositories/notificationRepository.js';
import * as analytics from '../analytics/service.js';
import { config } from '../../config/index.js';

// ---------------------------------------------------------------------------
// Weekly Target & Nudges
// DP1 policy: the app warns, encourages and suggests — it never blocks or
// shames. Nudges are derived from live telemetry and deduplicated per week.
// ---------------------------------------------------------------------------

export async function evaluate() {
  const week = await analytics.week();
  const { start } = week;
  const created = [];

  if (week.exceeded) {
    created.push(
      await notificationRepository.push({
        kind: 'exceeded',
        severity: 'high',
        title: `Weekly target exceeded — ${week.used} kg of ${week.target} kg`,
        body: `Awareness is the win. You're ${(week.used - week.target).toFixed(1)} kg over with ${week.daysRemaining} day(s) left; pick one category to trim rather than trying to fix everything at once.`,
        meta: { weekStart: start, used: week.used, target: week.target },
        dedupeKey: `exceeded:${start}`,
      })
    );
  } else if (week.pct >= config.nudgeWarnRatio * 100) {
    created.push(
      await notificationRepository.push({
        kind: 'warn',
        severity: 'med',
        title: `${week.pct}% of your weekly budget used`,
        body: `You have ${week.remaining} kg CO₂ left for the rest of the week (day ${week.daysElapsed} of 7). A couple of transit swaps usually keeps you inside it.`,
        meta: { weekStart: start, used: week.used, target: week.target },
        dedupeKey: `warn:${start}`,
      })
    );
  }

  if (week.pace === 'behind' && !week.exceeded) {
    created.push(
      await notificationRepository.push({
        kind: 'insight',
        severity: 'med',
        title: 'Pace check: spending faster than the week is passing',
        body: `You're at ${week.pct}% of budget while ${week.elapsedPct}% of the week has elapsed. Adjusting now is easier than catching up on Sunday.`,
        meta: { weekStart: start },
        dedupeKey: `pace-behind:${start}`,
      })
    );
  }

  if (week.pace === 'ahead') {
    created.push(
      await notificationRepository.push({
        kind: 'insight',
        severity: 'low',
        title: 'On pace and under budget',
        body: `${week.pct}% of budget used with ${week.daysElapsed} of 7 days gone — whatever you're doing, it's working.`,
        meta: { weekStart: start },
        dedupeKey: `pace-ahead:${start}`,
      })
    );
  }

  return created;
}

export async function list() {
  const [items, unread] = await Promise.all([
    notificationRepository.find({}),
    notificationRepository.find({ unreadOnly: true }),
  ]);
  return { notifications: items, unread: unread.length };
}

export function markAllRead() {
  return notificationRepository.markAllRead();
}

export function markRead(id) {
  return notificationRepository.markRead(id);
}
