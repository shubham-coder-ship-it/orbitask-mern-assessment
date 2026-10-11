import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, required: true },
  from: String,
  to: String,
  timestamp: { type: Date, default: Date.now },
});
schema.index({ timestamp: -1 });
schema.set('toJSON', {
  transform: (_d, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});
export const AuditLog = mongoose.model('AuditLog', schema);
