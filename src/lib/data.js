import { useEffect, useState } from 'react';

const cache = new Map();

export function fetchJson(path) {
  if (!cache.has(path)) {
    const p = fetch(`${import.meta.env.BASE_URL}data/${path}`).then((r) => {
      if (!r.ok) throw new Error(`${path}: ${r.status}`);
      return r.json();
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return cache.get(path);
}

// Returns { data, error, loading } for a JSON file under public/data/.
export function useJson(path) {
  const [state, setState] = useState({ data: null, error: null, loading: !!path });
  useEffect(() => {
    if (!path) return undefined;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchJson(path).then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (error) => alive && setState({ data: null, error, loading: false }),
    );
    return () => { alive = false; };
  }, [path]);
  return state;
}
