import { Context } from 'hono';
import { ValidationError, sanitizeError } from '@/lib/errors';
import { revertContractField } from '@/app/lib/contracts/edit-actions';

export async function revertContractFieldHandler(c: Context) {
  try {
    const contractIdParam = c.req.param('id');
    const contractId = Number(contractIdParam);

    if (Number.isNaN(contractId) || contractId < 1) {
      throw new ValidationError('Invalid contract id');
    }

    const body = await c.req.json();
    const fieldKey = body.fieldKey as string;
    const targetValue = body.targetValue as string | null;

    if (!fieldKey) {
      throw new ValidationError('Missing fieldKey');
    }

    const result = await revertContractField(contractId, fieldKey, targetValue);

    return c.json(result);
  } catch (error: unknown) {
    const { message, status } = sanitizeError(error, { path: 'revert-field' });
    return c.json({ error: message }, status as 400 | 401 | 403 | 404 | 500);
  }
}
