'use server';

import { createClient } from '@/utils/supabase/service_server';
import _ from 'lodash';
import logger from '@/utils/pino';
import { logAlert } from '@/utils/logging/alert';
import { mapErrorToCode } from './utils';

type ContractFailureEvent = {
  name?: string;
  data?: { fileName?: string; contractId?: number };
  user?: { id?: string; organizationId?: string };
};

type ContractFailureArgs = {
  error: unknown;
  event: { data: { event: ContractFailureEvent; run_id?: string } };
};

const persistContractFailureMetadata = async ({
  error,
  contractId,
  processName,
  fileName,
}: {
  error: unknown;
  contractId: number | undefined;
  processName: string;
  fileName: string | undefined;
}) => {
  if (!contractId) {
    logger.warn(
      { processName, fileName },
      'No contractId available for failure metadata update',
    );
    return;
  }

  const supabase = createClient();

  try {
    const errorCode = mapErrorToCode(error);

    const { data: existingContract, error: fetchError } = await supabase
      .from('contracts')
      .select('metadata')
      .eq('id', contractId)
      .single();

    if (fetchError) {
      logger.error(
        { error: fetchError, contractId },
        'Failed to fetch existing contract metadata for failure update — persisting failure without existing metadata',
      );
    }

    const existingMetadata = fetchError
      ? {}
      : (existingContract?.metadata as Record<string, unknown>) || {};

    const updatedMetadata = {
      ...existingMetadata,
      failure: {
        occurred_at: new Date().toISOString(),
        stage: processName,
        error: {
          name: error instanceof Error ? error.name : 'UnknownError',
          message: error instanceof Error ? error.message : 'Unknown error',
          code: errorCode,
        },
      },
    };

    const { error: updateError } = await supabase
      .from('contracts')
      .update({ metadata: updatedMetadata })
      .eq('id', contractId);

    if (updateError) {
      logger.error(
        { error: updateError, contractId },
        'Failed to update contract with failure metadata',
      );
    } else {
      logger.info(
        { contractId, errorCode, processName },
        'Contract failure metadata persisted',
      );
    }
  } catch (updateError) {
    logger.error(
      { error: updateError, contractId },
      'Failed to update contract failure metadata',
    );
  }
};

export const handleContractProcessingFailure = async ({
  error,
  event,
}: ContractFailureArgs) => {
  const originalEvent = event.data.event;
  const runId = event.data.run_id;
  const { fileName, contractId } = originalEvent.data ?? {};
  // Replayed events can arrive without a user; keep the alert flowing with
  // whatever actor context is available.
  const { id: userId, organizationId } = originalEvent.user ?? {};
  const processName: string = _.get(originalEvent, 'name', 'Unknown Process');

  await persistContractFailureMetadata({
    error,
    contractId,
    processName,
    fileName,
  });

  logAlert(
    'contract-processing-failure',
    error,
    { processName, contractId, fileName, userId, organizationId, runId },
    'Contract processing failed',
  );
};
