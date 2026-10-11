import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    type: { type: String, required: true },
    title: { type: String, required: true, maxlength: 160 },
    message: { type: String, default: '', maxlength: 500 },
    entityType: { type: String, enum: ['task', 'project', 'invitation', 'user', 'email', null], default: null },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    link: { type: String, default: null }, // in-app route, decided by the server only
    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
    dedupeKey: { type: String }, // unique when present: stops duplicates from retried requests
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });
notificationSchema.set('toJSON', {
  transform: (_d, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    delete ret.dedupeKey;
    return ret;
  },
});

export const Notification = mongoose.model('Notification', notificationSchema);
