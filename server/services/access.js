import { Project } from '../models/Project.js';
import { AppError } from '../utils/AppError.js';
import { requireId } from '../utils/validate.js';

export const sameId = (a, b) => a && b && String(a._id || a) === String(b._id || b);

export async function accessibleProjects(user, filter = {}) {
  return Project.find({ ...filter, $or: [{ owner: user._id }, { members: user._id }] });
}

export async function accessibleProjectIds(user) {
  const projects = await Project.find({ $or: [{ owner: user._id }, { members: user._id }] }).select('_id');
  return projects.map((p) => p._id);
}

// Returns 404 (not 403) for projects the user cannot see so project existence is not leaked.
export async function loadProject(projectId, user) {
  requireId(projectId, 'project id');
  const project = await Project.findById(projectId);
  const allowed = project && (sameId(project.owner, user._id) || project.members.some((m) => sameId(m, user._id)));
  if (!allowed) throw new AppError(404, 'Project not found');
  return project;
}

export const isOwner = (project, user) => sameId(project.owner, user._id);

export function requireOwner(project, user) {
  if (!isOwner(project, user)) throw new AppError(403, 'Only the project owner can do that');
}

export const startOfToday = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};
