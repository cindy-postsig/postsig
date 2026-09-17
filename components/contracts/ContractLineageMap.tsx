'use client';

import React, { useCallback } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  addEdge,
  ConnectionLineType,
  Panel,
  Background,
  BackgroundVariant,
  Handle,
  Position,
} from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import '@xyflow/react/dist/style.css';
import ContractLabel from '@/components/contracts/ContractLabel';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import {
  buildLineageNodeMeta,
  type LineageContractRecord,
  type LineageNodeMeta,
} from '@/lib/contracts/lineageNodes';
import type { BillingLineageEdge } from '@/lib/contracts/lineageGraph';

interface ContractType {
  id: string | number;
  name: string | undefined;
}

interface VendorProduct {
  name: string;
}

interface Contract {
  id: string | number;
  contract_types?: ContractType;
  vendor_products_details?: Array<{ vendor_products: VendorProduct }>;
  children?: Contract[];
  business_sponsor?: string[];
  tos_urls?: string[];
  term_start_date?: Array<{ date: string }>;
}

interface ContractLineageMapProps {
  completeHierarchy: Contract | null;
  currentContract: Contract | null;
  currentId: string | number;
  /**
   * Full contract records for the hierarchy. The tree nodes are lean, so the
   * local id, archived flag and document number are resolved from these.
   */
  allContractsInHierarchy?: LineageContractRecord[];
  /**
   * Roots of billing-linked chains, laid out on the same canvas
   * and joined to the primary tree by dashed billing edges.
   */
  additionalHierarchies?: Contract[];
  /** Records backing the additional trees' node meta. */
  additionalContracts?: LineageContractRecord[];
  /** payer -> invoice edges; both endpoints must exist in the rendered trees. */
  billingEdges?: BillingLineageEdge[];
}

const nodeWidth = 220;
const nodeHeight = 285;

const getLayoutedElements = (
  nodes: Node[],
  edges: Edge[],
  direction = 'TB',
) => {
  const isHorizontal = direction === 'LR';
  // A fresh graph per layout: dagre never forgets nodes, so a shared instance
  // would accumulate stale nodes across renders with changing tree sets.
  const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const newNode = {
      ...node,
      targetPosition: (isHorizontal ? 'left' : 'top') as Position,
      sourcePosition: (isHorizontal ? 'right' : 'bottom') as Position,
      // We are shifting the dagre node position (anchor=center center) to the top left
      // so it matches the React Flow node anchor point (top left).
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };

    return newNode;
  });

  return { nodes: newNodes, edges };
};

// Custom Node Component
interface ContractNodeData {
  contract: Contract;
  isActive: boolean;
  isAncestor: boolean;
  currentId: string | number;
  meta?: LineageNodeMeta;
}

const ContractNode = ({ data }: { data: ContractNodeData }) => {
  const { contract, isActive, isAncestor, meta } = data;
  const isArchived = Boolean(meta?.isArchived);

  const getProductInfo = (contract: Contract) => {
    const products = contract.vendor_products_details || [];
    if (products.length === 0) {
      // For addendums, return empty string if no products
      if (contract.contract_types?.name?.toLowerCase().includes('addendum')) {
        return '';
      }
      return contract.contract_types?.name || 'N/A';
    }
    // Create comma-separated list of all product names
    return products.map((product) => product.vendor_products.name).join(', ');
  };

  return (
    <>
      {/* Input handle (top) */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!border-transparent !bg-transparent opacity-0"
      />

      <Link href={`/contracts/${contract.id}`}>
        <div
          className={`relative cursor-pointer rounded bg-card p-[14px] shadow-md transition-all duration-200 hover:shadow-lg ${
            isActive
              ? 'border-2 border-psblue'
              : isAncestor
                ? 'border-[1px] border-foreground/50 hover:border-psblue'
                : 'border-[1px] border-card hover:border-psblue'
          } ${isArchived ? 'border-dashed' : ''} ${
            isArchived && !isActive ? 'opacity-70' : ''
          }`}
          style={{ width: nodeWidth - 20, height: nodeHeight - 20 }}
        >
          <div className="flex h-full flex-col justify-between">
            <div className="flex flex-col items-start gap-3">
              <div className="flex flex-wrap items-center gap-1">
                <ContractLabel
                  name={contract.contract_types?.name}
                  shorten={true}
                  labelOverride={meta?.localId}
                  variant={`${isActive ? 'default' : 'secondary'}`}
                  size="xs"
                />
                {isArchived && (
                  <Badge variant="destructive" size="xs">
                    Archived
                  </Badge>
                )}
              </div>
              <div className="font-serif text-[1.15rem] leading-[1.2]">
                {contract.contract_types?.name}
              </div>
              <div className="line-clamp-2 font-label text-xs text-muted-foreground">
                {getProductInfo(contract)}
              </div>
            </div>
            <div className="font-label text-[.7rem] text-muted-foreground">
              {meta?.orderNumber && (
                <div className="truncate">
                  {meta.isInvoice ? 'Invoice No.' : 'Contract No.'}{' '}
                  {meta.orderNumber}
                </div>
              )}
              <div>ID {contract.id}</div>
            </div>
          </div>
        </div>
      </Link>

      {/* Output handle (bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!border-transparent !bg-transparent opacity-0"
      />
    </>
  );
};

const nodeTypes = {
  contractNode: ContractNode,
};

// Calculate the maximum depth of the hierarchy
const calculateHierarchyDepth = (contract: Contract | null): number => {
  if (!contract) return 0;

  if (!contract.children || contract.children.length === 0) {
    return 1;
  }

  let maxChildDepth = 0;
  contract.children.forEach((child) => {
    const childDepth = calculateHierarchyDepth(child);
    maxChildDepth = Math.max(maxChildDepth, childDepth);
  });

  return 1 + maxChildDepth;
};

// Find ancestor IDs for a target contract in the hierarchy
const findAncestorIds = (
  hierarchy: Contract | null,
  targetId: string | number,
  ancestors: Set<string> = new Set(),
  path: string[] = [],
): Set<string> => {
  if (!hierarchy) return ancestors;

  const currentNodeId = hierarchy.id.toString();

  if (currentNodeId === targetId.toString()) {
    path.forEach((id) => ancestors.add(id));
    return ancestors;
  }

  if (hierarchy.children) {
    for (const child of hierarchy.children) {
      findAncestorIds(child, targetId, ancestors, [...path, currentNodeId]);
    }
  }

  return ancestors;
};

const ancestorEdgeStyle = {
  stroke: 'hsl(var(--foreground) / 0.7)',
  strokeWidth: 2,
};

const defaultEdgeStyle = {
  stroke: 'rgba(127, 127, 127)',
  strokeWidth: 1,
  strokeDasharray: '3,3',
};

/** A billing link is not lineage — long dashes and a label set it apart. */
const billingEdgeStyle = {
  stroke: 'rgba(127, 127, 127)',
  strokeWidth: 1.5,
  strokeDasharray: '8,5',
};

const makeBillingEdge = (edge: BillingLineageEdge): Edge => ({
  id: `billing-${edge.source}-${edge.target}`,
  source: edge.source.toString(),
  target: edge.target.toString(),
  type: 'smoothstep',
  animated: false,
  label: 'billed',
  style: billingEdgeStyle,
});

// Build initial nodes and edges from the primary hierarchy plus any
// billing-linked trees, all on one canvas (dagre lays out disconnected
// components side by side; billing edges may also join them into one DAG).
// Trees are assumed disjoint-or-identical below any shared node: when a node
// repeats in a later tree, its subtree is skipped wholesale, so a divergent
// duplicate would silently lose children (the server assembly guarantees
// this by skipping chains rooted inside an already-included chain).
const buildInitialElements = (
  roots: Contract[],
  currentId: string | number,
  metaById: Map<string, LineageNodeMeta>,
  billingEdges: BillingLineageEdge[],
): { nodes: Node[]; edges: Edge[] } => {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const seenNodeIds = new Set<string>();

  // Ancestor-path highlighting follows the structural chain only — the
  // primary tree is always the first root.
  const ancestorIds = findAncestorIds(roots[0] ?? null, currentId);

  const pushNode = (contract: Contract) => {
    const nodeId = contract.id.toString();
    nodes.push({
      id: nodeId,
      type: 'contractNode',
      position: { x: 0, y: 0 }, // Will be positioned by dagre
      data: {
        contract,
        isActive: nodeId === currentId.toString(),
        isAncestor: ancestorIds.has(nodeId),
        currentId,
        meta: metaById.get(nodeId),
      },
    });
  };

  const pushChildEdge = (nodeId: string, childId: string) => {
    // An edge is on the ancestor path if:
    // - source is an ancestor AND target is either an ancestor or the current node
    const isAncestorEdge =
      ancestorIds.has(nodeId) &&
      (ancestorIds.has(childId) || childId === currentId.toString());

    edges.push({
      id: `${nodeId}-${childId}`,
      source: nodeId,
      target: childId,
      type: 'smoothstep',
      animated: false,
      style: isAncestorEdge ? ancestorEdgeStyle : defaultEdgeStyle,
    });
  };

  // Recursive walk; overlapping trees (shared ancestors) dedupe by node id.
  const buildNodesAndEdges = (contract: Contract) => {
    const nodeId = contract.id.toString();
    if (seenNodeIds.has(nodeId)) return;
    seenNodeIds.add(nodeId);

    pushNode(contract);

    (contract.children ?? []).forEach((child) => {
      pushChildEdge(nodeId, child.id.toString());
      buildNodesAndEdges(child);
    });
  };

  roots.forEach(buildNodesAndEdges);
  billingEdges.forEach((edge) => edges.push(makeBillingEdge(edge)));

  return { nodes, edges };
};

const proOptions = { hideAttribution: true };

const ContractLineageMap: React.FC<ContractLineageMapProps> = ({
  completeHierarchy,
  currentContract,
  currentId,
  allContractsInHierarchy = [],
  additionalHierarchies = [],
  additionalContracts = [],
  billingEdges = [],
}) => {
  const metaById = buildLineageNodeMeta([
    ...allContractsInHierarchy,
    ...additionalContracts,
  ]);

  // The primary tree must stay first — ancestor highlighting reads roots[0].
  const roots = completeHierarchy
    ? [completeHierarchy, ...additionalHierarchies]
    : [];

  // Calculate elements first (or use empty arrays if no hierarchy)
  const { nodes: initialNodes, edges: initialEdges } =
    roots.length > 0
      ? buildInitialElements(roots, currentId, metaById, billingEdges)
      : { nodes: [], edges: [] };

  const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
    initialNodes,
    initialEdges,
  );

  // Hooks must be called before any early returns
  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  const onConnect = useCallback(
    (params: any) =>
      setEdges((eds) =>
        addEdge({ ...params, type: 'smoothstep', animated: false }, eds),
      ),
    [setEdges],
  );

  const onLayout = useCallback(
    (direction: string) => {
      const { nodes: layoutedNodes, edges: layoutedEdges } =
        getLayoutedElements(nodes, edges, direction);

      setNodes([...layoutedNodes]);
      setEdges([...layoutedEdges]);
    },
    [nodes, edges, setNodes, setEdges],
  );

  // Early return after hooks
  if (!completeHierarchy) {
    return (
      <div className="flex h-96 items-center justify-center text-muted-foreground">
        No contract hierarchy available
      </div>
    );
  }

  // Calculate dynamic height based on the deepest rendered tree
  const hierarchyDepth = Math.max(
    ...roots.map((root) => calculateHierarchyDepth(root)),
  );
  const minHeight = 400;
  const heightPerLevel = nodeHeight + 80; // Node height + spacing between levels
  const dynamicHeight = Math.max(minHeight, hierarchyDepth * heightPerLevel);

  return (
    <div className="w-full" style={{ height: `${dynamicHeight}px` }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={() => {}} // Disable node movement
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        connectionLineType={ConnectionLineType.SmoothStep}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        panOnScroll={false}
        panOnDrag={false}
        preventScrolling={false}
        proOptions={proOptions}
      >
        <Background
          variant={BackgroundVariant.Lines}
          bgColor="hsl(var(--muted))"
          color="transparent"
          className="rounded-sm"
        />
      </ReactFlow>
    </div>
  );
};

export default ContractLineageMap;
