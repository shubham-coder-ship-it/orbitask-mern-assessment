import { TASK_STATUSES, PRIORITIES } from '../utils/constants.js';
import { parseDate, throwIfErrors, str, isValidId } from '../utils/validate.js';

export function validateTask(body = {}, { partial = false } = {}) {
  const errors = {};
  const out = {};
  if (!partial || body.title !== undefined) {
    const title = str(body.title);
    if (typeof title !== 'string' || title.length < 2 || title.length > 160) errors.title = 'Title must be 2–160 characters';
    else out.title = title;
  }
  if (!partial) {
    if (!isValidId(body.projectId)) errors.projectId = 'A valid project is required';
    else out.projectId = body.projectId;
  } else if (body.projectId !== undefined) {
    errors.projectId = 'A task cannot be moved to another project';
  }
  if (body.description !== undefined) {
    if (typeof body.description !== 'string' || body.description.length > 4000) errors.description = 'Description is too long';
    else out.description = body.description.trim();
  }
  if (body.status !== undefined) {
    if (!TASK_STATUSES.includes(body.status)) errors.status = `Status must be one of: ${TASK_STATUSES.join(', ')}`;
    else out.status = body.status;
  }
  if (body.priority !== undefined) {
    if (!PRIORITIES.includes(body.priority)) errors.priority = `Priority must be one of: ${PRIORITIES.join(', ')}`;
    else out.priority = body.priority;
  }
  if (body.assignedTo !== undefined) {
    if (body.assignedTo === null || body.assignedTo === '') out.assignedTo = null;
    else if (!isValidId(body.assignedTo)) errors.assignedTo = 'Invalid assignee';
    else out.assignedTo = body.assignedTo;
  }
  const startDate = parseDate(body.startDate, 'startDate', errors);
  const dueDate = parseDate(body.dueDate, 'dueDate', errors);
  if (startDate !== undefined) out.startDate = startDate;
  if (dueDate !== undefined) out.dueDate = dueDate;
  if (out.startDate && out.dueDate && out.dueDate < out.startDate) errors.dueDate = 'Due date cannot be before start date';
  throwIfErrors(errors);
  return out;
}
