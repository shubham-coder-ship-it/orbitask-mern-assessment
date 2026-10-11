import { Notification } from '../models/Notification.js';

const same = (a, b) => a && b && String(a) === String(b);

// Creates a persisted notification. The recipient is always decided by server code, never the client.
// Notifying yourself is skipped. A dedupeKey makes retries idempotent.
export async function notify({ recipientId, actorId = null, type, title, message = '', entityType = null, entityId = null, link = null, dedupeKey }) {
  if (!recipientId || same(recipientId, actorId)) return null;
  try {
    return await Notification.create({ recipientId, actorId, type, title, message: String(message).slice(0, 500), entityType, entityId, link, ...(dedupeKey ? { dedupeKey } : {}) });
  } catch (err) {
    if (err.code === 11000) return null; // duplicate: already notified
    console.error('Failed to create notification', err.message);
    return null; // a notification failure must never break the action that caused it
  }
}

export async function notifyMany(recipientIds, payload) {
  const unique = [...new Set(recipientIds.filter(Boolean).map(String))];
  return Promise.all(unique.map((recipientId) => notify({ ...payload, recipientId, dedupeKey: payload.dedupeKey ? `${payload.dedupeKey}:${recipientId}` : undefined })));
}
