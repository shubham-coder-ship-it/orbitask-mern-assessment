import { WorkspaceSettings, getSettings } from '../models/WorkspaceSettings.js';
import { AppError, asyncHandler } from '../utils/AppError.js';

export const getWorkspaceSettings = asyncHandler(async (_req, res) => {
  const s = await getSettings();
  res.json({ settings: { allowMemberToMemberEmail: Boolean(s.allowMemberToMemberEmail) } });
});

export const updateWorkspaceSettings = asyncHandler(async (req, res) => {
  const v = req.body?.allowMemberToMemberEmail;
  if (typeof v !== 'boolean') throw new AppError(422, 'Validation failed', { allowMemberToMemberEmail: 'Must be true or false' });
  const s = await WorkspaceSettings.findOneAndUpdate({ key: 'workspace' }, { $set: { allowMemberToMemberEmail: v, updatedBy: req.user._id } }, { returnDocument: 'after', upsert: true });
  res.json({ settings: { allowMemberToMemberEmail: s.allowMemberToMemberEmail } });
});
