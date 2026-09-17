import { useEffect } from 'react';

export function useWarnBeforeUnload(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const handler = (e: BeforeUnloadEvent) => {
      // preventDefault is enough for Chrome 119+, but Firefox and Safari
      // still require returnValue to be set (any non-empty string works;
      // browsers ignore the actual value and show their own message).
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [active]);
}
