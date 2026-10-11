import mongoose from 'mongoose';

// accepted = the mail server took the message. We cannot know about final delivery or bounces
// without provider webhooks, so "delivered" is deliberately not a status here.
const schema = new mongoose.Schema(
  {
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipientIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    audience: { type: String, enum: ['users', 'project', 'workspace'], default: 'users' },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    status: { type: String, enum: ['queued', 'accepted', 'partial', 'failed'], default: 'queued' },
    results: [{ _id: false, userId: mongoose.Schema.Types.ObjectId, ok: Boolean, providerMessageId: String, error: String }],
    error: String,
  },
  { timestamps: true }
);
schema.index({ senderId: 1, createdAt: -1 });
schema.set('toJSON', {
  transform: (_d, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});
export const EmailRecord = mongoose.model('EmailRecord', schema);
