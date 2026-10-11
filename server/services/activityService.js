import { Activity } from '../models/Activity.js';

export async function logActivity({ actorId, projectId, taskId, action, metadata = {} }) {
  try {
    await Activity.create({ actorId, projectId, taskId, action, metadata });
  } catch (err) {
    console.error('Failed to record activity', err.message);
  }
}
