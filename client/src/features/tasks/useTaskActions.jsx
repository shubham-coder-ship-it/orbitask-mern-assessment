import { useState } from 'react';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApp } from '../../context/AppContext.jsx';

// Shared create/edit/delete/status behaviour for the dashboard, tasks page and project page.
// The buttons shown here are a convenience only — the API enforces the real permissions.
export function useTaskActions() {
  const { user, isAdmin } = useAuth();
  const { toast, refresh, openTaskForm } = useApp();
  const [toDelete, setToDelete] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const canEdit = (t) => isAdmin || t.createdBy === user.id || t.assignedTo === user.id;
  const canManage = (t) => isAdmin || t.createdBy === user.id;

  const edit = (task) => openTaskForm({ task });
  const changeStatus = async (task, status) => {
    setBusyId(task.id);
    try { await api.patch(`/tasks/${task.id}`, { status }); toast('Status updated'); refresh(); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusyId(null); }
  };
  const dialog = toDelete && (
    <ConfirmDialog title="Delete task" message={`Delete “${toDelete.title}”? This cannot be undone.`} onClose={() => setToDelete(null)}
      onConfirm={async () => { await api.del(`/tasks/${toDelete.id}`); toast('Task deleted'); refresh(); }} />
  );
  return { edit, remove: setToDelete, changeStatus, canEdit, canManage, busyId, dialog };
}
