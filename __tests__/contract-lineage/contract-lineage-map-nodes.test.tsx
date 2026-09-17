/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import ContractLineageMap from '@/components/contracts/ContractLineageMap';
import { contractTypes } from '@/app/lib/constants';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// The component pulls in ReactFlow's stylesheet, which jest cannot parse.
jest.mock('@xyflow/react/dist/style.css', () => ({}));

// ReactFlow needs layout APIs jsdom lacks; the nodes and edges themselves are
// what this suite checks, so render them directly: nodes through the
// registered node type, edges as inert stubs exposing their id/label/style.
jest.mock('@xyflow/react', () => {
  interface MockEdge {
    id: string;
    label?: string;
    style?: { strokeDasharray?: string };
  }

  const NodeStub = ({
    node,
    nodeTypes,
  }: {
    node: { id: string; type: string; data: unknown };
    nodeTypes: Record<string, React.ComponentType<{ data: unknown }>>;
  }) => {
    const NodeComponent = nodeTypes[node.type];
    return (
      <div data-testid={`node-${node.id}`}>
        <NodeComponent data={node.data} />
      </div>
    );
  };

  const EdgeStub = ({ edge }: { edge: MockEdge }) => (
    <div
      data-testid={`edge-${edge.id}`}
      data-label={edge.label ?? ''}
      data-dasharray={edge.style?.strokeDasharray ?? ''}
    />
  );

  const ReactFlow = ({
    nodes,
    edges,
    nodeTypes,
  }: {
    nodes: Array<{ id: string; type: string; data: unknown }>;
    edges: MockEdge[];
    nodeTypes: Record<string, React.ComponentType<{ data: unknown }>>;
  }) => (
    <div>
      {nodes.map((node) => (
        <NodeStub key={node.id} node={node} nodeTypes={nodeTypes} />
      ))}
      {edges.map((edge) => (
        <EdgeStub key={edge.id} edge={edge} />
      ))}
    </div>
  );

  return {
    ReactFlow,
    Background: () => null,
    BackgroundVariant: { Lines: 'lines' },
    Handle: () => null,
    Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
    ConnectionLineType: { SmoothStep: 'smoothstep' },
    Panel: () => null,
    addEdge: jest.fn(),
    useNodesState: (initial: unknown) => [initial, jest.fn(), jest.fn()],
    useEdgesState: (initial: unknown) => [initial, jest.fn(), jest.fn()],
  };
});

const hierarchy = {
  id: 3023,
  contract_types: { id: 1, name: 'Master Services Agreement' },
  children: [
    { id: 3024, contract_types: { id: 2, name: 'Service Order' } },
    { id: 3026, contract_types: { id: 2, name: 'Service Order' } },
    { id: 3030, contract_types: { id: 6, name: 'Invoice' } },
  ],
};

const allContractsInHierarchy = [
  { id: 3023, localId: 'MSA', status: 'active' },
  {
    id: 3024,
    localId: 'SO-1',
    status: 'active',
    type_id: contractTypes.SO,
    metadata: { lineage: { order_number: '00768208' } },
  },
  { id: 3026, localId: 'SO-2', status: 'inactive', type_id: contractTypes.SO },
  {
    id: 3030,
    localId: 'INV-1',
    status: 'active',
    type_id: contractTypes.Invoice,
    metadata: { lineage: { order_number: 'INV-2024-001' } },
  },
];

// A billing parent from another chain, billed for invoice 3030.
const billingTree = {
  id: 40,
  contract_types: { id: 2, name: 'Service Order' },
};
const billingContracts = [
  { id: 40, localId: 'SO', status: 'active', type_id: contractTypes.SO },
];
const billingEdges = [{ source: 40, target: 3030 }];

// An additional tree overlapping the primary (shared ancestor case).
const overlappingTree = {
  id: 40,
  contract_types: { id: 2, name: 'Service Order' },
  children: [{ id: 3030, contract_types: { id: 6, name: 'Invoice' } }],
};

const renderMap = () =>
  render(
    <ContractLineageMap
      completeHierarchy={hierarchy}
      currentContract={{ id: 3024 }}
      currentId={3024}
      allContractsInHierarchy={allContractsInHierarchy}
    />,
  );

const renderMapWithBilling = (
  additional: typeof billingTree = billingTree,
): ReturnType<typeof render> =>
  render(
    <ContractLineageMap
      completeHierarchy={hierarchy}
      currentContract={{ id: 3024 }}
      currentId={3024}
      allContractsInHierarchy={allContractsInHierarchy}
      additionalHierarchies={[additional]}
      additionalContracts={billingContracts}
      billingEdges={billingEdges}
    />,
  );

const node = (id: number) => screen.getByTestId(`node-${id}`);

describe('ContractLineageMap nodes', () => {
  it('labels nodes with the same local id the left nav uses', () => {
    renderMap();

    // Previously these showed the bare type shorthand ("SO") for every service
    // order, which did not match the nav's "SO-1" / "SO-2".
    expect(within(node(3023)).queryByText('MSA')).not.toBeNull();
    expect(within(node(3024)).queryByText('SO-1')).not.toBeNull();
    expect(within(node(3026)).queryByText('SO-2')).not.toBeNull();
    expect(within(node(3030)).queryByText('INV-1')).not.toBeNull();
  });

  it('marks archived nodes and leaves active ones unmarked', () => {
    renderMap();

    expect(within(node(3026)).queryByText('Archived')).not.toBeNull();
    expect(within(node(3023)).queryByText('Archived')).toBeNull();
    expect(within(node(3024)).queryByText('Archived')).toBeNull();
    expect(screen.getAllByText('Archived')).toHaveLength(1);
  });

  it('shows the document number alongside the PostSig id', () => {
    renderMap();

    expect(
      within(node(3024)).queryByText(/Contract No\. 00768208/),
    ).not.toBeNull();
    expect(within(node(3024)).queryByText('ID 3024')).not.toBeNull();
  });

  it('labels an invoice document number "Invoice No."', () => {
    renderMap();

    expect(
      within(node(3030)).queryByText(/Invoice No\. INV-2024-001/),
    ).not.toBeNull();
  });

  it('omits the document number line when none was extracted', () => {
    renderMap();

    expect(within(node(3026)).queryByText(/No\./)).toBeNull();
    expect(within(node(3026)).queryByText('ID 3026')).not.toBeNull();
  });

  it('falls back to the type shorthand when no local id is supplied', () => {
    render(
      <ContractLineageMap
        completeHierarchy={hierarchy}
        currentContract={{ id: 3024 }}
        currentId={3024}
      />,
    );

    expect(within(node(3023)).queryByText('MSA')).not.toBeNull();
    expect(within(node(3024)).queryByText('SO')).not.toBeNull();
    expect(screen.queryAllByText('Archived')).toHaveLength(0);
  });
});

describe('ContractLineageMap billing-linked trees', () => {
  it('renders a billing-linked tree on the same canvas', () => {
    renderMapWithBilling();

    expect(within(node(40)).queryAllByText('Service Order')).not.toHaveLength(
      0,
    );
    expect(within(node(40)).queryByText('ID 40')).not.toBeNull();
  });

  it('draws a labeled dashed billing edge between the chains', () => {
    renderMapWithBilling();

    const edge = screen.getByTestId('edge-billing-40-3030');
    expect(edge.getAttribute('data-label')).toBe('billed');
    expect(edge.getAttribute('data-dasharray')).toBe('8,5');
  });

  it('keeps the structural hierarchy edges intact and unlabeled', () => {
    renderMapWithBilling();

    const edge = screen.getByTestId('edge-3023-3030');
    expect(edge.getAttribute('data-label')).toBe('');
  });

  it('renders a shared contract once when trees overlap', () => {
    renderMapWithBilling(overlappingTree);

    expect(screen.getAllByTestId('node-3030')).toHaveLength(1);
    expect(screen.getAllByTestId('node-40')).toHaveLength(1);
  });

  it('adds nothing without billing props', () => {
    renderMap();

    expect(screen.queryByTestId('node-40')).toBeNull();
    expect(screen.queryByTestId('edge-billing-40-3030')).toBeNull();
  });
});
