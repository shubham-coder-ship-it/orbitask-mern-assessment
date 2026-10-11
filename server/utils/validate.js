import mongoose from 'mongoose';
import { AppError } from './AppError.js';

export const isValidId = (id) => mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === String(id);

export function requireId(id, label = 'id') {
  if (!isValidId(id)) throw new AppError(400, `Invalid ${label}`);
  return id;
}

export function parseDate(value, field, errors) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    errors[field] = 'Must be a valid date';
    return undefined;
  }
  return d;
}

export function throwIfErrors(errors) {
  if (Object.keys(errors).length) throw new AppError(422, 'Validation failed', errors);
}

export const str = (v) => (typeof v === 'string' ? v.trim() : v);
