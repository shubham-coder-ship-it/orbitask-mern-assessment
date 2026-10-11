import { PROJECT_STATUSES } from '../utils/constants.js';
import { parseDate, throwIfErrors, str } from '../utils/validate.js';

export function validateProject(body = {}, { partial = false } = {}) {
  const errors = {};
  const out = {};
  if (!partial || body.name !== undefined) {
    const name = str(body.name);
    if (typeof name !== 'string' || name.length < 2 || name.length > 120) errors.name = 'Name must be 2–120 characters';
    else out.name = name;
  }
  if (body.description !== undefined) {
    if (typeof body.description !== 'string' || body.description.length > 2000) errors.description = 'Description is too long';
    else out.description = body.description.trim();
  }
  if (body.status !== undefined) {
    if (!PROJECT_STATUSES.includes(body.status)) errors.status = `Status must be one of: ${PROJECT_STATUSES.join(', ')}`;
    else out.status = body.status;
  }
  const startDate = parseDate(body.startDate, 'startDate', errors);
  const dueDate = parseDate(body.dueDate, 'dueDate', errors);
  if (startDate !== undefined) out.startDate = startDate;
  if (dueDate !== undefined) out.dueDate = dueDate;
  if (out.startDate && out.dueDate && out.dueDate < out.startDate) errors.dueDate = 'Due date cannot be before start date';
  throwIfErrors(errors);
  return out;
}
