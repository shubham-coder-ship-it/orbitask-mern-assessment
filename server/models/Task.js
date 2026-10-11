import mongoose from 'mongoose';
import { TASK_STATUSES, PRIORITIES } from '../utils/constants.js';

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 2, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 4000, default: '' },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: TASK_STATUSES, default: 'todo' },
    priority: { type: String, enum: PRIORITIES, default: 'medium' },
    startDate: Date,
    dueDate: Date,
    completedAt: Date,
    priorityRank: { type: Number, default: 1 },
  },
  { timestamps: true }
);
taskSchema.index({ projectId: 1, status: 1 });
taskSchema.index({ assignedTo: 1, status: 1 });
taskSchema.index({ dueDate: 1 });

taskSchema.pre('validate', function setRank() {
  this.priorityRank = PRIORITIES.indexOf(this.priority);
});

taskSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    delete ret.priorityRank;
    return ret;
  },
});

export const Task = mongoose.model('Task', taskSchema);
