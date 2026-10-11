import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import { api } from '../services/api.js';
import { timeAgo } from '../utils/format.js';

const POLL_MS = 30000;

// Unread count lives in the database; this component only polls it (and refreshes on focus / after actions).
export function useUnreadCount() {
  const [count, setCount] = useState(0);
  const refresh = useCallback(() => api.get('/notifications/unread-count').then((r) => setCount(r.count)).catch(() => {}), []);
  useEffect(() => {
    refresh();
    const t = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, POLL_MS);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('orbitask:notifications', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); window.removeEventListener('orbitask:notifications', onFocus); };
  }, [refresh]);
  return { count, refresh };
}

export const pingNotifications = () => window.dispatchEvent(new Event('orbitask:notifications'));

export function NotificationItem({ n, onOpen }) {
  return (
    <button type="button" className={`notif-item ${n.isRead ? '' : 'unread'}`} onClick={() => onOpen(n)}>
      <span className="notif-dot" aria-hidden="true" />
      <span className="notif-text">
        <span className="notif-title">{n.title}</span>
        <span className="notif-msg">{n.message}</span>
        <span className="notif-time">{timeAgo(n.createdAt)}{n.isRead ? '' : ' · unread'}</span>
      </span>
    </button>
  );
}

export async function openNotification(n, navigate) {
  if (!n.isRead) { try { await api.patch(`/notifications/${n.id}/read`); } catch { /* still navigate */ } pingNotifications(); }
  if (n.link) navigate(n.link);
}

export default function NotificationBell() {
  const { count, refresh } = useUnreadCount();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ items: [], loading: false, error: null });
  const ref = useRef(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try { const r = await api.get('/notifications', { limit: 8 }); setState({ items: r.notifications, loading: false, error: null }); }
    catch (e) { setState({ items: [], loading: false, error: e }); }
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const markAll = async () => { try { await api.post('/notifications/read-all'); await load(); refresh(); } catch (e) { setState((s) => ({ ...s, error: e })); } };
  const go = async (n) => { setOpen(false); await openNotification(n, navigate); refresh(); };

  return (
    <div className="bell" ref={ref}>
      <button className="icon-btn bell-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="true" aria-expanded={open}
        aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}>
        <Icon name="bell" />
        {count > 0 && <span className="bell-badge" aria-hidden="true">{count > 99 ? '99+' : count}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="region" aria-label="Notifications">
          <div className="bell-head"><strong>Notifications</strong><button className="link-btn" onClick={markAll} disabled={count === 0}>Mark all read</button></div>
          <div className="bell-list">
            {state.loading && state.items.length === 0 ? <div className="state small" role="status">Loading…</div>
              : state.error ? <div className="state small" role="alert">Could not load notifications. <button className="link-btn" onClick={load}>Retry</button></div>
              : state.items.length === 0 ? <div className="state small">You’re all caught up.</div>
              : state.items.map((n) => <NotificationItem key={n.id} n={n} onOpen={go} />)}
          </div>
          <div className="bell-foot"><Link to="/notifications" onClick={() => setOpen(false)}>View all notifications</Link></div>
        </div>
      )}
    </div>
  );
}
