# Phase 2: Vector Visualization (DEFERRED)

**Status**: DEFERRED - Requirements Captured
**Priority**: Medium (after Phase 4)
**Estimated Timeline**: 12-15 hours
**Date Created**: 2025-12-09
**Deferred By**: ADR-016 (Phase 4 Prioritization Decision)

## Overview

Phase 2 implements vector visualization capabilities for KATO pattern embeddings using dimensionality reduction techniques (t-SNE/UMAP). This allows users to explore high-dimensional pattern embeddings in 2D/3D space and discover clusters, outliers, and relationships.

## Strategic Context

### Why Deferred
- **Lower priority than Phase 4**: Hierarchical graph visualization (Phase 4) provides more strategic value
- **Independent feature**: Can be implemented anytime without dependencies
- **User preference**: User explicitly prioritized hierarchical visualization first

### Future Value
- **Pattern exploration**: Visual discovery of pattern clusters and relationships
- **Quality assessment**: Identify outliers and anomalies in embeddings
- **Hierarchy integration**: Color embeddings by hierarchy level (from Phase 4 data)
- **Research tool**: Useful for understanding KATO's learned representations

## Requirements (Captured for Future Implementation)

### Backend Requirements

#### 1. Vector Computation Service
**File**: `backend/app/services/vector_analysis.py` (NEW FILE)

```python
class VectorAnalysisService:
    """Service for vector embeddings analysis and dimensionality reduction."""

    async def get_embeddings(self, kb_id: str, limit: int = 1000) -> List[Dict]:
        """Fetch pattern embeddings from Qdrant."""
        pass

    async def compute_tsne(self, embeddings: np.ndarray,
                          perplexity: int = 30,
                          dimensions: int = 2) -> np.ndarray:
        """Compute t-SNE dimensionality reduction."""
        pass

    async def compute_umap(self, embeddings: np.ndarray,
                          n_neighbors: int = 15,
                          dimensions: int = 2) -> np.ndarray:
        """Compute UMAP dimensionality reduction."""
        pass

    async def detect_clusters(self, reduced_embeddings: np.ndarray,
                            method: str = "dbscan") -> np.ndarray:
        """Detect clusters in reduced embedding space."""
        pass
```

#### 2. API Endpoints
**File**: `backend/app/api/routes.py` (MODIFY)

```python
# Vector Visualization Endpoints
@router.get("/analytics/vectors/{kb_id}/embeddings")
async def get_vector_embeddings(
    kb_id: str,
    limit: int = 1000,
    sample: bool = True
) -> Dict[str, Any]:
    """
    Get pattern embeddings for visualization.

    Returns:
    - pattern_names: List[str]
    - embeddings: List[List[float]]  # High-dimensional vectors
    - metadata: Dict (length, frequency, etc.)
    """
    pass

@router.post("/analytics/vectors/{kb_id}/reduce")
async def reduce_dimensions(
    kb_id: str,
    method: str = "tsne",  # or "umap"
    dimensions: int = 2,   # 2 or 3
    perplexity: int = 30,  # t-SNE parameter
    n_neighbors: int = 15  # UMAP parameter
) -> Dict[str, Any]:
    """
    Apply dimensionality reduction to embeddings.

    Returns:
    - reduced_embeddings: List[List[float]]  # 2D or 3D coordinates
    - method: str
    - parameters: Dict
    """
    pass

@router.post("/analytics/vectors/{kb_id}/clusters")
async def detect_clusters(
    kb_id: str,
    method: str = "dbscan",
    eps: float = 0.5,
    min_samples: int = 5
) -> Dict[str, Any]:
    """
    Detect clusters in reduced embedding space.

    Returns:
    - cluster_labels: List[int]  # -1 for noise
    - cluster_sizes: Dict[int, int]
    - cluster_centers: List[List[float]]
    """
    pass
```

#### 3. Dependencies
**File**: `backend/requirements.txt` (ADD)

```
scikit-learn>=1.3.0      # t-SNE, DBSCAN
umap-learn>=0.5.0        # UMAP dimensionality reduction
numpy>=1.24.0            # Array operations
```

### Frontend Requirements

#### 1. Vector Visualization Page
**File**: `frontend/src/pages/VectorVisualization.tsx` (NEW FILE)

```typescript
interface VectorVisualizationProps {
  // Component for exploring pattern embeddings in 2D/3D space
}

Components:
- KnowledgebaseSelector (choose which KB to visualize)
- MethodSelector (t-SNE vs UMAP)
- ParameterControls (perplexity, n_neighbors, etc.)
- DimensionToggle (2D vs 3D)
- ScatterPlot2D (using recharts or D3.js)
- ScatterPlot3D (using react-three-fiber)
- ClusterControls (enable/disable clustering, algorithm selection)
- PatternTooltip (hover to see pattern details)
- LegendPanel (cluster colors, hierarchy levels)
```

#### 2. API Client Methods
**File**: `frontend/src/lib/api.ts` (ADD)

```typescript
class ApiClient {
  async getVectorEmbeddings(kbId: string, limit?: number): Promise<VectorEmbeddings> {
    // Fetch embeddings from Qdrant via backend
  }

  async reduceDimensions(
    kbId: string,
    method: 'tsne' | 'umap',
    dimensions: 2 | 3,
    parameters: ReduceParams
  ): Promise<ReducedEmbeddings> {
    // Apply dimensionality reduction
  }

  async detectClusters(
    kbId: string,
    method: 'dbscan' | 'kmeans',
    parameters: ClusterParams
  ): Promise<ClusterResult> {
    // Detect clusters in embedding space
  }
}
```

#### 3. Visualization Components

**2D Scatter Plot** (using D3.js):
```typescript
interface ScatterPlot2DProps {
  data: Array<{x: number, y: number, name: string, cluster: number}>
  colorScheme: ColorScale
  onPointClick: (pattern: Pattern) => void
  onPointHover: (pattern: Pattern | null) => void
}
```

**3D Scatter Plot** (using react-three-fiber):
```typescript
interface ScatterPlot3DProps {
  data: Array<{x: number, y: number, z: number, name: string, cluster: number}>
  colorScheme: ColorScale
  cameraControls: boolean
  onPointClick: (pattern: Pattern) => void
}
```

#### 4. Dependencies
**File**: `frontend/package.json` (ADD)

```json
{
  "dependencies": {
    "d3": "^7.8.5",
    "@types/d3": "^7.4.0",
    "@react-three/fiber": "^8.15.0",
    "@react-three/drei": "^9.88.0",
    "three": "^0.158.0"
  }
}
```

## Feature Breakdown

### Core Features (MVP)
1. **2D Visualization** (t-SNE/UMAP)
   - Scatter plot with pattern points
   - Color by cluster or hierarchy level
   - Zoom/pan interactions
   - Hover tooltips

2. **Parameter Controls**
   - Method selection (t-SNE/UMAP)
   - Perplexity slider (t-SNE)
   - n_neighbors slider (UMAP)
   - Dimension toggle (2D/3D)

3. **Pattern Details**
   - Click point to see full pattern
   - Show nearest neighbors
   - Display metadata

### Advanced Features (Nice-to-Have)
1. **3D Visualization**
   - Interactive 3D scatter plot
   - Camera controls (rotate, zoom)
   - Better for complex relationships

2. **Clustering**
   - Automatic cluster detection (DBSCAN/k-means)
   - Cluster labeling and coloring
   - Cluster statistics

3. **Search and Filter**
   - Find pattern by name
   - Filter by cluster
   - Filter by hierarchy level (from Phase 4)

4. **Export**
   - Export reduced embeddings as CSV
   - Export visualization as PNG/SVG
   - Export clusters as JSON

## Integration with Phase 4

### Hierarchy-Based Coloring
Once Phase 4 is complete, vector visualizations can color patterns by hierarchy level:
- **node0 patterns**: Blue (phrases)
- **node1 patterns**: Green (sentences)
- **node2 patterns**: Yellow (paragraphs)
- **node3 patterns**: Red (documents)

This shows how semantic abstraction correlates with embedding space structure.

### Navigation
- Click pattern in Phase 4 hierarchical graph → open vector visualization filtered to that KB
- Click pattern in vector visualization → highlight in hierarchical graph

## Performance Considerations

### Scalability
- **Sampling**: Limit to 1000-10000 patterns for visualization
- **Backend computation**: Run t-SNE/UMAP on backend (CPU-intensive)
- **Caching**: Cache reduced embeddings for 5 minutes
- **Progressive loading**: Show loading state during computation

### User Experience
- **Computation time**: t-SNE can take 10-30 seconds for 10k points
- **Loading indicators**: Progress bar during dimensionality reduction
- **Fallback**: Offer 2D only if 3D performance is poor

## Technical Decisions

### t-SNE vs UMAP
- **t-SNE**: Better for local structure, slower (O(n²))
- **UMAP**: Better for global structure, faster (O(n log n))
- **Decision**: Support both, default to UMAP for speed

### 2D vs 3D
- **2D**: Easier to interpret, works on all devices
- **3D**: More information, better for complex relationships
- **Decision**: Default to 2D, offer 3D as option

### Client vs Server Computation
- **Server**: Can handle large datasets, doesn't block UI
- **Client**: Instant updates, no backend load
- **Decision**: Server-side computation for MVP

## Testing Plan (When Implemented)

### Backend Tests
```python
# test_vector_analysis.py
def test_compute_tsne():
    # Test t-SNE dimensionality reduction
    pass

def test_compute_umap():
    # Test UMAP dimensionality reduction
    pass

def test_detect_clusters():
    # Test DBSCAN clustering
    pass
```

### Frontend Tests
```typescript
// VectorVisualization.test.tsx
describe('VectorVisualization', () => {
  it('renders scatter plot with data', () => {})
  it('updates on parameter change', () => {})
  it('shows tooltip on hover', () => {})
  it('handles point click', () => {})
})
```

## Documentation (When Implemented)

### User Guide
- How to interpret t-SNE/UMAP plots
- What parameters affect visualization
- How to find patterns and clusters
- Integration with hierarchical graph

### API Documentation
- OpenAPI schema for vector endpoints
- Example requests/responses
- Parameter descriptions

## Estimated Timeline

When this phase is resumed:
- **Backend service**: 4-5 hours
  - Vector computation (2h)
  - API endpoints (1.5h)
  - Testing (0.5h)

- **Frontend components**: 6-7 hours
  - 2D scatter plot (2h)
  - 3D scatter plot (2h)
  - Controls and UI (1.5h)
  - Integration (0.5h)
  - Testing (1h)

- **Integration & Polish**: 2-3 hours
  - Phase 4 integration (1h)
  - Performance optimization (1h)
  - Documentation (1h)

**Total**: 12-15 hours

## Resumption Checklist

When ready to implement Phase 2:
- [ ] Review this document and update requirements
- [ ] Verify Phase 4 is complete (for hierarchy integration)
- [ ] Install backend dependencies (scikit-learn, umap-learn)
- [ ] Install frontend dependencies (d3, react-three-fiber)
- [ ] Create backend service file
- [ ] Create frontend page and components
- [ ] Implement API endpoints
- [ ] Test with real KATO data
- [ ] Integrate with Phase 4 hierarchical graph
- [ ] Document feature in CLAUDE.md
- [ ] Update PROJECT_OVERVIEW.md

## Related Documents
- ADR-016: Phase 4 Prioritization Decision
- phase4-hierarchical-graph-active.md: Current focus
- phase3-intra-node-graph-deferred.md: Also deferred

---

**Note**: This document captures complete requirements for Phase 2 implementation. When ready to resume, review and update based on any changes to KATO architecture or user needs.
