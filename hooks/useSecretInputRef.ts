import { useEffect, useRef } from 'react';

/**
 * Binds an input to a React-held string without rendering it as a `value`
 * prop.
 */
export function useSecretInputRef(value: string) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = ref.current;
    if (input && input.value !== value) {
      input.value = value;
    }
  }, [value]);

  return ref;
}
