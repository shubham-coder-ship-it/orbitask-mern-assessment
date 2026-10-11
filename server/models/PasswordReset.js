import mongoose from 'mongoose';

// Only a SHA-256 hash of the emailed token is stored, never the token itself.
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 }); // clean up a day after expiry
export const PasswordReset = mongoose.model('PasswordReset', schema);
