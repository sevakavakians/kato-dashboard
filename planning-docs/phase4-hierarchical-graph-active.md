# Phase 4: INTER-Node Hierarchical Graph (ACTIVE)

**Status**: ACTIVE - Ready for Implementation
**Priority**: HIGH (Current Focus)
**Estimated Timeline**: 9-12 hours
**Date Created**: 2025-12-09
**Prioritized By**: ADR-016 (Phase 4 Prioritization Decision)

## Overview

Phase 4 implements the INTER-node hierarchical graph visualization that shows how pattern names from lower nodes become symbols in higher nodes. This is the **core insight** of KATO's hierarchical learning architecture, revealing the abstraction flow across all hierarchy levels.

## Strategic Context

### Why This Phase Is Critical
- **Core Architectural Insight**: Visualizes KATO's unique hierarchical abstraction mechanism
- **High User Value**: Shows the "big picture" of how patterns evolve into symbols across levels
- **Educational Tool**: Helps users understand hierarchical learning at a glance
- **Strategic Planning**: Identifies gaps, imbalances, or bottlenecks in abstraction flow

### The Key Insight Being Visualized
In KATO hierarchical learning:
```
node0 patterns → become symbols in node1
node1 patterns → become symbols in node2
node2 patterns → become symbols in node3

Semantic Abstraction:
Tokens → node0 → node1 → node2 → node3
        phrases  sentences paragraphs  documents
```

This creates a chain of abstractions where each level's outputs become the next level's inputs.

## Requirements

### Backend Requirements

#### 1. Hierarchy Analysis Service
**File**: `backend/app/services/hierarchy_analysis.py` (NEW FILE)

**Estimated Time**: 3-4 hours

```python
from typing import Dict, List, Any, Set
import asyncio
from app.db.hybrid_patterns import get_patterns_hybrid
from app.db.symbol_stats import get_symbols_for_kb

class HierarchyAnalysisService:
    """Service for analyzing cross-KB pattern-symbol relationships."""

    async def compute_hierarchy_graph(self) -> Dict[str, Any]:
        """
        Compute complete hierarchy graph showing pattern-symbol connections.

        Algorithm:
        1. Get all knowledgebases (node0, node1, node2, node3)
        2. For each KB pair (KB_A, KB_B):
            - Get patterns from KB_A
            - Get symbols from KB_B
            - Find matches: pattern.name in KB_A == symbol in KB_B
            - Count connections
        3. Build graph structure

        Returns:
        {
            "nodes": [
                {
                    "id": "node0_kato",
                    "label": "node0",
                    "pattern_count": 1234567,
                    "level": 0
                },
                ...
            ],
            "edges": [
                {
                    "source": "node0_kato",
                    "target": "node1_kato",
                    "connection_count": 8523,
                    "sample_patterns": ["hash1", "hash2", ...],
                    "coverage": 0.0069  # 8523 / 1234567
                },
                ...
            ],
            "metadata": {
                "total_knowledgebases": 4,
                "total_connections": 25000,
                "computation_time_ms": 1234
            }
        }
        """
        pass

    async def get_connection_details(
        self,
        kb_from: str,
        kb_to: str,
        limit: int = 100
    ) -> Dict[str, Any]:
        """
        Get detailed pattern-symbol connections between two KBs.

        Returns:
        {
            "kb_from": "node0_kato",
            "kb_to": "node1_kato",
            "connections": [
                {
                    "pattern_name": "hash123",
                    "pattern_frequency": 50,
                    "symbol_frequency": 120,  # How often used as symbol in KB_to
                    "pattern_data": {...}
                },
                ...
            ],
            "statistics": {
                "total_connections": 8523,
                "average_pattern_frequency": 25.5,
                "average_symbol_reuse": 45.2
            }
        }
        """
        pass

    async def get_pattern_promotion_path(
        self,
        pattern_name: str
    ) -> Dict[str, Any]:
        """
        Trace a pattern's promotion path through hierarchy.

        Example:
        - Pattern "abc123" exists in node0
        - Used as symbol in node1 patterns → promoted to node1
        - Those node1 patterns used as symbols in node2 → promoted to node2
        - etc.

        Returns:
        {
            "pattern_name": "abc123",
            "path": [
                {
                    "level": 0,
                    "kb_id": "node0_kato",
                    "as_pattern": True,
                    "frequency": 50
                },
                {
                    "level": 1,
                    "kb_id": "node1_kato",
                    "as_symbol": True,
                    "used_in_patterns": 120
                },
                ...
            ]
        }
        """
        pass

    # Helper methods
    async def _get_all_knowledgebases(self) -> List[str]:
        """Get list of all KB IDs from ClickHouse."""
        pass

    async def _match_patterns_to_symbols(
        self,
        patterns: List[Dict],
        symbols: Set[str]
    ) -> List[str]:
        """Find which pattern names exist in symbol set."""
        # Simple set intersection
        pattern_names = {p['name'] for p in patterns}
        matches = pattern_names & symbols
        return list(matches)

    async def _compute_coverage(
        self,
        connection_count: int,
        total_patterns: int
    ) -> float:
        """Compute what % of patterns are promoted to next level."""
        return connection_count / total_patterns if total_patterns > 0 else 0.0
```

#### 2. API Endpoints
**File**: `backend/app/api/routes.py` (MODIFY)

**Estimated Time**: 1.5-2 hours

```python
from app.services.hierarchy_analysis import HierarchyAnalysisService

# Initialize service
hierarchy_service = HierarchyAnalysisService()

# INTER-Node Hierarchical Graph Endpoints
@router.get("/analytics/graphs/hierarchy")
async def get_hierarchy_graph() -> Dict[str, Any]:
    """
    Get complete hierarchical graph showing INTER-node connections.

    Returns:
    - nodes: List of knowledgebases with metadata
    - edges: Pattern-symbol connections between KBs
    - metadata: Statistics about the hierarchy

    Use case: Main visualization on HierarchicalGraph page
    """
    return await hierarchy_service.compute_hierarchy_graph()

@router.get("/analytics/graphs/hierarchy/{kb_from}/to/{kb_to}")
async def get_connection_details(
    kb_from: str,
    kb_to: str,
    limit: int = 100,
    skip: int = 0,
    sort_by: str = "pattern_frequency",  # or "symbol_frequency"
    sort_order: str = "desc"
) -> Dict[str, Any]:
    """
    Get detailed connections between two specific knowledgebases.

    Returns:
    - connections: List of pattern-symbol matches
    - statistics: Aggregate stats
    - pagination: skip/limit info

    Use case: Click edge in graph → see connection details
    """
    return await hierarchy_service.get_connection_details(
        kb_from, kb_to, limit
    )

@router.get("/analytics/graphs/hierarchy/patterns/{pattern_name}/path")
async def get_pattern_promotion_path(
    pattern_name: str
) -> Dict[str, Any]:
    """
    Trace a pattern's promotion path through the hierarchy.

    Returns:
    - pattern_name: str
    - path: List showing presence at each level

    Use case: Search for specific pattern → see its abstraction journey
    """
    return await hierarchy_service.get_pattern_promotion_path(pattern_name)
```

#### 3. Data Model
**TypeScript Types** (for reference):

```typescript
interface HierarchyNode {
  id: string              // "node0_kato", "node1_kato", etc.
  label: string           // "node0", "node1", etc.
  pattern_count: number   // Total patterns in this KB
  level: number           // 0, 1, 2, 3
}

interface HierarchyEdge {
  source: string          // Source KB ID
  target: string          // Target KB ID
  connection_count: number // Number of patterns promoted
  sample_patterns: string[] // Sample pattern names
  coverage: number        // % of source patterns promoted (0.0-1.0)
}

interface HierarchyGraph {
  nodes: HierarchyNode[]
  edges: HierarchyEdge[]
  metadata: {
    total_knowledgebases: number
    total_connections: number
    computation_time_ms: number
  }
}
```

### Frontend Requirements

#### 1. Hierarchical Graph Page
**File**: `frontend/src/pages/HierarchicalGraph.tsx` (NEW FILE)

**Estimated Time**: 4-5 hours

```typescript
import { useQuery } from '@tanstack/react-query'
import ForceGraph2D from 'react-force-graph-2d'
import { apiClient } from '@/lib/api'
import { Card } from '@/components/Card'

interface HierarchicalGraphProps {}

export default function HierarchicalGraph() {
  // Fetch hierarchy graph data
  const { data: graphData, isLoading } = useQuery({
    queryKey: ['hierarchyGraph'],
    queryFn: () => apiClient.getHierarchyGraph(),
    refetchInterval: 60000  // Refresh every minute
  })

  // State
  const [selectedNode, setSelectedNode] = useState<HierarchyNode | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<HierarchyEdge | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  // Handlers
  const handleNodeClick = (node: HierarchyNode) => {
    setSelectedNode(node)
    setSelectedEdge(null)
    // Could navigate to INTRA-node graph (Phase 3) when available
  }

  const handleEdgeClick = (edge: HierarchyEdge) => {
    setSelectedEdge(edge)
    setSelectedNode(null)
    // Fetch detailed connections
  }

  const handleSearchPattern = async () => {
    // Search for specific pattern and show its path
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with search and controls */}
      <Card className="mb-4">
        <h1>Hierarchical Abstraction Graph</h1>
        <p>Visualizing pattern promotion across hierarchy levels</p>
        <input
          type="text"
          placeholder="Search pattern by name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </Card>

      <div className="flex-1 grid grid-cols-12 gap-4">
        {/* Main graph visualization */}
        <Card className="col-span-8">
          <ForceGraph2D
            graphData={{
              nodes: graphData?.nodes || [],
              links: graphData?.edges || []
            }}
            nodeLabel="label"
            nodeVal={node => Math.log(node.pattern_count)}
            nodeColor={node => getColorForLevel(node.level)}
            linkLabel={link => `${link.connection_count} patterns promoted`}
            linkWidth={link => Math.log(link.connection_count)}
            onNodeClick={handleNodeClick}
            onLinkClick={handleEdgeClick}
            linkDirectionalArrowLength={6}
            linkDirectionalArrowRelPos={1}
            linkCurvature={0.2}
          />
        </Card>

        {/* Detail panel */}
        <Card className="col-span-4">
          {selectedNode && <NodeDetailPanel node={selectedNode} />}
          {selectedEdge && <EdgeDetailPanel edge={selectedEdge} />}
          {!selectedNode && !selectedEdge && <OverviewPanel />}
        </Card>
      </div>

      {/* Legend */}
      <Card className="mt-4">
        <LegendPanel />
      </Card>
    </div>
  )
}

// Helper components
function NodeDetailPanel({ node }: { node: HierarchyNode }) {
  return (
    <div>
      <h3>{node.label}</h3>
      <p>Pattern Count: {node.pattern_count.toLocaleString()}</p>
      <p>Hierarchy Level: {node.level}</p>
      {/* Show promotion statistics */}
    </div>
  )
}

function EdgeDetailPanel({ edge }: { edge: HierarchyEdge }) {
  const { data: details } = useQuery({
    queryKey: ['connectionDetails', edge.source, edge.target],
    queryFn: () => apiClient.getConnectionDetails(edge.source, edge.target)
  })

  return (
    <div>
      <h3>Connection: {edge.source} → {edge.target}</h3>
      <p>Patterns Promoted: {edge.connection_count.toLocaleString()}</p>
      <p>Coverage: {(edge.coverage * 100).toFixed(2)}%</p>
      {/* Show sample patterns */}
      {details && <ConnectionDetailList connections={details.connections} />}
    </div>
  )
}

function OverviewPanel() {
  return (
    <div>
      <h3>Hierarchical Learning Overview</h3>
      <p>This graph shows how patterns from lower nodes become symbols in higher nodes.</p>
      <ul>
        <li>Nodes: Knowledgebases (node0-node3)</li>
        <li>Edges: Pattern promotion count</li>
        <li>Node size: Pattern count (logarithmic)</li>
        <li>Edge width: Connection count (logarithmic)</li>
      </ul>
    </div>
  )
}

function LegendPanel() {
  return (
    <div className="flex gap-8">
      <div>
        <h4>Node Colors</h4>
        <div className="flex gap-2">
          <span style={{color: getColorForLevel(0)}}>⬤ node0 (phrases)</span>
          <span style={{color: getColorForLevel(1)}}>⬤ node1 (sentences)</span>
          <span style={{color: getColorForLevel(2)}}>⬤ node2 (paragraphs)</span>
          <span style={{color: getColorForLevel(3)}}>⬤ node3 (documents)</span>
        </div>
      </div>
      <div>
        <h4>Edge Meaning</h4>
        <p>Edge from A → B: Patterns in A used as symbols in B</p>
      </div>
    </div>
  )
}

function getColorForLevel(level: number): string {
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444']
  return colors[level] || '#6b7280'
}
```

#### 2. API Client Methods
**File**: `frontend/src/lib/api.ts` (ADD)

**Estimated Time**: 0.5 hours

```typescript
class ApiClient {
  async getHierarchyGraph(): Promise<HierarchyGraph> {
    const { data } = await this.client.get('/analytics/graphs/hierarchy')
    return data
  }

  async getConnectionDetails(
    kbFrom: string,
    kbTo: string,
    limit?: number,
    skip?: number
  ): Promise<ConnectionDetails> {
    const { data } = await this.client.get(
      `/analytics/graphs/hierarchy/${kbFrom}/to/${kbTo}`,
      { params: { limit, skip } }
    )
    return data
  }

  async getPatternPromotionPath(patternName: string): Promise<PromotionPath> {
    const { data } = await this.client.get(
      `/analytics/graphs/hierarchy/patterns/${patternName}/path`
    )
    return data
  }
}
```

#### 3. Type Definitions
**File**: `frontend/src/types/hierarchy.ts` (NEW FILE)

**Estimated Time**: 0.25 hours

```typescript
export interface HierarchyNode {
  id: string
  label: string
  pattern_count: number
  level: number
}

export interface HierarchyEdge {
  source: string
  target: string
  connection_count: number
  sample_patterns: string[]
  coverage: number
}

export interface HierarchyGraph {
  nodes: HierarchyNode[]
  edges: HierarchyEdge[]
  metadata: {
    total_knowledgebases: number
    total_connections: number
    computation_time_ms: number
  }
}

export interface ConnectionDetails {
  kb_from: string
  kb_to: string
  connections: PatternSymbolConnection[]
  statistics: {
    total_connections: number
    average_pattern_frequency: number
    average_symbol_reuse: number
  }
}

export interface PatternSymbolConnection {
  pattern_name: string
  pattern_frequency: number
  symbol_frequency: number
  pattern_data: any
}

export interface PromotionPath {
  pattern_name: string
  path: Array<{
    level: number
    kb_id: string
    as_pattern?: boolean
    as_symbol?: boolean
    frequency?: number
    used_in_patterns?: number
  }>
}
```

#### 4. Routing
**File**: `frontend/src/App.tsx` (MODIFY)

**Estimated Time**: 0.25 hours

```typescript
import HierarchicalGraph from './pages/HierarchicalGraph'

// Add route
<Route path="hierarchy" element={<HierarchicalGraph />} />
```

**File**: `frontend/src/components/Layout.tsx` (MODIFY)

```typescript
// Add navigation link
<NavLink to="/hierarchy" icon={<Network />}>
  Hierarchy Graph
</NavLink>
```

#### 5. Dependencies
**File**: `frontend/package.json` (ADD)

**Estimated Time**: Included in setup

```json
{
  "dependencies": {
    "react-force-graph-2d": "^1.25.0",
    "d3-force": "^3.0.0"
  }
}
```

## Implementation Plan

### Phase A: Backend Foundation (3-4 hours)
1. **Create hierarchy analysis service** (2-2.5h)
   - Implement compute_hierarchy_graph()
   - Implement get_connection_details()
   - Implement get_pattern_promotion_path()
   - Add helper methods

2. **Add API endpoints** (1-1.5h)
   - Add /analytics/graphs/hierarchy
   - Add /analytics/graphs/hierarchy/{kb_from}/to/{kb_to}
   - Add /analytics/graphs/hierarchy/patterns/{pattern_name}/path
   - Test with curl/Postman

### Phase B: Frontend Visualization (4-5 hours)
1. **Setup types and API client** (0.5h)
   - Create hierarchy.ts types
   - Add API client methods

2. **Create graph page** (2.5-3h)
   - Build HierarchicalGraph.tsx main component
   - Integrate react-force-graph-2d
   - Add node/edge click handlers
   - Implement color coding by level

3. **Add detail panels** (1-1.5h)
   - NodeDetailPanel component
   - EdgeDetailPanel component
   - OverviewPanel component
   - LegendPanel component

4. **Add routing and navigation** (0.5h)
   - Add route in App.tsx
   - Add nav link in Layout.tsx

### Phase C: Testing & Polish (2-3 hours)
1. **Backend testing** (1h)
   - Test with real KATO data
   - Verify pattern-symbol matching logic
   - Check performance with large datasets

2. **Frontend testing** (1h)
   - Test graph rendering
   - Test click interactions
   - Test detail panels
   - Test responsive layout

3. **Documentation** (1h)
   - Update CLAUDE.md with Phase 4 info
   - Add user guide for hierarchy graph
   - Document API endpoints

## Algorithm Details

### Pattern-Symbol Matching Algorithm
```python
# Pseudocode for compute_hierarchy_graph()

1. Get all knowledgebases from ClickHouse:
   kbs = ["node0_kato", "node1_kato", "node2_kato", "node3_kato"]

2. Build nodes:
   nodes = []
   for kb in kbs:
       pattern_count = count_patterns(kb)
       nodes.append({
           "id": kb,
           "label": kb.split("_")[0],
           "pattern_count": pattern_count,
           "level": extract_level(kb)
       })

3. Build edges (pattern-symbol connections):
   edges = []
   for i in range(len(kbs) - 1):
       kb_from = kbs[i]
       kb_to = kbs[i + 1]

       # Get patterns from source KB
       patterns = get_patterns(kb_from, limit=10000)  # Sample for performance
       pattern_names = {p['name'] for p in patterns}

       # Get symbols used in target KB
       symbols = get_symbols(kb_to)

       # Find matches (pattern names that exist as symbols)
       matches = pattern_names & symbols
       connection_count = len(matches)

       # Compute coverage
       coverage = connection_count / len(pattern_names)

       edges.append({
           "source": kb_from,
           "target": kb_to,
           "connection_count": connection_count,
           "sample_patterns": list(matches)[:10],
           "coverage": coverage
       })

4. Return graph:
   return {
       "nodes": nodes,
       "edges": edges,
       "metadata": {...}
   }
```

### Performance Optimization
**For Large Datasets**:
- Sample patterns (e.g., 10,000 random patterns per KB)
- Cache graph structure (TTL: 5-10 minutes)
- Compute asynchronously if > 30 seconds
- Show progress indicator during computation

**Sampling Strategy**:
```python
# Instead of analyzing ALL patterns, sample representative subset
sample_size = min(10000, total_patterns)
patterns = get_patterns(kb_id, limit=sample_size, random=True)

# Scale up results
estimated_total_connections = (connections_found / sample_size) * total_patterns
```

## Success Metrics

### Functional Requirements
- [ ] Graph displays all knowledgebases (node0-node3)
- [ ] Edges show pattern-symbol connections
- [ ] Node size reflects pattern count
- [ ] Edge width reflects connection count
- [ ] Click node to see details
- [ ] Click edge to see connection details
- [ ] Color coding by hierarchy level
- [ ] Legend explains visualization
- [ ] Search for specific pattern

### Performance Requirements
- [ ] Graph computation < 10 seconds
- [ ] Graph rendering < 2 seconds
- [ ] Smooth interactions (60fps)
- [ ] Handles 1M+ patterns per KB (via sampling)

### User Experience Requirements
- [ ] Intuitive visualization of hierarchy
- [ ] Clear labels and legend
- [ ] Responsive to clicks
- [ ] Helpful tooltips
- [ ] Export capability (future)

## Testing Strategy

### Backend Unit Tests
```python
# test_hierarchy_analysis.py

async def test_compute_hierarchy_graph():
    service = HierarchyAnalysisService()
    graph = await service.compute_hierarchy_graph()

    assert len(graph['nodes']) == 4  # node0, node1, node2, node3
    assert len(graph['edges']) == 3  # node0→node1, node1→node2, node2→node3
    assert all(edge['connection_count'] > 0 for edge in graph['edges'])

async def test_pattern_symbol_matching():
    # Create test patterns and symbols
    patterns = [{'name': 'abc'}, {'name': 'def'}]
    symbols = {'abc', 'ghi'}

    matches = await match_patterns_to_symbols(patterns, symbols)
    assert matches == ['abc']

async def test_coverage_computation():
    coverage = compute_coverage(8523, 1234567)
    assert 0.0 < coverage < 1.0
```

### Frontend Integration Tests
```typescript
// HierarchicalGraph.test.tsx

describe('HierarchicalGraph', () => {
  it('renders graph with nodes and edges', async () => {
    render(<HierarchicalGraph />)
    await waitFor(() => {
      expect(screen.getByText('node0')).toBeInTheDocument()
      expect(screen.getByText('node1')).toBeInTheDocument()
    })
  })

  it('shows node details on click', async () => {
    render(<HierarchicalGraph />)
    // Simulate node click
    // Verify detail panel appears
  })

  it('shows edge details on click', async () => {
    render(<HierarchicalGraph />)
    // Simulate edge click
    // Verify connection details appear
  })
})
```

### Manual Testing Checklist
- [ ] Graph renders correctly
- [ ] Node sizes reflect pattern counts
- [ ] Edge widths reflect connection counts
- [ ] Colors match hierarchy levels
- [ ] Node click shows details
- [ ] Edge click shows connection details
- [ ] Legend is clear and accurate
- [ ] Search works for pattern names
- [ ] Responsive layout on different screen sizes

## Future Enhancements (Post-MVP)

### Phase 4.1: Enhanced Interactions
- **Zoom and pan controls**: Better navigation for large graphs
- **Highlight paths**: Show promotion path for selected pattern
- **Filter by coverage**: Hide low-coverage edges
- **Animated transitions**: Show data flow over time

### Phase 4.2: Advanced Analytics
- **Promotion efficiency**: Analyze why some patterns promote, others don't
- **Bottleneck detection**: Find hierarchy levels with low promotion rates
- **Pattern lifecycle**: Track patterns across multiple levels
- **Comparison mode**: Compare different training runs

### Phase 4.3: Export and Reporting
- **Export graph as PNG/SVG**: Save visualization
- **Export data as GraphML**: Use in external tools (Gephi, Cytoscape)
- **Generate report**: Hierarchy health metrics
- **Share visualization**: Permalink to specific graph state

## Integration with Other Phases

### Phase 2 (Vector Visualization) - When Implemented
- Color embeddings by hierarchy level (from Phase 4)
- Show where patterns cluster at each level
- Identify patterns ready for promotion

### Phase 3 (INTRA-Node Graph) - When Implemented
- Click node in Phase 4 → drill into INTRA-node graph
- Breadcrumb navigation: Hierarchy → KB → Pattern
- Consistent color scheme across phases

### Phase 5 (Export Functionality)
- Export hierarchy graph structure
- Export connection statistics
- Export promotion efficiency reports

## Documentation Requirements

### User Guide (CLAUDE.md Update)
```markdown
## Hierarchical Graph Visualization

The Hierarchical Graph page shows how patterns from lower nodes become symbols in higher nodes.

### Understanding the Graph
- **Nodes**: Knowledgebases (node0, node1, node2, node3)
- **Node Size**: Number of patterns (logarithmic scale)
- **Node Color**: Hierarchy level (blue → green → yellow → red)
- **Edges**: Pattern-symbol connections (directed arrows)
- **Edge Width**: Connection count (logarithmic scale)

### Interactions
- **Click Node**: See pattern count and statistics
- **Click Edge**: See detailed connections between two KBs
- **Search**: Find specific pattern and trace its path
- **Hover**: See tooltips with counts and percentages

### Insights
- **High coverage edges**: Many patterns successfully promoted
- **Low coverage edges**: Bottleneck in abstraction flow
- **Node size imbalance**: Potential training issue
```

### API Documentation (OpenAPI)
- Document all three endpoints
- Provide example responses
- Explain parameters and return values

## Rollout Plan

### Week 1: Backend Development (3-4 hours)
- Day 1: Create hierarchy_analysis.py service (2-2.5h)
- Day 2: Add API endpoints and test (1-1.5h)

### Week 2: Frontend Development (4-5 hours)
- Day 1: Setup types, API client, and basic page (1.5h)
- Day 2: Implement graph visualization (2-2.5h)
- Day 3: Add detail panels and polish (1-1.5h)

### Week 3: Testing & Documentation (2-3 hours)
- Day 1: Backend and frontend testing (2h)
- Day 2: Documentation and user guide (1h)

**Total**: 9-12 hours over 3 weeks (or 2-3 focused days)

## Dependencies and Prerequisites

### Required
- ✅ ClickHouse hybrid patterns system (already implemented)
- ✅ Redis symbol statistics (already implemented)
- ✅ Pattern and symbol data APIs (already implemented)
- ✅ React Query setup (already implemented)

### Nice to Have
- Phase 1 Pattern Editing (already complete) - Provides pattern detail view
- Phase 3 INTRA-Node Graph (deferred) - Provides drill-down capability

### No Blockers
Phase 4 can be implemented immediately with existing infrastructure.

## Risk Mitigation

### Risk: Performance Issues with Large Datasets
**Mitigation**: Implement sampling and caching
- Sample 10k patterns per KB
- Cache graph structure for 5-10 minutes
- Show loading indicators

### Risk: Missing Data (No Patterns/Symbols)
**Mitigation**: Graceful handling
- Check for empty KBs before computation
- Show helpful message if no data
- Provide sample data for testing

### Risk: Complex Graph Visualization
**Mitigation**: Use proven library
- react-force-graph-2d is battle-tested
- Fallback to simpler visualization if needed
- Progressive enhancement approach

## Completion Checklist

### Backend (COMPLETE ✅)
- [x] hierarchy_analysis.py service created
- [x] compute_hierarchy_graph() implemented
- [x] get_connection_details() implemented
- [x] get_pattern_promotion_path() implemented
- [x] API endpoints added to routes.py
- [ ] Backend tests written and passing (DEFERRED)

### Frontend (COMPLETE ✅)
- [x] hierarchy.ts types created
- [x] API client methods added
- [x] HierarchicalGraph.tsx page created
- [x] Graph visualization working
- [x] Node click shows details
- [x] Edge click shows connections
- [x] Color coding by level
- [x] Legend and overview panels
- [x] Routing and navigation added
- [ ] Frontend tests written and passing (DEFERRED to Phase 4C)

### Documentation (IN PROGRESS)
- [ ] CLAUDE.md updated with Phase 4 info
- [ ] User guide written
- [ ] API docs updated
- [ ] SESSION_STATE.md updated
- [ ] PROJECT_OVERVIEW.md updated

### Deployment (COMPLETE ✅)
- [x] Backend tested with real data
- [x] Frontend tested in dev environment
- [x] Performance validated
- [x] Feature complete and ready for use

---

**Status**: Phase 4B Complete - Ready for Phase 4C (Testing & Documentation)
**Next Step**: Phase 4C Testing & Documentation
**Estimated Completion**: 2025-12-12 (1-2 hours remaining)
