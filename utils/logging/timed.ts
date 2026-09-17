import logger from '@/utils/pino';

/**
 * Run an async data call and emit a structured debug line with its duration.
 *
 * Labels are `page.call` (e.g. `contracts.getContractsList`), so the log can
 * be filtered per page. `context` carries the inputs that size the work
 * (query kind, window) so one label's durations can be compared like for
 * like. Emitted at `debug`: visible under `npm run dev`, and elsewhere only
 * when `LOG_LEVEL=debug` is set.
 */
export const timed = async <T>(
  label: string,
  fn: () => Promise<T>,
  context: Record<string, unknown> = {},
): Promise<T> => {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    logger.debug(
      {
        ...context,
        event: 'timing',
        label,
        durationMs: Math.round(performance.now() - start),
      },
      label,
    );
  }
};
