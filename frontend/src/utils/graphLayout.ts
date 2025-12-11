import dagre from 'dagre';

interface Node {
  id: string;
  level: number;
  [key: string]: any;
}

interface Link {
  source: string;
  target: string;
  [key: string]: any;
}

interface DagreLayoutOptions {
  rankDir: 'TB' | 'BT' | 'LR' | 'RL';
  ranker?: 'network-simplex' | 'tight-tree' | 'longest-path';
  nodesep?: number;  // Horizontal spacing between nodes in same rank
  ranksep?: number;  // Vertical spacing between ranks
  edgesep?: number;  // Spacing between edge label and edge
  nodeWidth?: number;
  nodeHeight?: number;
}

/**
 * Compute optimal graph layout using dagre.js Sugiyama algorithm
 * This minimizes edge crossings in hierarchical graphs
 */
export function computeDagreLayout(
  nodes: Node[],
  links: Link[],
  options: DagreLayoutOptions
): { nodes: Node[]; links: Link[] } {
  const {
    rankDir = 'BT',
    ranker = 'network-simplex',
    nodesep = 27,  // Horizontal spacing between nodes at same level (reduced to 1/3rd)
    ranksep = 120,  // Vertical spacing between hierarchy levels
    edgesep = 10
  } = options;

  // Create dagre graph
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: rankDir.toLowerCase(),  // dagre expects lowercase: 'bt', 'tb', 'lr', 'rl'
    ranker: ranker,
    nodesep: nodesep,
    ranksep: ranksep,
    edgesep: edgesep,
    marginx: 20,
    marginy: 20
  });
  g.setDefaultEdgeLabel(() => ({}));

  // Add nodes with dimensions
  nodes.forEach(node => {
    // Adjust node size based on frequency (logarithmic scale like in graph)
    const size = Math.log((node.frequency || 1) + 1) + 2;
    const diameter = size * 6; // nodeRelSize * size

    // Only pass width/height to dagre (don't spread all node properties)
    // dagre expects specific types for its internal properties
    g.setNode(node.id, {
      width: diameter,
      height: diameter
    });
  });

  // Add edges
  links.forEach(link => {
    const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
    const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
    // Pass empty object to dagre (we don't need edge labels for layout)
    g.setEdge(sourceId, targetId, {});
  });

  // Compute layout with crossing minimization
  dagre.layout(g);

  // Extract positioned nodes with fixed positions
  const layoutedNodes = nodes.map(node => {
    const dagreNode = g.node(node.id);

    // Safety check - ensure dagre computed positions
    if (!dagreNode || dagreNode.x === undefined || dagreNode.y === undefined) {
      console.error('Dagre failed to compute position for node:', node.id, dagreNode);
      return {
        ...node,
        x: 0,
        y: 0,
        fx: 0,
        fy: 0
      };
    }

    return {
      ...node,
      x: dagreNode.x,
      y: dagreNode.y,
      fx: dagreNode.x,  // Fix x position (disable forces)
      fy: dagreNode.y   // Fix y position (disable forces)
    };
  });

  // Center the graph around (0, 0) for proper viewport alignment
  if (layoutedNodes.length > 0) {
    const avgX = layoutedNodes.reduce((sum, n) => sum + n.x, 0) / layoutedNodes.length;
    const avgY = layoutedNodes.reduce((sum, n) => sum + n.y, 0) / layoutedNodes.length;

    layoutedNodes.forEach(node => {
      node.x -= avgX;
      node.y -= avgY;
      node.fx = node.x;
      node.fy = node.y;
    });
  }

  return {
    nodes: layoutedNodes,
    links: links
  };
}
