import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Icon, { LogoMark } from '../components/Icon.jsx';
import { Avatar } from '../components/Badges.jsx';
import NotificationBell from '../components/NotificationBell.jsx';
import TaskForm from '../components/TaskForm.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useApp } from '../context/AppContext.jsx';

const NAV = [
  { group: 'WORKSPACE', items: [
    { to: '/dashboard', label: 'Overview', icon: 'overview' },
    { to: '/projects', label: 'Projects', icon: 'projects' },
    { to: '/tasks', label: 'My Tasks', icon: 'tasks' },
    { to: '/team', label: 'Team', icon: 'team' },
    { to: '/requests', label: 'Invitations', icon: 'inbox' },
    { to: '/messages', label: 'Messages', icon: 'mail' },
  ] },
  { group: 'INSIGHTS', items: [{ to: '/analytics', label: 'Analytics', icon: 'analytics' }] },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { toasts, toast, taskModal, closeTaskForm, refresh, openTaskForm } = useApp();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');

  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => { if (location.pathname !== '/tasks') setQ(''); }, [location.pathname]);

  const onSearch = (e) => {
    e.preventDefault();
    navigate(q.trim() ? `/tasks?q=${encodeURIComponent(q.trim())}` : '/tasks');
  };

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Primary">
        <div className="brand"><LogoMark /><span>Orbitask</span></div>
        <nav className="nav">
          {NAV.map((g) => (
            <div key={g.group}>
              <div className="nav-group">{g.group}</div>
              {g.items.map((i) => (
                <NavLink key={i.to} to={i.to} title={i.label}><Icon name={i.icon} /><span>{i.label}</span></NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-user">
          <NavLink to="/profile" className="who" title="Profile">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar name={user.name} />
              <div style={{ minWidth: 0 }}><div className="name">{user.name}</div><div className="role">{user.role}</div></div>
            </div>
          </NavLink>
          <button className="icon-btn" onClick={logout} aria-label="Log out" title="Log out"><Icon name="logout" /></button>
        </div>
      </aside>
      <div className={`scrim ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Open navigation"><Icon name="menu" /></button>
          <form className="search" role="search" onSubmit={onSearch}>
            <Icon name="search" size={16} />
            <label className="sr-only" htmlFor="global-search">Search tasks</label>
            <input id="global-search" type="search" placeholder="Search tasks…" value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
          <div className="spacer" />
          <NotificationBell />
          <button className={`btn btn-primary ${['/dashboard', '/tasks'].includes(location.pathname) ? 'on-page-head' : ''}`} onClick={() => openTaskForm()}><Icon name="plus" size={16} /><span>New Task</span></button>
        </header>
        <main className="page"><Outlet /></main>
      </div>
      {taskModal && (
        <TaskForm task={taskModal.task} defaults={taskModal.defaults} onClose={closeTaskForm}
          onSaved={(t, editing) => { toast(editing ? 'Task updated' : 'Task created'); refresh(); taskModal.onSaved?.(t); }} />
      )}
      <div className="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>)}</div>
    </div>
  );
}
