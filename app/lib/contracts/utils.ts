import { compareAsc, compareDesc } from 'date-fns';
import { JSONContent } from '@tiptap/react';
import { fetchOrgUsersForMentions } from '@/data/contracts';
import { notifyComments } from '@/app/lib/contracts/actions';
import {
  buildOrgHierarchyMap,
  type ContractRelationship,
} from '@/lib/inventory/hierarchyUtils';
import { isInvoiceType } from '@/app/lib/constants';

export const dateTypeMap: any = {
  start: 'start',
  end: 'termEndDate',
  cancel: 'cancelByDate',
};

export const renewalTypeMap: any = {
  auto: 'Auto',
  manual: 'Manual',
  'one-time': 'One-Time',
};

function extractMentionedUserIds(content: JSONContent): string[] {
  const mentionedIds: string[] = [];

  function traverse(node: JSONContent) {
    if (node.type === 'mention' && node.attrs?.id) {
      mentionedIds.push(node.attrs.id);
    }

    if (node.content) {
      node.content.forEach(traverse);
    }
  }

  traverse(content);
  return mentionedIds.filter((id, index) => mentionedIds.indexOf(id) === index);
}

export async function sendCommentNotifications({
  content,
  organizationId,
  contractId,
  parentCommentUserId = null,
  html,
  currentUserEmail,
}: {
  content: JSONContent;
  organizationId: string;
  contractId: number;
  parentCommentUserId?: string | null;
  html: string;
  currentUserEmail: string;
}) {
  const filteredUsers = await fetchOrgUsersForMentions(organizationId, {
    currentUserEmail,
  });

  const recipientIds = new Set<string>();
  // Get mentioned user IDs
  const mentionedIds = extractMentionedUserIds(content);
  mentionedIds.forEach((id) => recipientIds.add(id));

  // Get emails for all recipient IDs, marking them as mention type
  const mentionedEmails = filteredUsers
    .filter(
      (user) =>
        recipientIds.has(user.id) &&
        user.email !== currentUserEmail &&
        user.id !== parentCommentUserId, // Exclude parent comment author from mentions
    )
    .map((user) => ({
      email: user.email,
      type: 'mention' as const,
    }))
    .filter(
      (item): item is { email: string; type: 'mention' } => item.email !== null,
    );

  // Handle reply notification separately
  const replyEmail = parentCommentUserId
    ? filteredUsers.find(
        (user) =>
          user.id === parentCommentUserId && user.email !== currentUserEmail,
      )?.email
    : null;

  const recipients = [
    ...mentionedEmails,
    ...(replyEmail ? [{ email: replyEmail, type: 'reply' as const }] : []),
  ];

  if (recipients.length > 0) {
    await notifyComments({
      contractId,
      recipients,
      comment: html,
    });
  }
}

/**
 * Utility to filter out linked child invoice contracts from an array
 * Only use where specifically needed (like dashboard charts)
 *
 * @param contracts Array of contracts (can be raw DB contracts or processed contracts)
 * @param relationships The org's relationships, so the hierarchy spans parents
 *   the caller's own filters (archived, draft, report scope) left out
 * @returns Array of contracts with linked child invoices filtered out
 */
export function filterLinkedChildInvoices<
  T extends { id?: number; typeId?: number; type_id?: number },
>(contracts: T[], relationships: ContractRelationship[]): T[] {
  if (!contracts || !Array.isArray(contracts) || contracts.length === 0) {
    return [];
  }

  const hierarchy = buildOrgHierarchyMap(relationships);

  return contracts.filter((contract) => {
    if (!contract || !contract.id) return false;

    const contractTypeId = contract.typeId || contract.type_id;
    if (!isInvoiceType(contractTypeId)) return true;

    return !hierarchy.parents.has(contract.id);
  });
}
