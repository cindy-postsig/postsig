'use server';

import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import {
  ValidationError,
  AuthorizationError,
  DatabaseError,
  SystemError,
  ExternalServiceError,
} from '@/lib/errors';
import { getAllOrgUserData, getUserMetadata } from '@/data/users';
import { addToUrlCache, getFromUrlCache } from '@/utils/attachmentCache';
import { Json } from '@/database.types';
import { PostgrestError } from '@supabase/supabase-js';
import { buildSafePath, PathTraversalError } from '@/utils/helpers';

interface UrlMap {
  [key: string]: string;
}

interface PathObject {
  id: string;
  path: string;
}

export interface CommentData {
  content: any;
  contractId: number;
  userId: string | undefined;
  parentCommentId?: number | undefined;
}

export type CommentOrder = 'newest_first' | 'oldest_first';

/**
 * Sets the comment order preference for a user on a specific contract.
 */
export async function setContractCommentsOrder(
  contractId: number,
  userId: string,
  order: CommentOrder,
): Promise<{ success: true; order: CommentOrder }> {
  const supabase = await createClient();

  const now = new Date().toISOString();

  const { error } = await supabase.from('contract_comments_views').upsert(
    {
      contract_id: contractId,
      user_id: userId,
      comment_order: order,
      updated_at: now,
    } as any,
    {
      onConflict: 'contract_id,user_id',
    },
  );

  if (error) {
    logger.error({ error }, 'Error saving contract comment order');
    throw new DatabaseError('Failed to save comment order', error);
  }

  return { success: true, order };
}

/**
 * Returns how many comments are newer than the user's last_viewed_at for a contract
 */
export async function getUnreadContractCommentsCountWithPref(
  contractId: number,
  userId: string,
): Promise<{ count: number; order: CommentOrder }> {
  const supabase = await createClient();

  const { data: viewRow, error: viewErr } = await supabase
    .from('contract_comments_views')
    .select('last_viewed_at, comment_order')
    .eq('contract_id', contractId)
    .eq('user_id', userId)
    .maybeSingle();

  if (viewErr) {
    logger.error({ viewErr }, 'Error fetching contract comments views');
    throw new DatabaseError('Failed to fetch comment view state', viewErr);
  }

  const lastViewedAt = (viewRow as any)?.last_viewed_at as string | undefined;

  let query = supabase
    .from('contract_comments')
    .select('id', { count: 'exact', head: true })
    .eq('contract_id', contractId)
    .eq('is_deleted', false);

  if (lastViewedAt) {
    query = query.gt('created_at', lastViewedAt);
  }

  const { count, error } = await query;
  if (error) {
    logger.error({ error }, 'Error counting unread contract comments');
    throw new DatabaseError('Failed to count unread comments', error);
  }

  return {
    count: count ?? 0,
    order: (viewRow as any)?.comment_order ?? 'newest_first',
  };
}

/**
 * Marks all comments for a contract as viewed for the given user.
 */
export async function markContractCommentsViewed(
  contractId: number,
  userId: string,
): Promise<{ success: true }> {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { error } = await supabase.from('contract_comments_views').upsert(
    {
      contract_id: contractId,
      user_id: userId,
      last_viewed_at: now,
      updated_at: now,
    } as any,
    {
      onConflict: 'contract_id,user_id',
    },
  );

  if (error) {
    logger.error({ error }, 'Error upserting contract_comments_views');
    throw new DatabaseError('Failed to mark comments as viewed', error);
  }

  return { success: true };
}

export async function insertComment(data: CommentData) {
  if (!data.content || !data.contractId || !data.userId) {
    throw new ValidationError('Missing required fields for comment creation');
  }

  // Ensure the content is a plain object
  const plainContent = JSON.parse(JSON.stringify(data.content));

  const supabase = await createClient();

  try {
    const { data: insertedComment, error } = await supabase
      .from('contract_comments')
      .insert({
        content: plainContent,
        contract_id: data.contractId,
        user_id: data.userId,
        parent_comment_id: data.parentCommentId,
      } as any)
      .select<string, { id: number }>()
      .single();

    if (error) throw error;

    // Mark as viewed for author so their own comment doesn't count as unread
    await markContractCommentsViewed(data.contractId, data.userId);

    return { success: true, id: (insertedComment as any).id };
  } catch (error) {
    logger.error({ error }, 'Error inserting comment');
    throw new DatabaseError('Failed to insert comment', error as Error);
  }
}

export async function updateComment(data: {
  id: number;
  content: any;
  userId: string | undefined;
}) {
  if (!data.content || !data.id || !data.userId) {
    throw new ValidationError('Missing required fields for comment update');
  }

  const supabase = await createClient();

  try {
    // First check if user owns the comment
    const { data: comment, error: fetchError } = await supabase
      .from('contract_comments')
      .select<string, { user_id: string }>('user_id')
      .eq('id', data.id)
      .single();

    if (fetchError) throw fetchError;
    if (!comment || comment.user_id !== data.userId) {
      throw new AuthorizationError('Unauthorized to update this comment');
    }

    const { error: updateError } = await supabase
      .from('contract_comments')
      // @ts-ignore - Supabase type issue with update operation
      .update({
        content: data.content,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', data.id)
      .eq('user_id', data.userId);

    if (updateError) throw updateError;

    return { success: true };
  } catch (error) {
    logger.error({ error }, 'Error updating comment');
    throw new DatabaseError('Failed to update comment', error as Error);
  }
}

export async function deleteComment(commentId: number, userId: string) {
  if (!commentId || !userId) {
    throw new ValidationError('Missing required fields for comment deletion');
  }

  const supabase = await createClient();

  try {
    // First fetch the comment to verify ownership
    const { data: comment, error: fetchError } = await supabase
      .from('contract_comments')
      .select<string, { user_id: string }>('user_id')
      .eq('id', commentId)
      .single();

    if (fetchError) throw fetchError;
    if (!comment || comment.user_id !== userId) {
      throw new AuthorizationError('Unauthorized to delete this comment');
    }

    // Get all attachments associated with the comment_id
    const { data: attachments, error: attachmentsError } = await supabase
      .from('contract_comments_attachments')
      .select<string, { id: number; file_path: string }>('id, file_path')
      .eq('comment_id', commentId);

    if (attachmentsError) {
      console.error('Error fetching attachments:', attachmentsError);
    }

    // Delete attachments from storage if any found
    if (attachments && attachments?.length > 0) {
      const filePaths = attachments.map((attachment) => attachment.file_path);

      const { error: storageError } = await supabase.storage
        .from('user_attachments')
        .remove(filePaths);

      if (storageError) {
        console.error('Error removing files from storage:', storageError);
        // Continue with deletion even if storage cleanup fails
      }

      // Delete attachment records
      const { error: attachmentDeleteError } = await supabase
        .from('contract_comments_attachments')
        .delete()
        .eq('comment_id', commentId);

      if (attachmentDeleteError) {
        console.error(
          'Error deleting attachment records:',
          attachmentDeleteError,
        );
        // Continue with comment deletion even if attachment record deletion fails
      }
    }

    // Delete the comment
    const { error: deleteError } = await supabase
      .from('contract_comments')
      .delete()
      .eq('id', commentId)
      .eq('user_id', userId);

    if (deleteError) throw deleteError;

    return { success: true };
  } catch (error) {
    logger.error({ error }, 'Error deleting comment');
    throw new DatabaseError('Failed to delete comment', error as Error);
  }
}

export async function fetchOrgUsersForMentions(
  orgId: string,
  options?: {
    currentUserEmail?: string | null;
  },
) {
  try {
    const orgUsers = await getAllOrgUserData(orgId, {
      currentUserEmail: options?.currentUserEmail,
    });

    return orgUsers.map((user: any) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.user_role,
    }));
  } catch (error) {
    logger.error({ error }, 'Error fetching organization users');
    throw new DatabaseError(
      'Failed to fetch organization users',
      error as Error,
    );
  }
}

export async function getTotalContractAttachmentSize(
  contractId: number,
): Promise<number> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('contract_comments_attachments')
      .select<string, { file_size: number | null }>('file_size')
      .eq('contract_id', contractId);

    if (error) throw error;

    const totalSize = (data || []).reduce(
      (sum, attachment) => sum + (attachment.file_size || 0),
      0,
    );
    return totalSize;
  } catch (error) {
    logger.error({ error }, 'Error getting total contract attachment size');
    throw new DatabaseError(
      'Failed to get contract attachment size',
      error as Error,
    );
  }
}

export async function uploadAttachment(formData: FormData) {
  const file = formData.get('file') as File;
  const userId = formData.get('userId') as string;
  const organizationId = formData.get('organizationId') as string;
  const contractId = formData.get('contractId') as string;
  const commentId = formData.get('commentId')
    ? Number(formData.get('commentId'))
    : null;

  if (!file || !userId || !organizationId || !contractId) {
    throw new ValidationError('Missing required fields for file upload');
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const timestamp = Date.now();
  const originalName = file.name;
  const sanitizedName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_'); // Sanitize filename
  const fileName = `${timestamp}-${sanitizedName}`;
  let filePath: string;
  try {
    filePath = buildSafePath([userId, fileName]);
  } catch (error) {
    if (error instanceof PathTraversalError) {
      throw new ValidationError('Invalid file path');
    }
    throw error;
  }
  const contentType = file.type;
  const fileSize = buffer.length;

  const supabase = await createClient();

  try {
    // Check if adding this file would exceed the contract's total attachment size limit
    const contractIdNum = parseInt(contractId);
    const { data: existingAttachments, error: sizeCheckError } = await supabase
      .from('contract_comments_attachments')
      .select<string, { file_size: number | null }>('file_size')
      .eq('contract_id', contractIdNum);

    if (sizeCheckError) throw sizeCheckError;

    const currentTotalSize = (existingAttachments || []).reduce(
      (sum, attachment) => sum + (attachment.file_size || 0),
      0,
    );

    const newTotalSize = currentTotalSize + fileSize;
    const maxSize = 50 * 1024 * 1024; // 50MB limit per contract, should match TOTAL_CONTRACT_ATTACHMENT_SIZE

    if (newTotalSize > maxSize) {
      throw new ValidationError(
        `Contract attachment size limit of ${maxSize / (1024 * 1024)}MB exceeded.`,
      );
    }

    const { data, error } = await supabase.storage
      .from('user_attachments')
      .upload(filePath, buffer, {
        contentType,
        cacheControl: '3600',
      });

    if (error) throw error;

    const { data: signedUrlData, error: signedUrlError } =
      await supabase.storage
        .from('user_attachments')
        .createSignedUrl(filePath, 3600);

    if (signedUrlError) throw signedUrlError;

    const signedUrl = signedUrlData.signedUrl;

    // Insert into database with contract_id
    const { data: insertData, error: dbError } = await supabase
      .from('contract_comments_attachments')
      .insert({
        file_path: filePath,
        file_name: originalName,
        file_type: contentType,
        file_size: fileSize,
        comment_id: commentId,
        user_id: userId,
        organization_id: organizationId,
        contract_id: contractIdNum, // Add the contract ID
      } as any)
      .select<string, { id: number }>('id')
      .single();

    if (dbError) {
      await supabase.storage.from('user_attachments').remove([filePath]);
      throw dbError;
    }

    return {
      url: signedUrl,
      attachmentData: {
        id: insertData.id,
        filePath,
        fileName: originalName,
        fileType: contentType,
        fileSize,
        publicUrl: signedUrl,
      },
    };
  } catch (error) {
    logger.error({ error }, 'Error uploading file');
    throw new ExternalServiceError(
      'Supabase Storage',
      'Failed to upload file',
      error as Error,
    );
  }
}

export async function getSignedUrlForAttachment(
  path: string,
): Promise<{ url: string } | { error: string }> {
  try {
    const supabase = createServiceClient();

    const { data, error } = await supabase.storage
      .from('user_attachments')
      .createSignedUrl(path, 3600); // 1 hour expiry

    if (error || !data) {
      throw new ExternalServiceError(
        'Supabase Storage',
        error?.message || 'Failed to generate signed URL',
        error,
      );
    }

    return { url: data.signedUrl };
  } catch (err) {
    logger.error({ error: err }, 'Error in getSignedUrl');
    return {
      error:
        'Failed to load file. ' +
        (err instanceof Error ? err.message : 'Unknown error'),
    };
  }
}

export async function linkAttachmentWithComment(attachmentData: {
  attachmentId: number;
  commentId: number;
}) {
  const { attachmentId, commentId } = attachmentData;
  if (!attachmentId || !commentId) {
    throw new ValidationError(
      'Missing required fields for attachment association',
    );
  }

  const supabase = await createClient();
  try {
    const { error } = await supabase
      .from('contract_comments_attachments')
      // @ts-ignore - Supabase type issue with update operation
      .update({
        comment_id: commentId,
      } as any)
      .eq('id', attachmentId);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    logger.error({ error }, 'Error associating attachment with comment');
    throw new DatabaseError(
      'Failed to associate attachment with comment',
      error as Error,
    );
  }
}

export async function cleanupUnusedAttachments(
  userId: string,
  excludeIds: number[] = [],
) {
  if (!userId) {
    throw new ValidationError('User ID is required');
  }

  const supabase = await createClient();

  try {
    // Get all pending attachments for this user, excluding the ones we want to keep
    let query = supabase
      .from('contract_comments_attachments')
      .select('id, file_path')
      .eq('user_id', userId)
      .is('comment_id', null); // Only get attachments not linked to a comment

    // If we have IDs to exclude, add that condition
    if (excludeIds.length > 0) {
      // For multiple IDs, use 'in' filter
      if (excludeIds.length > 1) {
        query = query.not('id', 'in', `(${excludeIds.join(',')})`);
      } else {
        // For a single ID, use simple not equals
        query = query.neq('id', excludeIds[0]);
      }
    }

    const { data: pendingAttachments, error: fetchError } = await query;

    if (fetchError) throw fetchError;

    if (!pendingAttachments || pendingAttachments.length === 0) {
      logger.info({}, 'No unused attachments to clean up');
      return { success: true, deletedCount: 0 };
    }

    logger.info(
      {
        unusedAttachmentsCount: pendingAttachments.length,
        excludedAttachmentsCount: excludeIds.length,
      },
      'Found unused attachments to clean up',
    );

    // Delete the files from storage
    const filePaths = pendingAttachments.map(
      (attachment: { id: number; file_path: string }) => attachment.file_path,
    );

    const { error: storageError } = await supabase.storage
      .from('user_attachments')
      .remove(filePaths);

    if (storageError) {
      console.error('Error removing files from storage:', storageError);
      // Continue with database cleanup even if storage cleanup fails
    }

    // Delete the database records
    const attachmentIds = pendingAttachments.map(
      (attachment: any) => attachment.id,
    );
    const { error: dbError } = await supabase
      .from('contract_comments_attachments')
      .delete()
      .in('id', attachmentIds);

    if (dbError) throw dbError;

    return {
      success: true,
      deletedCount: pendingAttachments.length,
    };
  } catch (error) {
    logger.error({ error }, 'Error cleaning up unused attachments');
    throw new SystemError(
      'Failed to clean up unused attachments',
      'CLEANUP_ERROR',
      error as Error,
    );
  }
}

export async function fetchCommentsWithSignedAttachmentUrls(
  contractId: number,
) {
  const supabase = await createClient();
  try {
    // Fetch the comments as usual
    const { data: comments, error } = await supabase
      .from('contract_comments')
      .select<
        string,
        {
          id: number;
          content: any;
          created_at: string;
          user: { id: string; email: string; name: string } | null;
        }
      >(
        `
        *,
        user:user_id (
          id,
          email,
          name
        )
      `,
      )
      .eq('contract_id', contractId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new DatabaseError('Failed to fetch comments', error);
    }

    if (!comments || comments.length === 0) {
      return [];
    }

    // Process each comment to extract attachment paths
    const attachmentPaths: PathObject[] = [];
    comments.forEach((comment) => {
      const paths = extractAttachmentPaths(comment.content);
      attachmentPaths.push(...paths);
    });

    // Pre-fetch signed URLs for all unique paths
    const uniquePaths = attachmentPaths.filter(
      (obj, index, self) =>
        index === self.findIndex((t) => t.id === obj.id && t.path === obj.path),
    );

    const urlMap = await batchGetSignedUrls(uniquePaths);

    // Update each comment with signed URLs
    const updatedComments = comments.map((comment) => {
      return {
        ...comment,
        content: injectSignedUrls(comment.content, urlMap),
      };
    });

    return updatedComments;
  } catch (error) {
    logger.error({ error }, 'Error in fetchCommentsWithUrls');
    throw new SystemError(
      'Failed to fetch comments with URLs',
      'COMMENTS_FETCH_ERROR',
      error as Error,
    );
  }
}

function extractAttachmentPaths(content: any): PathObject[] {
  const paths: PathObject[] = [];

  function traverse(node: any) {
    if (
      node &&
      node.type === 'attachment' &&
      node.attrs?.path &&
      node.attrs?.id
    ) {
      paths.push({
        id: node.attrs.id,
        path: node.attrs.path,
      });
    }

    if (node && node.content && Array.isArray(node.content)) {
      node.content.forEach(traverse);
    }
  }

  if (content?.content && Array.isArray(content.content)) {
    content.content.forEach(traverse);
  }

  return paths;
}

async function batchGetSignedUrls(pathObjects: PathObject[]): Promise<UrlMap> {
  const urlMap: UrlMap = {};

  // First check cache for any existing URLs
  pathObjects.forEach((obj) => {
    const cachedUrl = getFromUrlCache(obj.id);
    if (cachedUrl) {
      urlMap[obj.path] = cachedUrl;
    }
  });

  // Only fetch URLs for paths not in cache
  const pathsToFetch = pathObjects.filter((obj) => !urlMap[obj.path]);

  if (pathsToFetch.length === 0) {
    return urlMap;
  }

  // Process in batches of 10 to avoid overwhelming the server
  const batchSize = 10;
  for (let i = 0; i < pathsToFetch.length; i += batchSize) {
    const batch = pathsToFetch.slice(i, i + batchSize);
    const promises = batch.map(async (obj) => {
      try {
        const result = await getSignedUrlForAttachment(obj.path);
        if ('url' in result) {
          urlMap[obj.path] = result.url;
          addToUrlCache(obj.id, result.url);
        }
      } catch (error) {
        logger.error({ error, path: obj.path }, 'Error getting signed URL');
      }
    });

    await Promise.all(promises);
  }

  return urlMap;
}

function injectSignedUrls(content: any, urlMap: UrlMap): any {
  if (!content) return content;

  // Deep clone to avoid mutating the original
  const newContent = JSON.parse(JSON.stringify(content));

  function traverse(node: any) {
    if (node && node.type === 'attachment' && node.attrs?.path) {
      if (urlMap[node.attrs.path]) {
        node.attrs.signedUrl = urlMap[node.attrs.path];
      }
    }

    if (node && node.content && Array.isArray(node.content)) {
      node.content.forEach(traverse);
    }
  }

  if (newContent && newContent.content && Array.isArray(newContent.content)) {
    newContent.content.forEach(traverse);
  }

  return newContent;
}

// Add to contracts.ts or similar file
export async function deleteUnusedAttachment(attachmentId: number) {
  if (!attachmentId) {
    return { success: false, error: 'Missing attachment ID' };
  }

  const supabase = await createClient();

  try {
    // First fetch the attachment to get the file path
    const { data: attachment, error: fetchError } = await supabase
      .from('contract_comments_attachments')
      .select<
        string,
        { file_path: string; comment_id: number | null }
      >('file_path, comment_id')
      .eq('id', attachmentId)
      .single();

    if (fetchError) throw fetchError;
    if (!attachment) {
      return { success: false, error: 'Attachment not found' };
    }

    // Only delete if this isn't associated with a comment yet
    if (attachment.comment_id) {
      return {
        success: false,
        reason: 'Attachment is already linked to a comment',
      };
    }

    // Delete from storage
    if (attachment.file_path) {
      await supabase.storage
        .from('user_attachments')
        .remove([attachment.file_path]);
    }

    // Delete from database
    await supabase
      .from('contract_comments_attachments')
      .delete()
      .eq('id', attachmentId);

    return { success: true };
  } catch (error) {
    logger.error({ error }, 'Error deleting unused attachment');
    return { success: false, error: 'Failed to delete attachment' };
  }
}
