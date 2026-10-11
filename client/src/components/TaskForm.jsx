import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import Field from './Field.jsx';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { PRIORITY, STATUS, toInputDate } from '../utils/format.js';

export default function TaskForm({ task, defaults = {}, onClose, onSaved }) {
  const { user } = useAuth();
  const editing = Boolean(task);
  const [projects, setProjects] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    projectId: task?.projectId || defaults.projectId || '',
    assignedTo: task?.assignedTo || '',
    status: task?.status || 'todo',
    priority: task?.priority || 'medium',
    startDate: toInputDate(task?.startDate),
    dueDate: toInputDate(task?.dueDate),
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/projects').then((r) => {
      const open = r.projects.filter((p) => p.status !== 'archived' || p.id === task?.projectId);
      setProjects(open);
      setForm((f) => (f.projectId || open.length !== 1 ? f : { ...f, projectId: open[0].id }));
    }).catch((e) => setLoadError(e.message));
  }, [task?.projectId]);

  const project = useMemo(() => projects?.find((p) => p.id === form.projectId), [projects, form.projectId]);
  const isOwner = project?.owner?.id === user.id;
  // Only the project owner may assign to others; members can only take a task themselves.
  const assignees = !project ? [] : isOwner ? project.members : project.members.filter((m) => m.id === user.id);

  const set = (key) => (e) => setForm((f) => {
    const next = { ...f, [key]: e.target.value };
    if (key === 'projectId') next.assignedTo = '';
    return next;
  });

  const validate = () => {
    const err = {};
    if (form.title.trim().length < 2) err.title = 'Title must be at least 2 characters';
    if (!form.projectId) err.projectId = 'Choose a project';
    if (form.startDate && form.dueDate && form.dueDate < form.startDate) err.dueDate = 'Due date cannot be before the start date';
    return err;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const err = validate();
    setErrors(err);
    setFormError('');
    if (Object.keys(err).length) return;
    setSaving(true);
    const body = {
      title: form.title.trim(), description: form.description, status: form.status, priority: form.priority,
      assignedTo: form.assignedTo || null, startDate: form.startDate || null, dueDate: form.dueDate || null,
    };
    try {
      const res = editing ? await api.patch(`/tasks/${task.id}`, body) : await api.post('/tasks', { ...body, projectId: form.projectId });
      onSaved(res.task, editing);
      onClose();
    } catch (ex) {
      setErrors(ex.details || {});
      setFormError(ex.message);
      setSaving(false);
    }
  };

  return (
    <Modal title={editing ? 'Edit task' : 'New task'} onClose={onClose} footer={<>
      <button type="button" className="btn" onClick={onClose} disabled={saving}>Cancel</button>
      <button type="submit" form="task-form" className="btn btn-primary" disabled={saving || !projects}>{saving ? 'Saving…' : 'Save Task'}</button>
    </>}>
      {loadError && <div className="alert error" role="alert">{loadError}</div>}
      {formError && <div className="alert error" role="alert">{formError}</div>}
      {projects && projects.length === 0 && <div className="alert error">You need to belong to a project before creating tasks.</div>}
      <form id="task-form" onSubmit={submit} noValidate>
        <Field label="Title" required error={errors.title}>{(p) => <input className="input" {...p} value={form.title} onChange={set('title')} maxLength={160} />}</Field>
        <Field label="Description" error={errors.description}>{(p) => <textarea className="textarea" {...p} value={form.description} onChange={set('description')} />}</Field>
        <div className="form-row">
          <Field label="Project" required error={errors.projectId}>{(p) => (
            <select className="select" {...p} value={form.projectId} onChange={set('projectId')} disabled={editing}>
              <option value="">Select a project…</option>
              {projects?.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
            </select>)}
          </Field>
          <Field label="Assignee" error={errors.assignedTo}>{(p) => (
            <select className="select" {...p} value={form.assignedTo} onChange={set('assignedTo')} disabled={!form.projectId}>
              <option value="">Unassigned</option>
              {assignees.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>)}
          </Field>
        </div>
        <div className="form-row">
          <Field label="Status" error={errors.status}>{(p) => <select className="select" {...p} value={form.status} onChange={set('status')}>{STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>}</Field>
          <Field label="Priority" error={errors.priority}>{(p) => <select className="select" {...p} value={form.priority} onChange={set('priority')}>{PRIORITY.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>}</Field>
        </div>
        <div className="form-row">
          <Field label="Start date" error={errors.startDate}>{(p) => <input type="date" className="input" {...p} value={form.startDate} onChange={set('startDate')} />}</Field>
          <Field label="Due date" error={errors.dueDate}>{(p) => <input type="date" className="input" {...p} value={form.dueDate} onChange={set('dueDate')} />}</Field>
        </div>
      </form>
    </Modal>
  );
}
