import { useCallback, useEffect, useState } from 'react';
import { api, authDenied } from './api.js';
import { demo } from './demo.js';

const KEYS = ['overview', 'stores', 'orders', 'users', 'studio-projects', 'notifications', 'invitations', 'proofs', 'order-events', 'shipments', 'catalog', 'finance', 'marketing', 'customers', 'conversations', 'influencers', 'affiliates', 'tasks', 'connectors'];

/** Loads all dashboard data in parallel; falls back to demo data when the backend is unreachable. */
export function useAdminData() {
  const [state, setState] = useState({ data: demo, live: false, loading: true, denied: false });
  const reload = useCallback(async () => {
    setState(s => ({ ...s, loading: true }));
    const res = await Promise.all(KEYS.map(k => api('/api/saas/' + k)));
    const d = {}; KEYS.forEach((k, i) => { d[k] = res[i] && !res[i].__error ? res[i] : null; });
    const live = !!(d.overview && d.stores && d.orders && d.finance);
    setState({ data: live ? { ...demo, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== null)) } : demo, live, loading: false, denied: authDenied });
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}
