import { useCallback, useEffect, useState } from 'react';
import { platform } from '../api/client';

export default function useSummary(healthId) {
  const [state, setState] = useState({ loading: true });
  const load = useCallback(() => {
    setState({ loading: true });
    platform.get(`/patients/${healthId}/summary`)
      .then((r) => setState({ data: r.data }))
      .catch((err) => {
        const c = err.response?.status;
        setState({
          error: c === 403 ? err.response.data?.message || 'Access denied.'
            : c === 404 ? 'No record found for this ID.' : 'Could not load the record.',
          retry: !(c === 403 || c === 404),
        });
      });
  }, [healthId]);
  useEffect(() => { load(); }, [load]);
  // refresh: fetch again WITHOUT the "Loading..." state, so a panel the user is working in keeps its place
  const refresh = useCallback(() => platform.get(`/patients/${healthId}/summary`).then((r) => setState({ data: r.data })).catch(() => {}), [healthId]);
  return { ...state, reload: load, refresh };
}
