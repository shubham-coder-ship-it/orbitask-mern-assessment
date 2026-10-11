import mongoose from 'mongoose';

// One collection for both directions: type "invite" (owner -> user) and "request" (user -> owner).
// invite statuses: pending | accepted | declined | cancelled | expired
// request statuses: pending | approved | rejected | cancelled
const invitationSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // invitee or requester
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    type: { type: String, enum: ['invite', 'request'], required: true },
    status: { type: String, enum: ['pending', 'accepted', 'declined', 'approved', 'rejected', 'cancelled', 'expired'], default: 'pending' },
    expiresAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Present ONLY while pending. The unique sparse index makes duplicate pending rows impossible
    // even if two identical requests arrive at the same moment.
    pendingKey: { type: String },
  },
  { timestamps: true }
);
invitationSchema.index({ pendingKey: 1 }, { unique: true, sparse: true });
invitationSchema.index({ userId: 1, status: 1 });
invitationSchema.index({ projectId: 1, status: 1 });
invitationSchema.set('toJSON', {
  transform: (_d, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    delete ret.pendingKey;
    return ret;
  },
});

export const Invitation = mongoose.model('Invitation', invitationSchema);
