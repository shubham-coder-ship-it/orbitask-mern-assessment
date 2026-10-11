import { User } from '../models/User.js';
import { Project } from '../models/Project.js';
import { getSettings } from '../models/WorkspaceSettings.js';
import { sameId } from './access.js';

const projectPeople = (p) => [p.owner, ...p.members].map(String);

// Single source of truth for "who may this user email?". Used by the recipient list AND by the send endpoint,
// so the UI and the API can never disagree.
export async function emailScope(sender) {
  const settings = await getSettings();
  const memberToMember = Boolean(settings.allowMemberToMemberEmail);
  const projects = await Project.find({ $or: [{ owner: sender._id }, { members: sender._id }] }).select('name owner members');
  const isAdmin = sender.role === 'admin';
  const everyone = await User.find({ deletedAt: null, _id: { $ne: sender._id } }).select('name role');
  const byId = new Map(everyone.map((u) => [String(u._id), u]));

  const allowed = new Map();
  if (isAdmin) {
    everyone.forEach((u) => allowed.set(String(u._id), u)); // workspace-level permission: admins
  } else {
    everyone.filter((u) => u.role === 'admin').forEach((u) => allowed.set(String(u._id), u)); // members may always reach admins
    projects.forEach((p) => allowed.set(String(p.owner), byId.get(String(p.owner))));          // ...and the owners of their projects
    if (memberToMember) projects.forEach((p) => projectPeople(p).forEach((id) => byId.has(id) && allowed.set(id, byId.get(id))));
  }
  allowed.delete(String(sender._id));
  for (const [k, v] of allowed) if (!v) allowed.delete(k);

  const teamsAllowed = projects.filter(() => isAdmin || memberToMember);
  return { isAdmin, memberToMember, allowed, projects, teamsAllowed, byId };
}

export const teamRecipients = (project, sender, byId) => projectPeople(project).filter((id, i, a) => a.indexOf(id) === i && !sameId(id, sender._id) && byId.has(id));
