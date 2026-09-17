import { z } from 'zod';
import { getOrgTags } from '@/lib/v2';
import { requireMcpContext } from '@/app/lib/mcp/context';
import type { McpToolDef } from '@/app/lib/mcp/tools/types';

const input = z.object({});

async function listTags(_: z.infer<typeof input>) {
  const ctx = requireMcpContext();
  const tags = await getOrgTags(ctx.userMetadata.organizationId);
  return {
    count: tags.length,
    tags,
  };
}

export const tagsTools: McpToolDef[] = [
  {
    name: 'list_tags',
    description:
      "List all tags defined in the user's organization. Use this when the user mentions a tag by name and you need to resolve it for filtering — e.g. before calling query_contracts with tag_id. Returns [{ id, name }].",
    inputSchema: input,
    annotations: {
      title: 'List tags',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: listTags as McpToolDef['handler'],
  },
];
