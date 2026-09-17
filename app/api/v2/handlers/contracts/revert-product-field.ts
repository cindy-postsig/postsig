import { Context } from 'hono';
import { ValidationError, sanitizeError } from '@/lib/errors';
import { revertProductField } from '@/app/lib/contracts/edit-actions';

export async function revertProductFieldHandler(c: Context) {
  try {
    const contractIdParam = c.req.param('id');
    const contractId = Number(contractIdParam);

    if (Number.isNaN(contractId) || contractId < 1) {
      throw new ValidationError('Invalid contract id');
    }

    const body = await c.req.json();
    const { table, recordId, fieldKey, targetValue } = body;

    if (!table || !recordId || !fieldKey) {
      throw new ValidationError(
        'Missing required fields: table, recordId, fieldKey',
      );
    }

    const result = await revertProductField(
      contractId,
      table,
      recordId,
      fieldKey,
      targetValue,
    );

    return c.json(result);
  } catch (error: unknown) {
    const { message, status } = sanitizeError(error, {
      path: 'revert-product-field',
    });
    return c.json({ error: message }, status as 400 | 401 | 403 | 404 | 500);
  }
}
