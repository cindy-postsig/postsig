'use server';

import { inngest } from '@/utils/inngest/client';
import { ProcessType, ModelProvider } from '@/constants/types';
import { getHash } from '@/app/lib/utils';

export async function getContractBasics(
  contractId: number,
  fileId: string,
  eventName: string,
) {
  try {
    await inngest.send({
      name: eventName,
      data: {
        fileId,
        contractId,
      },
    });
  } catch (error) {
    console.error('Error getting contract basics:', contractId);
    throw error;
  }
}

type ContractSpecifics = {
  columns: string[];
  contractId: number;
  fileId: string;
  eventName: string;
  userId: string;
};

export async function getContractSpecifics({
  columns,
  contractId,
  fileId,
  eventName,
  userId,
}: ContractSpecifics) {
  try {
    await inngest.send({
      name: eventName,
      data: {
        fileId,
        contractId,
        columns,
        userId,
      },
    });
  } catch (error) {
    console.error('Error getting contract specifics:', contractId);
    throw error;
  }
}

type UploadFileData = {
  fileName: string;
  processType: ProcessType;
  modelProvider: ModelProvider;
};

export async function uploadFile(
  fileName: string,
  userId: string,
  organizationId: string,
  modelProvider: ModelProvider = ModelProvider.openai,
  processType: ProcessType = ProcessType.New,
) {
  try {
    const timestamp = new Date().toISOString();
    const hash = getHash(
      `${userId}-${organizationId}-${fileName}-${modelProvider}-${processType}-${timestamp}`,
    );
    await inngest.send({
      id: `contracts-process-${hash}`,
      name: `contracts/processcontract`,
      data: {
        fileName,
        processType,
        modelProvider,
      } as UploadFileData,
      user: {
        id: userId,
        organizationId,
      },
    });
  } catch (error: any) {
    console.error('uploadFile: Error uploading file to ai', error.stack);
    throw error;
  }
}
