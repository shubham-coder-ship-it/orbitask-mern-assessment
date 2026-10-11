import { createContext, useCallback, useContext, useMemo, useState } from 'react';

// Toasts + a data "version" so any page re-fetches after a create/update/delete anywhere in the app.
const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

export function AppProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [version, setVersion] = useState(0);
  const [taskModal, setTaskModal] = useState(null); // { task?, defaults? }

  const toast = useCallback((message, type = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const openTaskForm = useCallback((opts = {}) => setTaskModal(opts), []);
  const closeTaskForm = useCallback(() => setTaskModal(null), []);

  const value = useMemo(() => ({ toasts, toast, version, refresh, taskModal, openTaskForm, closeTaskForm }), [toasts, toast, version, refresh, taskModal, openTaskForm, closeTaskForm]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
