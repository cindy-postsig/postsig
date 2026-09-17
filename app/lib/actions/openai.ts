'use server';

import OpenAI, { toFile } from 'openai';
import fs from 'fs';
import logger from '@/utils/pino';
const openai = new OpenAI();
import { createClient } from '@/utils/supabase/service_server';
import { buildSafePath, PathTraversalError } from '@/utils/helpers';
import {
  AIExtractionStatus,
  generalAssistantInstructions,
  ContractBasicsResponse,
} from '@/app/lib/constants';
import _ from 'lodash';
import { uploadFileToOpenAi } from '@/app/lib/service';
import { getContractBasicsWithGoogle } from '@/lib/google';
import { ModelProvider } from '@/constants/types';
import { sanitizeOrderNumber } from '@/lib/v2/contracts/orderNumber';
import {
  baseQueries,
  dateQueries,
  otherQueries,
  allQueries,
  additionalQueries,
} from '@/constants/prompts';
import {
  calculateVendorSimilarity,
  removeKnownSuffixes as globalRemoveKnownSuffixes,
} from '@/app/lib/utils';
import { venderStatuses } from '@/constants/data';
import { Database } from '@/database.types';
import { createPromptResolver } from '@/app/lib/prompt-resolver';
import { MODULE_IDS } from '@/lib/settings/config';
type VendorStatus = Database['public']['Enums']['VendorStatus'];

function cleanUpJsonFields(json: any) {
  const cleanedJson = _.mapValues(json, (value) => {
    if (value === '' || (Array.isArray(value) && value.length === 0)) {
      return null;
    }
    return value;
  });
  return cleanedJson;
}

function formatBaseQueriesToMarkdown(baseQueries: any) {
  const formattedQueries = baseQueries
    .map(
      ({ dbName, query }: { dbName: string; query: string }, index: number) =>
        `<key><fieldName>${dbName}</fieldName><fieldDescription>${query}</fieldDescription></key>`,
    )
    .join('\n\n');
  return formattedQueries;
}

function cleanResponseText(responseText: string) {
  return responseText.replace(/【.*?】/g, '');
}

export async function getFileList() {
  const fileList = await openai.files.list();
  const fileArray = fileList.data;
  logger.info(
    { fileCount: fileArray.length },
    'Num files on open ai server: ' + fileArray.length,
  );
}

export async function uploadOpenAiFile(fileName: string) {
  const segments = fileName.split('/').filter(Boolean);
  let safePath: string;
  try {
    safePath = buildSafePath(segments);
  } catch (error) {
    if (error instanceof PathTraversalError) {
      throw new Error('Invalid file name');
    }
    throw error;
  }
  const file = await openai.files.create({
    file: fs.createReadStream(safePath),
    purpose: 'assistants',
  });
  return file;
}

const blobToFile = (blob: Blob, fileName: string): File => {
  return new File([blob], fileName, { type: blob.type });
};

export async function uploadOpenAiFileBuffer(fileToUpload: any, fileName: any) {
  const file = await openai.files.create({
    file: await toFile(fileToUpload, fileName),
    purpose: 'assistants',
  });
  return file;
}

export async function getFile(fileIdIn: string) {
  try {
    logger.debug({ fileId: fileIdIn }, 'File to retrieve: ' + fileIdIn);
    const fileRet = await openai.files.retrieve(fileIdIn);
    logger.debug({ fileRet }, 'File retrieved');
    return fileRet;
  } catch (error: any) {
    logger.error({ error: error.error }, 'Error from get file');
    return 'ERROR';
  }
}
export async function deleteFile(fileId: string) {
  try {
    const fileIdToDelete = fileId;
    logger.debug(
      { fileId: fileIdToDelete },
      'File ID to delete: ' + fileIdToDelete,
    );

    const fileDel = await openai.files.del(fileIdToDelete);
    logger.debug({ fileDel }, '\nDeleted file');
    return fileDel;
  } catch (error: any) {
    logger.error({ error: error.error }, 'Error from delete file');
    return 'ERROR';
  }
}
export async function removeDups() {
  var numFiles = 0;
  var numDups = 0;
  var trackDups: any = [];
  let fileList = await openai.files.list();
  let fileArray = fileList.data;
  logger.info(
    { fileCount: fileArray.length },
    'Num files before: ' + fileArray.length + '\n',
  );
  try {
    for await (const file of fileArray) {
      numFiles++;
      if (trackDups.find((dupFile: any) => dupFile == file.filename)) {
        numDups++;
        const fileDel = await openai.files.del(file.id);
        logger.debug({ fileDel }, 'Deleted file');
      } else {
        trackDups.push(file.filename);
      }
    }
    fileList = await openai.files.list();
    fileArray = fileList.data;
    logger.info(
      { fileCount: fileArray.length },
      'Num files after cleanup: ' + fileArray.length,
    );
    logger.info({ numDups }, 'Num dups: ' + numDups);
    logger.info(
      { uniqueCount: trackDups.length },
      'Num unique: ' + trackDups.length,
    );
  } catch (error: any) {
    logger.error({ error: error.error }, 'Error from duplicate file clean up');
    return 'ERROR';
  }
}

async function createAssistant(fileID: string) {
  // @ts-ignore - OpenAI SDK type definition issue with vectorStores
  const vectorStores = openai.beta?.vectorStores ?? openai.vectorStores;
  const vectorStore = await vectorStores.create({
    name: 'Contract Details',
    file_ids: [fileID],
    expires_after: {
      anchor: 'last_active_at',
      days: 1,
    },
  });
  const assistant = await openai.beta.assistants.create({
    instructions: generalAssistantInstructions,
    model: 'gpt-4o',
    tools: [
      {
        type: 'file_search',
      },
    ],
    tool_resources: {
      file_search: {
        vector_store_ids: [vectorStore.id],
      },
    },
    temperature: 0.2,
    top_p: 0.25,
    response_format: {
      type: 'text',
    },
    metadata: {
      file_id: fileID,
    },
  });

  return assistant;
}

async function removeAssistant(assistant: any) {
  await openai.beta.assistants.del(assistant.id);
}

async function addMessageToThread(thread: any, query: any) {
  const threadMessage = await openai.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: [
      {
        type: 'text',
        text: query,
      },
    ],
  });
  return threadMessage.id;
}

async function runThread(assistant: any, thread: any) {
  while (true) {
    try {
      let run = await openai.beta.threads.runs.create(thread.id, {
        assistant_id: assistant.id,
        additional_instructions: null,
        tool_choice: null,
      });

      while (['queued', 'in_progress', 'cancelling'].includes(run.status)) {
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for 2 seconds
        run = await openai.beta.threads.runs.retrieve(run.thread_id, run.id);
      }

      if (run.status === 'completed') {
        const messages = await openai.beta.threads.messages.list(run.thread_id);
        for (const message of messages.data.reverse()) {
          var messageBack = {
            usage: run.usage,
            // @ts-ignore
            text: message.content[0].text.value,
          };
          // console.log(`${message.role} > ` + messageBack.text);

          if (message.role == 'assistant') {
            try {
              messageBack.text = cleanResponseText(messageBack.text);
              return messageBack;
            } catch (error) {
              throw error;
            }
          }
        }
      } else {
        throw new Error('Run did not complete: ' + run.status);
      }
      break;
    } catch (error) {
      throw error;
    }
  }
}

export async function saveToDb(response: any, contractId: number) {
  const supabase = createClient();
  if (!response) {
    await saveAiExtractionStatus('ai_failed', contractId);
    return { body: 'No response' };
  }
  const fields: any = {
    ai_extraction: response,
    ai_extraction_status: 'ai_success',
  };
  // calculate doc sign status and execution date
  if (response?.all_parties_signed === 'Yes') {
    fields.doc_fully_executed = true;
    if (response?.date_of_last_signature) {
      fields.execution_date = new Date(response.date_of_last_signature);
    }
  } else {
    fields.doc_fully_executed = false;
    fields.execution_date = null;
  }
  const { data, error } = await supabase
    .from('contracts')
    // @ts-ignore - Supabase service client type inference issue
    .update(fields)
    .eq('id', contractId);
  return data || error || {};
}

// Fills order_number only when empty, so this AI re-extraction can never
// overwrite a manually-entered value.
export async function setContractOrderNumber(
  contractId: number,
  orderNumber: string | null,
) {
  const supabase = createClient();
  const { error } = await supabase.rpc('set_contract_order_number', {
    p_contract_id: contractId,
    // @ts-ignore - generated type omits null even though this param accepts it
    p_order_number: sanitizeOrderNumber(orderNumber),
    p_only_if_empty: true,
  });
  if (error) throw error;
}

// Merges into whatever contracts.metadata.lineage already exists in a single
// atomic statement, so writing the rest of the lineage extraction can never
// wipe out order_number (or any other key this patch omits) as a side effect —
// see set_contract_order_number, which owns order_number specifically.
export async function mergeContractLineage(
  contractId: number,
  lineagePatch: Record<string, unknown>,
) {
  const supabase = createClient();
  const { error } = await supabase.rpc('merge_contract_lineage', {
    p_contract_id: contractId,
    // @ts-ignore - Supabase service client type inference issue
    p_lineage_patch: lineagePatch,
  });
  if (error) throw error;
}

export async function updateAiExtractionJson(
  contractId: number,
  aiExtractionJson: any,
  parentJsonField?: string,
  extractionColumn: string = 'ai_extraction',
) {
  const supabase = createClient();
  const { data: existingData, error: fetchError } = await supabase
    .from('contracts')
    .select(extractionColumn)
    .eq('id', contractId)
    .single();
  if (fetchError) return fetchError;
  const newJson = parentJsonField
    ? {
        [parentJsonField]: aiExtractionJson,
      }
    : aiExtractionJson;
  const updatedJson = {
    // @ts-ignore
    ...existingData?.[extractionColumn],
    ...newJson,
  };
  const { data, error } = await supabase
    .from('contracts')
    // @ts-ignore - Supabase service client type inference issue
    .update({ [extractionColumn]: updatedJson })
    .eq('id', contractId);

  return data || error;
}

export async function saveAiExtractionStatus(
  status: AIExtractionStatus,
  contractId: number,
) {
  const supabase = createClient();
  await supabase
    .from('contracts')
    // @ts-ignore - Supabase service client type inference issue
    .update({ ai_extraction_status: status })
    .eq('id', contractId);
}

export async function saveContractColumns(columns: any, contractId: number) {
  const supabase = createClient();
  if (!contractId) return { body: 'No contract id' };
  const { data, error } = await supabase
    .from('contracts')
    // @ts-ignore - Supabase service client type inference issue
    .update({ ...columns })
    .eq('id', contractId);
  return data || error;
}

// Define thresholds for vendor name matching
const VENDOR_MATCHING_THRESHOLDS = {
  EXACT: 1.0,
  HIGH: 0.9,
  MEDIUM: 0.75,
};

const MIN_SIMILARITY_SCORE = VENDOR_MATCHING_THRESHOLDS.MEDIUM;

/**
 * Retrieves the ID of a vendor based on its name and optionally its address.
 *
 * The function attempts to find an existing vendor using a multi-step approach:
 * 1.  Exact match on the cleaned (normalized) vendor name.
 * 2.  ILIKE (case-insensitive) match on the cleaned vendor name if no unique exact match.
 * 3.  Similarity search using Levenshtein distance and Jaccard index if no confident match yet.
 *     Compares the input cleaned name against cleaned names of candidate vendors.
 *
 * If a suitable existing vendor is found with a similarity score meeting `MIN_SIMILARITY_SCORE`
 * (and no ties at the top score), its ID is returned.
 *
 * If no suitable existing vendor is found and an `organizationId` is provided,
 * a new vendor is created with the `initialVendorName` and `vendorAddress` (if provided).
 * The new vendor is then linked to the specified organization. The `user_id` for the new vendor
 * is automatically determined from the authenticated user session.
 *
 * Logs various steps of the matching and creation process.
 *
 * @param initialVendorName - The initial, potentially uncleaned, name of the vendor.
 * @param vendorAddress - Optional address of the vendor. Used if creating a new vendor.
 * @param organizationId - Optional ID of the organization. Required if a new vendor needs to be created
 *                         and linked to an organization. If not provided and no match is found,
 *                         no vendor will be created, and null will be returned.
 * @returns A Promise that resolves to the numeric ID of the matched or newly created vendor,
 *          or `null` if no vendor is found/created, or if an error occurs (e.g., user not authenticated,
 *          database error, failure to link new vendor to organization).
 */
export async function getVendorId(
  initialVendorName: string, // Renamed for clarity, this is the raw input
  vendorAddress?: string,
  organizationId?: string,
): Promise<number | null> {
  const supabase = createClient();

  if (!initialVendorName || initialVendorName.trim() === '') {
    console.warn('getVendorId: Vendor name is empty. Cannot process.');
    return null;
  }

  const cleanedVendorName = globalRemoveKnownSuffixes(initialVendorName);
  if (!cleanedVendorName || cleanedVendorName.trim() === '') {
    return null;
  }

  let determinedVendorId: number | null = null;

  try {
    // A vendor retired as a duplicate must never be stamped on a new contract;
    // merged/acquired vendors stay matchable because contracts keep the
    // historical vendor id and current_vendors resolves them at read time.
    const notDuplicate = 'status.is.null,status.neq.duplicate';

    // Step 1: Exact Match on cleaned name
    const { data: exactMatchVendors, error: exactMatchError } = await supabase
      .from('vendors')
      .select<string, { id: number; name: string }>('id, name')
      .ilike('name', cleanedVendorName) // Using ilike for case-insensitivity but effectively exact due to cleaned name
      .or(notDuplicate);

    if (exactMatchError) {
      console.error(
        `getVendorId: Error during exact match for "${cleanedVendorName}":`,
        exactMatchError.message,
      );
      // Decide if we should return null or continue to other match types
    }

    if (exactMatchVendors && exactMatchVendors.length > 0) {
      const perfectlyCleanedMatches = exactMatchVendors.filter(
        (v) => globalRemoveKnownSuffixes(v.name) === cleanedVendorName,
      );
      if (perfectlyCleanedMatches.length === 1) {
        determinedVendorId = perfectlyCleanedMatches[0].id;
        return determinedVendorId;
      } else if (perfectlyCleanedMatches.length > 1) {
        // Proceed to similarity scoring with these candidates
      } else {
      }
    } else {
    }

    // Step 2: ILIKE Match on cleaned name (if no unique exact match)
    // This step might be redundant if the exact match above already used ILIKE and filtered.
    // However, it can catch cases where the exact match logic was too strict or to gather more candidates.
    let candidates: { id: number; name: string }[] = exactMatchVendors || [];
    if (!determinedVendorId && candidates.length === 0) {
      const { data: ilikeMatchVendors, error: ilikeMatchError } = await supabase
        .from('vendors')
        .select<string, { id: number; name: string }>('id, name')
        .ilike('name', `%${cleanedVendorName}%`)
        .or(notDuplicate);

      if (ilikeMatchError) {
        console.error(
          `getVendorId: Error during ILIKE match for "%${cleanedVendorName}%":`,
          ilikeMatchError.message,
        );
      }
      if (ilikeMatchVendors && ilikeMatchVendors.length > 0) {
        candidates = _.uniqBy([...candidates, ...ilikeMatchVendors], 'id');
      } else {
      }
    }

    // Step 3: Similarity Search
    if (!determinedVendorId) {
      if (candidates.length === 0) {
        const { data: allVendors, error: allVendorsError } = await supabase
          .from('vendors')
          .select<string, { id: number; name: string }>('id, name')
          .or(notDuplicate);
        if (allVendorsError) {
          console.error(
            'getVendorId: Error fetching all vendors:',
            allVendorsError.message,
          );
          // Not returning null here, as we might still create if no match
        }
        if (allVendors) {
          candidates = allVendors;
        }
      }

      if (candidates.length > 0) {
        const scoredVendors = candidates
          .map((vendor) => {
            const dbVendorCleanedName = globalRemoveKnownSuffixes(vendor.name);
            if (!dbVendorCleanedName || dbVendorCleanedName.trim() === '') {
              // Optionally log this, but skip if the name cleans to empty
              return null;
            }
            const similarityScores = calculateVendorSimilarity(
              cleanedVendorName,
              dbVendorCleanedName,
            );
            return { ...vendor, similarity: similarityScores.combinedScore };
          })
          .filter((v) => v !== null && typeof v.similarity === 'number') as {
          id: number;
          name: string;
          similarity: number;
        }[];

        scoredVendors.sort((a, b) => b.similarity - a.similarity);

        if (scoredVendors.length > 0) {
          if (scoredVendors[0].similarity >= MIN_SIMILARITY_SCORE) {
            // Check for ties at the top score
            const topScore = scoredVendors[0].similarity;
            const ties = scoredVendors.filter((v) => v.similarity === topScore);
            if (ties.length === 1) {
              determinedVendorId = scoredVendors[0].id;
            } else {
              console.warn(
                `getVendorId: Multiple vendors (${ties.length}) tied for the best similarity score (${topScore}) for "${initialVendorName}". Cannot confidently select one. Vendors: ${ties.map((t) => `${t.name} (ID: ${t.id})`).join(', ')}`,
              );
              // Not setting determinedVendorId, will lead to creation or no match
            }
          } else {
          }
        } else {
        }
      } else {
      }
    }

    if (determinedVendorId) {
      return determinedVendorId;
    }

    // Step 4: Create new vendor if no suitable match found and organizationId is provided
    if (!organizationId) {
      console.warn(
        `getVendorId: organizationId not provided. Cannot create new vendor "${initialVendorName}" as it cannot be linked to an organization.`,
      );
      return null;
    }

    // Create new vendor
    logger.info(
      { initialVendorName },
      `getVendorId: Creating new vendor "${initialVendorName}"`,
    );
    const { data: newVendor, error: vendorInsertError } = await supabase
      .from('vendors')
      .insert({
        name: initialVendorName,
        address: vendorAddress || null,
        status: venderStatuses.active as VendorStatus,
      } as any)
      .select<string, { id: number }>('id')
      .single();

    if (vendorInsertError) {
      console.error(
        `getVendorId: Error inserting new vendor "${initialVendorName}":`,
        vendorInsertError.message,
      );
      return null;
    }

    if (!newVendor || !newVendor.id) {
      console.error(
        `getVendorId: Failed to create new vendor or retrieve its ID for "${initialVendorName}".`,
      );
      return null;
    }
    const newVendorId = newVendor.id;

    // Link vendor to organization
    const { error: orgVendorSettingsInsertError } = await supabase
      .from('organization_vendor_settings')
      .insert({
        organization_id: organizationId,
        vendor_id: newVendorId,
      } as any);

    if (orgVendorSettingsInsertError) {
      console.error(
        `getVendorId: Error linking new vendor ID ${newVendorId} to organization ID ${organizationId}:`,
        orgVendorSettingsInsertError.message,
      );
      // If linking fails, the vendor is created but not associated.
      // This is an inconsistent state. Returning null to indicate failure of the overall operation.
      // Consider if the created vendor should be deleted here for atomicity.
      return null;
    }

    return newVendorId;
  } catch (error: any) {
    logger.error(
      { error: error.message, vendorName: initialVendorName },
      'getVendorId: Unexpected error during processing vendor',
    );
    return null;
  }
}

function parseResponseToJson(jsonString: string) {
  try {
    const cleanJsonString = jsonString
      .replace(/^```json\n/, '')
      .replace(/\n```$/, '')
      .trim();
    const parsed: object = JSON.parse(cleanJsonString);
    const queries = _.map(parsed, (data, key) => ({
      dbName: key,
      query: data,
    }));
    return queries;
  } catch (error) {
    throw error;
  }
}

async function runQueries(queries: any, fileAssistant: any) {
  const fileThread = await openai.beta.threads.create();
  try {
    await addMessageToThread(fileThread, formatBaseQueriesToMarkdown(queries));
    const aiResponse = await runThread(fileAssistant, fileThread);
    const parsedQueries = parseResponseToJson(aiResponse?.text);
    await removeThread(fileThread.id);
    return { parsedQueries, usage: aiResponse?.usage };
  } catch (error) {
    await removeThread(fileThread.id);
    throw error;
  }
}

function convertToObject(parsedQueries: any[]): Record<string, any> {
  return parsedQueries.reduce(
    (acc, { dbName, query }) => {
      acc[dbName] = query;
      return acc;
    },
    {} as Record<string, any>,
  );
}

export async function getContractBasics(
  fileId: string,
  queries?: any,
  excludeSpecs?: boolean,
): Promise<ContractBasicsResponse> {
  const fileAssistant = await createAssistant(fileId);
  let prompts = [];
  if (queries) {
    prompts = queries;
  } else {
    prompts = [...dateQueries, ...otherQueries];
    if (!excludeSpecs) {
      prompts = [...baseQueries, ...prompts];
    }
  }
  try {
    const { parsedQueries, usage } = await runQueries(prompts, fileAssistant);
    const parsedQueriesObj = convertToObject(parsedQueries);
    const cleanedQueriesObj = cleanUpJsonFields(parsedQueriesObj);
    await removeAssistant(fileAssistant);
    return { data: cleanedQueriesObj, usage };
  } catch (error) {
    await removeAssistant(fileAssistant);
    throw error;
  }
}

export async function getAdditionalData(
  fileId: string,
  columns: string[],
): Promise<ContractBasicsResponse> {
  const fileAssistant = await createAssistant(fileId);
  if (columns.length === 0) {
    return { data: {}, usage: null };
  }
  const resolver = await createPromptResolver();
  const queries = await Promise.all(
    columns.map(async (column) => {
      const fallback = _.find(additionalQueries, { dbName: column });
      const result = await resolver.resolvePrompt({
        fieldName: column,
        fallbackPrompt: fallback,
        moduleId: MODULE_IDS.cpm,
      });
      return result.promptQuery;
    }),
  );
  try {
    const { parsedQueries, usage } = await runQueries(queries, fileAssistant);
    await removeAssistant(fileAssistant);
    return { data: convertToObject(parsedQueries), usage };
  } catch (error) {
    await removeAssistant(fileAssistant);
    throw error;
  }
}

async function removeThread(threadId: string) {
  await openai.beta.threads.del(threadId);
}

export async function getVendorName(fileId: string) {
  return await getContractBasics(fileId, [baseQueries[1]]);
}

export async function getContractType(fileId: string) {
  return await getContractBasics(fileId, [baseQueries[0]]);
}

export async function getContractSummary(fileId: string) {
  return await getContractBasics(fileId, [baseQueries[2]]);
}

export async function getProductList(fileId: string) {
  return await getContractBasics(fileId, [baseQueries[3]]);
}

export async function getContractSpecifics(
  filePath: string,
  fileId: string,
  columns: string[],
  processor: ModelProvider = ModelProvider.openai,
) {
  const resolver = await createPromptResolver();
  const queries = await Promise.all(
    columns.map(async (column) => {
      const fallback = _.find(allQueries, { dbName: column });
      const result = await resolver.resolvePrompt({
        fieldName: column,
        fallbackPrompt: fallback,
        moduleId: MODULE_IDS.cpm,
      });
      return result.promptQuery;
    }),
  );
  if (processor === ModelProvider.google) {
    return await getContractBasicsWithGoogle(filePath, queries);
  }
  return await getContractBasics(fileId, queries);
}

export async function uploadToOpenAi(supabaseFilePath: string) {
  const segments = supabaseFilePath.split('/').filter(Boolean);
  let safePath: string;
  try {
    safePath = buildSafePath(segments);
  } catch (pathError) {
    if (pathError instanceof PathTraversalError) {
      logger.warn({ supabaseFilePath }, 'Path traversal attempt detected');
      throw new Error('Invalid file path');
    }
    throw pathError;
  }

  const fileName = segments[segments.length - 1];
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from('contract_docs')
    .download(safePath);
  if (error) {
    console.error('Error downloading file:', supabaseFilePath);
    throw error.stack;
  }
  const openAiFile = await uploadFileToOpenAi(data, fileName); // data as blob
  return openAiFile;
}
