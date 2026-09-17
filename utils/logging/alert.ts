import logger from '@/utils/pino';

/**
 * Stable, kebab-case codes for alertable failures. Add a new member here when a
 * failure needs its own monitor; keep codes stable once a monitor points at one.
 */
export type AlertCode =
  | 'account-access-lookup-failure'
  | 'contract-processing-failure'
  | 'contract-relationship-invalid'
  | 'contract-translation-failure'
  | 'contract-translation-quota-exceeded'
  | 'contract-product-credits-write-failure'
  | 'exchange-agreement-products-invalid'
  | 'organization-vendor-settings-load-failure'
  | 'openai-file-processing-failure'
  | 'invoice-segment-context-failure'
  | 'invoice-sync-link-failure'
  | 'sso-callback-failure'
  | 'sso-provision-failure'
  | 'vendor-product-code-conflict'
  | 'product-lineage-fetch-failure'
  | 'contract-replacement-detection-failure'
  | 'contract-replacement-fetch-failure'
  | 'contract-replacement-email-failure'
  | 'contract-cache-invalidation-failure'
  | 'cost-allocation-context-failure'
  | 'lineage-extractor-url-missing'
  | 'login-rate-limit-backend-failure'
  | 'login-ip-lockout-triggered';

/**
 * Emit a canonical alertable log line.
 *
 * Convention: any log a monitor should page on is emitted at `error` level with
 * a top-level `alert` field carrying a stable kebab-case code. Point a monitor
 * at the code instead of matching on free-text messages.
 *
 * Monitor queries:
 * - Datadog:     `status:error @alert:contract-processing-failure`
 * - BetterStack: `level=error AND alert="contract-processing-failure"`
 *
 * Goes through the shared pino instance, so its serializers and sensitive-field
 * sanitization apply automatically. Context IDs (userId/organizationId/etc.)
 * provide correlation — no need for the per-run Inngest logger.
 */
export const logAlert = (
  alert: AlertCode,
  error: unknown,
  context: Record<string, unknown>,
  message: string,
): void => {
  logger.error({ ...context, alert, error }, message);
};
