# Phase 3: INTRA-Node Graph Analysis (DEFERRED)

**Status**: DEFERRED - Requirements Captured
**Priority**: Medium (after Phase 4)
**Estimated Timeline**: 10-12 hours
**Date Created**: 2025-12-09
**Deferred By**: ADR-016 (Phase 4 Prioritization Decision)

## Overview

Phase 3 implements graph analysis within a single knowledgebase (INTRA-node), visualizing relationships between patterns and symbols. This reveals co-occurrence patterns, sequential relationships, and symbol usage statistics within a specific hierarchy level.

## Strategic Context

### Why Deferred
- **Lower priority than Phase 4**: INTER-node hierarchical graph provides broader architectural insight
- **Complementary to Phase 4**: Drills down into details after Phase 4 shows big picture
- **User preference**: User explicitly prioritized cross-node hierarchy visualization first

### Future Value
- **Detail exploration**: Drill into individual KB after seeing hierarchy overview
- **Pattern relationships**: Discover which patterns frequently occur together
- **Symbol usage**: Understand how symbols are used within patterns
- **Quality insights**: Identify orphaned patterns, heavily-used symbols, etc.

## Requirements (Captured for Future Implementation)

### Backend Requirements

#### 1. Graph Analysis Service
**File**: `backend/app/services/graph_analysis.py` (NEW FILE)

```python
class GraphAnalysisService:
    """Service for analyzing pattern-symbol relationships within a KB."""

    async def analyze_symbol_cooccurrence(
        self,
        kb_id: str,
        min_frequency: int = 2
    ) -> Dict[str, Any]:
        """
        Analyze which symbols appear together in patterns.

        Returns:
        {
            "nodes": [{"id": "symbol", "frequency": int}, ...],
            "edges": [{"source": "sym1", "target": "sym2", "weight": int}, ...]
        }
        """
        pass

    async def analyze_sequential_relationships(
        self,
        kb_id: str,
        window_size: int = 2
    ) -> Dict[str, Any]:
        """
        Analyze sequential symbol relationships (bigrams, trigrams).

        Returns:
        {
            "sequences": [
                {"sequence": ["sym1", "sym2"], "count": int},
                ...
            ]
        }
        """
        pass

    async def get_pattern_neighbors(
        self,
        kb_id: str,
        pattern_name: str,
        threshold: float = 0.5
    ) -> List[Dict]:
        """
        Find patterns with similar symbol composition.

        Returns:
        [
            {"pattern_name": str, "similarity": float, "shared_symbols": List[str]},
            ...
        ]
        """
        pass

    async def get_symbol_statistics(
        self,
        kb_id: str,
        symbol: str
    ) -> Dict[str, Any]:
        """
        Get detailed statistics for a specific symbol.

        Returns:
        {
            "symbol": str,
            "total_occurrences": int,
            "unique_patterns": int,
            "average_position": float,
            "pattern_examples": List[str]
        }
        """
        pass
```

#### 2. API Endpoints
**File**: `backend/app/api/routes.py` (MODIFY)

```python
# INTRA-Node Graph Analysis Endpoints
@router.get("/analytics/graphs/intra/{kb_id}/cooccurrence")
async def get_symbol_cooccurrence(
    kb_id: str,
    min_frequency: int = 2,
    limit: int = 100
) -> Dict[str, Any]:
    """
    Get symbol co-occurrence graph for a knowledgebase.

    Returns network graph where:
    - Nodes: Symbols
    - Edges: Co-occurrence frequency
    - Edge weight: Number of patterns containing both symbols
    """
    pass

@router.get("/analytics/graphs/intra/{kb_id}/sequences")
async def get_sequential_relationships(
    kb_id: str,
    window_size: int = 2,
    limit: int = 50
) -> Dict[str, Any]:
    """
    Get sequential symbol relationships (N-grams).

    Returns:
    - sequences: List of symbol sequences with frequencies
    - transitions: Directed graph of symbol transitions
    """
    pass

@router.get("/analytics/graphs/intra/{kb_id}/patterns/{pattern_name}/neighbors")
async def get_pattern_neighbors(
    kb_id: str,
    pattern_name: str,
    threshold: float = 0.5,
    limit: int = 20
) -> Dict[str, Any]:
    """
    Find patterns with similar symbol composition.

    Returns:
    - neighbors: List of similar patterns
    - similarity_scores: Jaccard similarity based on symbols
    """
    pass

@router.get("/analytics/graphs/intra/{kb_id}/symbols/{symbol}/stats")
async def get_symbol_statistics(
    kb_id: str,
    symbol: str
) -> Dict[str, Any]:
    """
    Get detailed statistics for a specific symbol within a KB.

    Returns:
    - occurrence_count: int
    - unique_patterns: int
    - position_distribution: List[int]
    - pattern_examples: List[PatternSummary]
    """
    pass
```

#### 3. Graph Algorithms

**Symbol Co-occurrence**:
```python
# For each pattern in KB:
#   - Extract symbols from pattern_data
#   - Create edges between all symbol pairs
#   - Increment edge weights

# Result: Undirected weighted graph
```

**Sequential Relationships**:
```python
# For each pattern in KB:
#   - Extract symbols in order
#   - Create directed edges for consecutive symbols
#   - Count transitions

# Result: Directed weighted graph (Markov chain)
```

**Pattern Similarity**:
```python
# For given pattern:
#   - Extract its symbols (set A)
#   - For each other pattern:
#       - Extract its symbols (set B)
#       - Compute Jaccard similarity: |A ∩ B| / |A ∪ B|
#   - Return top K most similar

# Result: List of (pattern, similarity_score)
```

### Frontend Requirements

#### 1. INTRA-Node Graph Page
**File**: `frontend/src/pages/IntraNodeGraph.tsx` (NEW FILE)

```typescript
interface IntraNodeGraphProps {
  // Component for exploring relationships within a single KB
}

Components:
- KnowledgebaseSelector (choose which KB to analyze)
- GraphTypeSelector (co-occurrence, sequential, similarity)
- NetworkGraph (force-directed layout)
- NodeDetailPanel (symbol or pattern details)
- EdgeDetailPanel (relationship details)
- FilterControls (min frequency, similarity threshold)
- StatisticsPanel (graph metrics: density, clusters, etc.)
- SearchBar (find symbol or pattern)
```

#### 2. Graph Visualization Component
**File**: `frontend/src/components/NetworkGraph.tsx` (NEW FILE)

```typescript
interface NetworkGraphProps {
  nodes: Array<{id: string, label: string, size: number, color: string}>
  edges: Array<{source: string, target: string, weight: number}>
  layout: 'force-directed' | 'hierarchical' | 'circular'
  onNodeClick: (node: Node) => void
  onEdgeClick: (edge: Edge) => void
  highlightedNodes?: string[]
}

// Use react-force-graph or D3.js for implementation
```

#### 3. API Client Methods
**File**: `frontend/src/lib/api.ts` (ADD)

```typescript
class ApiClient {
  async getSymbolCooccurrence(
    kbId: string,
    minFrequency?: number,
    limit?: number
  ): Promise<CooccurrenceGraph> {
    // Fetch co-occurrence graph
  }

  async getSequentialRelationships(
    kbId: string,
    windowSize?: number,
    limit?: number
  ): Promise<SequenceGraph> {
    // Fetch sequential relationships
  }

  async getPatternNeighbors(
    kbId: string,
    patternName: string,
    threshold?: number,
    limit?: number
  ): Promise<SimilarPatterns> {
    // Find similar patterns
  }

  async getSymbolStatistics(
    kbId: string,
    symbol: string
  ): Promise<SymbolStats> {
    // Get symbol details
  }
}
```

#### 4. Graph Visualization Library
**Option 1: react-force-graph** (Recommended)
```typescript
import ForceGraph2D from 'react-force-graph-2d'

<ForceGraph2D
  graphData={graphData}
  nodeLabel="label"
  nodeVal="size"
  linkWidth={link => link.weight}
  onNodeClick={handleNodeClick}
  onLinkClick={handleLinkClick}
/>
```

**Option 2: D3.js** (More control)
```typescript
// Custom D3 implementation for maximum flexibility
import * as d3 from 'd3'

// Implement force simulation with custom styling
```

#### 5. Dependencies
**File**: `frontend/package.json` (ADD)

```json
{
  "dependencies": {
    "react-force-graph-2d": "^1.25.0",
    "react-force-graph-3d": "^1.24.0",
    "d3-force": "^3.0.0",
    "d3-scale": "^4.0.2",
    "@types/d3-force": "^3.0.4"
  }
}
```

## Feature Breakdown

### Core Features (MVP)

1. **Symbol Co-occurrence Graph**
   - Nodes: Symbols used in the KB
   - Edges: Symbols that appear together
   - Edge weight: Co-occurrence frequency
   - Interactive: Click node to see details

2. **Sequential Relationship Graph**
   - Directed graph showing symbol transitions
   - Edge weight: Transition frequency
   - Reveals common symbol sequences

3. **Pattern Similarity Explorer**
   - Find patterns with similar symbol composition
   - Jaccard similarity metric
   - Shows shared and unique symbols

4. **Symbol Statistics Panel**
   - Total occurrences
   - Unique patterns using symbol
   - Position distribution
   - Example patterns

### Advanced Features (Nice-to-Have)

1. **Graph Metrics**
   - Node centrality (most important symbols)
   - Community detection (symbol clusters)
   - Graph density
   - Diameter and average path length

2. **Layout Options**
   - Force-directed (default)
   - Hierarchical (for sequential)
   - Circular (for balanced view)
   - Custom positioning

3. **Filtering and Search**
   - Filter by frequency threshold
   - Search for specific symbol
   - Highlight paths between symbols
   - Hide low-weight edges

4. **Export**
   - Export graph as GraphML/GEXF
   - Export visualization as PNG/SVG
   - Export statistics as CSV

## Integration with Phase 4

### Navigation Flow
1. User views Phase 4 hierarchical graph (INTER-node)
2. User clicks on a knowledgebase node (e.g., "node1_kato")
3. Dashboard navigates to Phase 3 INTRA-node graph for that KB
4. User explores internal symbol relationships

### Drill-Down Example
```
Phase 4 (Hierarchical Graph):
  → See that node0 has 1.2M patterns
  → See that 8,523 node0 patterns become symbols in node1
  → Click node0 knowledgebase

Phase 3 (INTRA-Node Graph):
  → Explore which symbols co-occur in node0 patterns
  → Discover that symbol "X" appears in 50,000 patterns
  → Find that symbols ["A", "B", "C"] frequently appear together
  → See that symbol sequences "A→B→C" are common
```

### Cross-Phase Features
- **Hierarchy context**: Show which symbols from this KB are used in upper levels
- **Promotion highlighting**: Highlight patterns that become symbols in next level
- **Breadcrumb navigation**: Easy return to Phase 4 overview

## Analysis Examples

### Example 1: Symbol Co-occurrence (node0)
```
Symbols: ["the", "cat", "sat", "mat", "dog"]

Co-occurrence Graph:
- Edge("the", "cat"): weight=1500  # "the cat" appears in 1500 patterns
- Edge("cat", "sat"): weight=800   # "cat sat" appears in 800 patterns
- Edge("sat", "mat"): weight=600   # "sat mat" appears in 600 patterns

Insight: "the" and "cat" frequently co-occur (common phrase)
```

### Example 2: Sequential Relationships (node1)
```
Symbol Transitions (directed edges):
- "subject" → "verb": 2000 transitions
- "verb" → "object": 1800 transitions
- "object" → "end": 1500 transitions

Insight: Common sentence structure pattern detected
```

### Example 3: Pattern Similarity (node2)
```
Given pattern: "paragraph_12345"
Symbols: ["sentence_A", "sentence_B", "sentence_C"]

Similar patterns:
1. "paragraph_67890": similarity=0.75 (shares sentence_A, sentence_B)
2. "paragraph_11111": similarity=0.60 (shares sentence_B, sentence_C)
3. "paragraph_22222": similarity=0.40 (shares sentence_C only)

Insight: Find paragraphs with similar topic/structure
```

## Performance Considerations

### Scalability Challenges
- **Large graphs**: node0 might have 100k+ unique symbols
- **Edge explosion**: N symbols can have O(N²) edges
- **Computation time**: Co-occurrence analysis on millions of patterns

### Optimization Strategies
1. **Sampling**: Analyze subset of patterns (configurable)
2. **Frequency thresholds**: Only include symbols above min frequency
3. **Pagination**: Load graph in chunks
4. **Caching**: Cache graph structure for 5-10 minutes
5. **Progressive loading**: Show high-weight edges first

### User Experience
- **Loading indicators**: Progress bar during analysis
- **Incremental rendering**: Show graph as it computes
- **Layout stability**: Use stable graph layouts
- **Zoom and pan**: Handle large graphs with viewport controls

## Technical Decisions

### Graph Representation
**Backend**:
- Compute on demand (not pre-computed)
- Return in standard format (nodes/edges arrays)
- Apply filters before returning to frontend

**Frontend**:
- Use force-directed layout for organic visualization
- Support zoom/pan for large graphs
- Use WebGL rendering for >1000 nodes (react-force-graph)

### Similarity Metric
**Jaccard Similarity**:
```
similarity(A, B) = |A ∩ B| / |A ∪ B|
```
- Range: 0.0 (no overlap) to 1.0 (identical)
- Fast to compute
- Intuitive interpretation

### Graph Layout Algorithm
**Force-Directed** (d3-force):
- Nodes repel each other (charge force)
- Edges pull connected nodes together (link force)
- Results in organic, readable layouts
- Can handle 100-1000 nodes well

## Testing Plan (When Implemented)

### Backend Tests
```python
# test_graph_analysis.py
def test_symbol_cooccurrence():
    # Test co-occurrence calculation
    pass

def test_sequential_relationships():
    # Test sequence detection
    pass

def test_pattern_similarity():
    # Test Jaccard similarity
    pass

def test_symbol_statistics():
    # Test symbol stats aggregation
    pass
```

### Frontend Tests
```typescript
// IntraNodeGraph.test.tsx
describe('IntraNodeGraph', () => {
  it('renders network graph', () => {})
  it('handles node click', () => {})
  it('filters by frequency', () => {})
  it('shows symbol statistics', () => {})
})
```

## Documentation (When Implemented)

### User Guide
- How to interpret co-occurrence graphs
- Understanding sequential relationships
- Finding similar patterns
- Analyzing symbol statistics

### API Documentation
- OpenAPI schema for INTRA-node endpoints
- Example requests/responses
- Algorithm descriptions

## Estimated Timeline

When this phase is resumed:
- **Backend service**: 4-5 hours
  - Co-occurrence analysis (1.5h)
  - Sequential analysis (1.5h)
  - Similarity computation (1h)
  - API endpoints (1h)

- **Frontend components**: 4-5 hours
  - Network graph component (2h)
  - Node/edge detail panels (1h)
  - Filter controls (0.5h)
  - Integration (0.5h)
  - Testing (1h)

- **Integration & Polish**: 2-2 hours
  - Phase 4 integration (1h)
  - Performance optimization (0.5h)
  - Documentation (0.5h)

**Total**: 10-12 hours

## Resumption Checklist

When ready to implement Phase 3:
- [ ] Review this document and update requirements
- [ ] Verify Phase 4 is complete (for drill-down integration)
- [ ] Install backend dependencies (none needed, use existing)
- [ ] Install frontend dependencies (react-force-graph)
- [ ] Create backend service file
- [ ] Create frontend page and components
- [ ] Implement API endpoints
- [ ] Test with real KATO data (especially large KBs)
- [ ] Integrate with Phase 4 navigation
- [ ] Optimize for large graphs (sampling, pagination)
- [ ] Document feature in CLAUDE.md
- [ ] Update PROJECT_OVERVIEW.md

## Related Documents
- ADR-016: Phase 4 Prioritization Decision
- phase4-hierarchical-graph-active.md: Current focus
- phase2-vector-visualization-deferred.md: Also deferred

---

**Note**: This document captures complete requirements for Phase 3 implementation. When ready to resume, review and update based on any changes to KATO architecture, user needs, or insights from Phase 4 implementation.
