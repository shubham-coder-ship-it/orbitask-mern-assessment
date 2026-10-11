import { useState } from 'react';
import Modal from './Modal.jsx';
import Field from './Field.jsx';
import { api } from '../services/api.js';
import { PROJECT_STATUS, toInputDate } from '../utils/format.js';

export default function ProjectForm({ project, onClose, onSaved }) {
  const editing = Boolean(project);
  const [form, setForm] = useState({
    name: project?.name || '', description: project?.description || '', status: project?.status || 'active',
    startDate: toInputDate(project?.startDate), dueDate: toInputDate(project?.dueDate),
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const err = {};
    if (form.name.trim().length < 2) err.name = 'Name must be at least 2 characters';
    if (form.startDate && form.dueDate && form.dueDate < form.startDate) err.dueDate = 'Due date cannot be before the start date';
    setErrors(err);
    if (Object.keys(err).length) return;
    setSaving(true);
    setFormError('');
    const body = { name: form.name.trim(), description: form.description, status: form.status, startDate: form.startDate || null, dueDate: form.dueDate || null };
    try {
      const res = editing ? await api.patch(`/projects/${project.id}`, body) : await api.post('/projects', body);
      onSaved(res.project, editing);
      onClose();
    } catch (ex) {
      setErrors(ex.details || {});
      setFormError(ex.message);
      setSaving(false);
    }
  };

  return (
    <Modal title={editing ? 'Edit project' : 'New project'} onClose={onClose} footer={<>
      <button type="button" className="btn" onClick={onClose} disabled={saving}>Cancel</button>
      <button type="submit" form="project-form" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Project'}</button>
    </>}>
      {formError && <div className="alert error" role="alert">{formError}</div>}
      <form id="project-form" onSubmit={submit} noValidate>
        <Field label="Project name" required error={errors.name}>{(p) => <input className="input" {...p} value={form.name} onChange={set('name')} maxLength={120} />}</Field>
        <Field label="Description" error={errors.description}>{(p) => <textarea className="textarea" {...p} value={form.description} onChange={set('description')} />}</Field>
        <Field label="Status" error={errors.status}>{(p) => <select className="select" {...p} value={form.status} onChange={set('status')}>{PROJECT_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>}</Field>
        <div className="form-row">
          <Field label="Start date" error={errors.startDate}>{(p) => <input type="date" className="input" {...p} value={form.startDate} onChange={set('startDate')} />}</Field>
          <Field label="Due date" error={errors.dueDate}>{(p) => <input type="date" className="input" {...p} value={form.dueDate} onChange={set('dueDate')} />}</Field>
        </div>
      </form>
    </Modal>
  );
}
