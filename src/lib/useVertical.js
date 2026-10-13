import { useEffect, useState } from 'react';

const QUERY = '(max-width: 700px)';

// True on phone-sized screens, where pitches are drawn vertically.
export default function useVertical() {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY).matches : false);
  const [v, setV] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia?.(QUERY);
    if (!mq) return undefined;
    const on = () => setV(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return v;
}
