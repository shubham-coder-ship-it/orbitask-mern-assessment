import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NotificationItem, openNotification, pingNotifications } from '../components/NotificationBell.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/States.jsx';
import { api } from '../services/api.js';

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (reset = true, before = null) => {
    if (reset) setLoading(true); else setMore(true);
    setError(null);
    try {
      const r = await api.get('/notifications', { limit: 15, unread: filter === 'unread' ? 'true' : undefined, before });
      setItems((cur) => (reset ? r.notifications : [...cur, ...r.notifications]));
      setHasMore(r.hasMore); setCursor(r.nextCursor);
    } catch (e) { setError(e); } finally { setLoading(false); setMore(false); }
  }, [filter]);

  useEffect(() => { load(true); }, [load]);

  const markAll = async () => { try { await api.post('/notifications/read-all'); pingNotifications(); load(true); } catch (e) { setError(e); } };
  const open = async (n) => {
    await openNotification(n, navigate);
    setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Notifications</h1><p>Updates about your projects, tasks, invitations and account.</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="select" style={{ width: 140 }} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter notifications">
            <option value="all">All</option><option value="unread">Unread only</option>
          </select>
          <button className="btn" onClick={markAll}>Mark all read</button>
        </div>
      </div>
      <div className="card">
        {loading ? <LoadingState /> : error && items.length === 0 ? <ErrorState error={error} onRetry={() => load(true)} />
          : items.length === 0 ? <EmptyState title={filter === 'unread' ? 'No unread notifications' : 'No notifications yet'} text="New activity will show up here." />
          : (
            <>
              <div className="notif-page-list">{items.map((n) => <NotificationItem key={n.id} n={n} onOpen={open} />)}</div>
              {error && <div className="alert error" role="alert" style={{ margin: 14 }}>{error.message}</div>}
              {hasMore && <div style={{ padding: 14, textAlign: 'center' }}><button className="btn" disabled={more} onClick={() => load(false, cursor)}>{more ? 'Loading…' : 'Load more'}</button></div>}
            </>
          )}
      </div>
    </>
  );
}
