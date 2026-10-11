import mongoose from 'mongoose';

// Single-workspace app: one settings document, key "workspace".
const schema = new mongoose.Schema(
  {
    key: { type: String, default: 'workspace', unique: true },
    allowMemberToMemberEmail: { type: Boolean, default: false },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);
export const WorkspaceSettings = mongoose.model('WorkspaceSettings', schema);

export async function getSettings() {
  return (await WorkspaceSettings.findOne({ key: 'workspace' })) || { allowMemberToMemberEmail: false };
}
