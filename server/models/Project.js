import mongoose from 'mongoose';
import { PROJECT_STATUSES } from '../utils/constants.js';

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    status: { type: String, enum: PROJECT_STATUSES, default: 'active' },
    startDate: Date,
    dueDate: Date,
  },
  { timestamps: true }
);
projectSchema.index({ members: 1 });
projectSchema.index({ owner: 1 });

projectSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Project = mongoose.model('Project', projectSchema);
