import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../lib/api'
import { AlertCircle, RefreshCw, Info, Maximize2, Minimize2, Network } from 'lucide-react'
import ForceGraph2D from 'react-force-graph-2d'
import { computeDagreLayout } from '../utils/graphLayout'

// Pattern node from backend
interface PatternNode {
  id: string
  pattern_name: string
  kb_id: string
  level: number
  length: number
  frequency: number
  label: string
  pattern_data: string[][]
}

// Pattern edge from backend
interface PatternEdge {
  source: string
  target: string
  position: number
  label: string
}

// Pattern graph data from backend
interface PatternGraphData {
  nodes: PatternNode[]
  edges: PatternEdge[]
  statistics: {
    total_nodes: number
    total_edges: number
    origin_pattern: string
    origin_kb: string
  }
}

type LayoutMode = 'force' | 'bu' | 'td' | 'lr' | 'rl' | 'radialout' | 'radialin'

export default function HierarchicalGraph() {
  const [selectedNode, setSelectedNode] = useState<PatternNode | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<PatternEdge | null>(null)
  const [patternInput, setPatternInput] = useState('1e1cbe0a7973d6c6b800a2d1c851809bc265a060') // Default sample pattern
  const [patternToTrace, setPatternToTrace] = useState('1e1cbe0a7973d6c6b800a2d1c851809bc265a060')
  const [maxDepth, setMaxDepth] = useState(5)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('bu')
  const [highlightedPatternId, setHighlightedPatternId] = useState<string | null>(null)
  const [isTracing, setIsTracing] = useState(false)
  const [useDagreLayout] = useState(true) // Enable crossing minimization by default (always on)

  // Accumulated graph data for progressive exploration
  const [accumulatedNodes, setAccumulatedNodes] = useState<Map<string, PatternNode>>(new Map())
  const [accumulatedEdges, setAccumulatedEdges] = useState<Map<string, PatternEdge>>(new Map())
  const [tracedPatternNames, setTracedPatternNames] = useState<Set<string>>(new Set())

  const graphRef = useRef<any>()
  const containerRef = useRef<HTMLDivElement>(null)

  // Fetch pattern trace graph data
  const { data, isLoading, error, refetch } = useQuery<PatternGraphData>({
    queryKey: ['patternGraph', patternToTrace, maxDepth],
    queryFn: () => apiClient.tracePatternGraph(patternToTrace, undefined, maxDepth),
    enabled: patternToTrace.length > 0,
    refetchInterval: false // Don't auto-refresh for pattern graphs
  })

  // Measure container dimensions
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const newWidth = Math.floor(rect.width)
        const newHeight = Math.floor(rect.height)
        if (newWidth > 0 && newHeight > 0) {
          setDimensions({ width: newWidth, height: newHeight })
        }
      }
    }

    // Use setTimeout to ensure container is fully rendered
    const timer = setTimeout(updateDimensions, 100)
    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', updateDimensions)
    }
  }, [isFullscreen, data])

  // Configure D3 forces for better horizontal spacing in DAG mode
  useEffect(() => {
    if (graphRef.current && layoutMode !== 'force' && data) {
      const fg = graphRef.current

      // MUCH stronger charge repulsion for horizontal spreading
      const chargeForce = fg.d3Force('charge')
      if (chargeForce) {
        chargeForce
          .strength(-500)      // Very strong repulsion (was -220)
          .distanceMin(20)
          .distanceMax(800)    // Wider range (was 500)
      }

      // Adjust link forces to allow more movement
      const linkForce = fg.d3Force('link')
      if (linkForce) {
        linkForce
          .distance(100)       // Even longer links (was 80)
          .strength(0.4)       // Weaker pull (was 0.5)
      }

      // Note: Collision detection would further prevent overlap,
      // but very strong charge repulsion should be sufficient

      // Reheat simulation to apply changes
      fg.d3ReheatSimulation()
    }
  }, [layoutMode, data])

  // Level colors (blue → green → yellow → red)
  const getLevelColor = (level: number): string => {
    const colors = [
      '#3b82f6', // blue-500 (node0)
      '#10b981', // green-500 (node1)
      '#f59e0b', // amber-500 (node2)
      '#ef4444', // red-500 (node3)
    ]
    return colors[level] || '#6b7280' // gray-500 fallback
  }

  // Calculate level distance based on container height and number of levels
  const getDagLevelDistance = (): number => {
    const nodes = Array.from(accumulatedNodes.values())
    if (nodes.length === 0 || layoutMode === 'force') return 0

    const maxLevel = Math.max(...nodes.map(n => n.level))
    const numLevels = maxLevel + 1
    const containerHeight = isFullscreen ? window.innerHeight : dimensions.height

    // Use 60-70% of container height divided by levels
    return Math.floor((containerHeight * 0.65) / Math.max(numLevels, 2))
  }

  // Merge new graph data into accumulated state (deduplicates nodes, adds new edges)
  const mergeGraphData = useCallback((newData: PatternGraphData) => {
    setAccumulatedNodes(prev => {
      const updated = new Map(prev)
      newData.nodes.forEach(node => {
        if (!updated.has(node.id)) {
          updated.set(node.id, node)
        }
      })
      return updated
    })

    setAccumulatedEdges(prev => {
      const updated = new Map(prev)
      newData.edges.forEach(edge => {
        const edgeKey = `${edge.source}-${edge.target}`
        if (!updated.has(edgeKey)) {
          updated.set(edgeKey, edge)
        }
      })
      return updated
    })
  }, [])

  // Handle initial trace: populate accumulated data when query returns
  useEffect(() => {
    if (data && !isLoading && !error) {
      // Clear previous accumulated data for new initial trace
      setAccumulatedNodes(new Map(data.nodes.map(n => [n.id, n])))
      setAccumulatedEdges(new Map(data.edges.map(e => [`${e.source}-${e.target}`, e])))
      setTracedPatternNames(new Set([patternToTrace]))
    }
  }, [data, isLoading, error, patternToTrace])

  // Handle tracing from a selected node
  const handleTraceFromNode = async (patternName: string) => {
    setIsTracing(true)
    try {
      const newData = await apiClient.tracePatternGraph(patternName, undefined, maxDepth)
      mergeGraphData(newData)
      setTracedPatternNames(prev => new Set([...prev, patternName]))
    } catch (err) {
      console.error('Failed to trace pattern:', err)
    } finally {
      setIsTracing(false)
    }
  }

  // Get highlighted elements (nodes and edges connected to selected pattern)
  const getHighlightedElements = useCallback(() => {
    if (!highlightedPatternId) return { nodeIds: new Set<string>(), edgeKeys: new Set<string>() }

    const nodeIds = new Set<string>([highlightedPatternId])
    const edgeKeys = new Set<string>()
    const edges = Array.from(accumulatedEdges.values())

    // Find all directly connected edges and nodes
    edges.forEach(edge => {
      if (edge.source === highlightedPatternId || edge.target === highlightedPatternId) {
        const edgeKey = `${edge.source}-${edge.target}`
        edgeKeys.add(edgeKey)
        nodeIds.add(edge.source)
        nodeIds.add(edge.target)
      }
    })

    return { nodeIds, edgeKeys }
  }, [highlightedPatternId, accumulatedEdges])

  const highlighted = getHighlightedElements()

  // Transform accumulated data for force graph
  const baseGraphData = {
    nodes: Array.from(accumulatedNodes.values()).map(node => ({
      ...node,
      name: node.label,
      color: highlighted.nodeIds.has(node.id) ? '#f59e0b' : getLevelColor(node.level) // Amber for highlighted
    })),
    links: Array.from(accumulatedEdges.values()).map(edge => ({
      source: edge.source,
      target: edge.target,
      position: edge.position,
      label: edge.label,
      highlighted: highlighted.edgeKeys.has(`${edge.source}-${edge.target}`)
    }))
  }

  // Apply dagre layout for crossing minimization when enabled
  const graphData = useMemo(() => {
    if (!useDagreLayout || layoutMode === 'force' || baseGraphData.nodes.length === 0) {
      return baseGraphData
    }

    // Map layoutMode to dagre rankDir
    const rankDirMap: Record<LayoutMode, 'TB' | 'BT' | 'LR' | 'RL'> = {
      'bu': 'BT',  // Bottom-up
      'td': 'TB',  // Top-down
      'lr': 'LR',  // Left-right
      'rl': 'RL',  // Right-left
      'radialout': 'BT',  // Fallback to hierarchical
      'radialin': 'BT',   // Fallback to hierarchical
      'force': 'BT'       // Won't be used
    }

    return computeDagreLayout(baseGraphData.nodes, baseGraphData.links, {
      rankDir: rankDirMap[layoutMode],
      ranker: 'network-simplex',  // Best for crossing minimization
      nodesep: 27,                // Horizontal spacing between nodes (1/3rd of original 80)
      ranksep: getDagLevelDistance() || 120,  // Vertical spacing (use calculated or default)
      edgesep: 10
    })
  }, [baseGraphData, layoutMode, useDagreLayout])

  const handleNodeClick = useCallback((node: any) => {
    const fullNode = accumulatedNodes.get(node.id)
    if (fullNode) {
      setSelectedNode(fullNode)
      setSelectedEdge(null)
      setHighlightedPatternId(node.id)
    }
  }, [accumulatedNodes])

  const handleLinkClick = useCallback((link: any) => {
    const edgeKey = `${link.source.id || link.source}-${link.target.id || link.target}`
    const fullEdge = accumulatedEdges.get(edgeKey)
    if (fullEdge) {
      setSelectedEdge(fullEdge)
      setSelectedNode(null)
      setHighlightedPatternId(null)
    }
  }, [accumulatedEdges])

  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null)
    setSelectedEdge(null)
    setHighlightedPatternId(null)
  }, [])

  const handleTracePattern = () => {
    if (patternInput.trim()) {
      setPatternToTrace(patternInput.trim())
    }
  }

  return (
    <div className="p-6 max-w-full">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Pattern Composition Graph
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Trace pattern compositional relationships through the hierarchy
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Statistics */}
      {accumulatedNodes.size > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-600 dark:text-gray-400">Total Patterns</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {accumulatedNodes.size}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-600 dark:text-gray-400">Connections</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {accumulatedEdges.size}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-600 dark:text-gray-400">Patterns Traced</div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {tracedPatternNames.size}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-600 dark:text-gray-400">Origin Pattern</div>
            <div className="text-sm font-mono text-gray-900 dark:text-white truncate">
              {patternToTrace.substring(0, 16)}...
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="mb-4 flex gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Pattern Name (hash without PTRN| prefix)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={patternInput}
              onChange={(e) => setPatternInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleTracePattern()}
              placeholder="Enter pattern name (e.g., 1e1cbe0a7973d6c6b800a2d1c851809bc265a060)"
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleTracePattern}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Trace
            </button>
          </div>
        </div>
        <div className="w-48">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Max Depth
          </label>
          <select
            value={maxDepth}
            onChange={(e) => setMaxDepth(parseInt(e.target.value))}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
          </select>
        </div>
        <div className="w-56">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Layout
          </label>
          <select
            value={layoutMode}
            onChange={(e) => setLayoutMode(e.target.value as LayoutMode)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="force">Force-Directed</option>
            <option value="bu">Hierarchical (Bottom-Up)</option>
            <option value="td">Hierarchical (Top-Down)</option>
            <option value="lr">Hierarchical (Left-Right)</option>
            <option value="rl">Hierarchical (Right-Left)</option>
            <option value="radialout">Radial (Outward)</option>
            <option value="radialin">Radial (Inward)</option>
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors flex items-center gap-2"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            {isFullscreen ? 'Exit' : 'Fullscreen'}
          </button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center h-96 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="text-center">
            <RefreshCw className="w-12 h-12 text-blue-600 dark:text-blue-400 animate-spin mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Tracing pattern composition...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-lg font-medium text-red-800 dark:text-red-300 mb-1">
                Failed to trace pattern
              </h3>
              <p className="text-red-700 dark:text-red-400">
                {error instanceof Error ? error.message : 'Unknown error occurred'}
              </p>
              <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                Make sure the pattern name is valid (hash without PTRN| prefix)
              </p>
              <button
                onClick={() => refetch()}
                className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Graph Visualization */}
      {!isLoading && !error && data && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Graph Canvas */}
          <div className={`${isFullscreen ? 'fixed inset-0 z-50 col-span-3' : 'lg:col-span-2'}`}>
            <div
              ref={containerRef}
              className={`relative bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden ${isFullscreen ? 'h-full w-full' : 'h-[600px] w-full'}`}
            >
              <div className="force-graph-container">
                <ForceGraph2D
                  key={`${dimensions.width}-${dimensions.height}-${layoutMode}-${useDagreLayout}`}
                  ref={graphRef}
                  graphData={graphData}
                  width={isFullscreen ? window.innerWidth : dimensions.width}
                  height={isFullscreen ? window.innerHeight : dimensions.height}
                  dagMode={useDagreLayout ? undefined : (layoutMode === 'force' ? undefined : layoutMode)}
                  dagLevelDistance={useDagreLayout ? undefined : (layoutMode === 'force' ? undefined : getDagLevelDistance())}
                  nodeLabel="label"
                  nodeColor="color"
                  nodeRelSize={6}
                  nodeVal={(node: any) => Math.log(node.frequency + 1) + 2}
                  linkLabel={(link: any) => link.label || ''}
                  linkWidth={(link: any) => link.highlighted ? 4 : 2}
                  linkDirectionalArrowLength={6}
                  linkDirectionalArrowRelPos={1}
                  linkColor={(link: any) => link.highlighted ? '#f59e0b' : '#9ca3af'}
                  onNodeClick={handleNodeClick}
                  onLinkClick={handleLinkClick}
                  onBackgroundClick={handleBackgroundClick}
                  enableNodeDrag={!useDagreLayout}
                  enableZoomInteraction={true}
                  enablePanInteraction={true}
                  warmupTicks={useDagreLayout ? 0 : (layoutMode === 'force' ? 0 : 200)}
                  cooldownTicks={useDagreLayout ? 0 : (layoutMode === 'force' ? 100 : 100)}
                  d3VelocityDecay={0.3}
                />
              </div>
            </div>
          </div>

          {/* Details Panel */}
          {!isFullscreen && (
            <div className="lg:col-span-1">
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 sticky top-6 max-h-[600px] overflow-y-auto">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                  Details
                </h2>

                {!selectedNode && !selectedEdge && (
                  <div className="text-center py-8">
                    <Info className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600 dark:text-gray-400 text-sm">
                      Click on a pattern or connection to view details
                    </p>
                  </div>
                )}

                {selectedNode && (
                  <div className="space-y-4">
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Pattern Name</div>
                      <div className="text-xs font-mono text-gray-900 dark:text-white break-all bg-gray-100 dark:bg-gray-700 p-2 rounded">
                        {selectedNode.pattern_name}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Knowledge Base</div>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: getLevelColor(selectedNode.level) }}
                        />
                        <span className="text-gray-900 dark:text-white font-semibold">{selectedNode.kb_id}</span>
                        <span className="text-gray-500 dark:text-gray-400 text-sm">(Level {selectedNode.level})</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Frequency</div>
                      <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                        {selectedNode.frequency.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Length</div>
                      <div className="text-gray-900 dark:text-white">
                        {selectedNode.length} symbols
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Composition</div>
                      <div className="text-xs font-mono bg-gray-100 dark:bg-gray-700 p-3 rounded max-h-48 overflow-y-auto">
                        {selectedNode.pattern_data.map((item, i) => (
                          <div key={i} className="text-gray-700 dark:text-gray-300 mb-1">
                            [{i}]: {item[0]}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Trace This Pattern Button */}
                    <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                      <button
                        onClick={() => handleTraceFromNode(selectedNode.pattern_name)}
                        disabled={isTracing || tracedPatternNames.has(selectedNode.pattern_name)}
                        className={`w-full px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                          tracedPatternNames.has(selectedNode.pattern_name)
                            ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        {isTracing ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Tracing...
                          </>
                        ) : tracedPatternNames.has(selectedNode.pattern_name) ? (
                          'Already Traced'
                        ) : (
                          <>
                            <Network className="w-4 h-4" />
                            Trace This Pattern
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {selectedEdge && (
                  <div className="space-y-4">
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Connection</div>
                      <div className="text-sm font-mono text-gray-900 dark:text-white break-all bg-gray-100 dark:bg-gray-700 p-2 rounded">
                        {selectedEdge.source}
                        <div className="text-center my-1">↓</div>
                        {selectedEdge.target}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Position in Sequence</div>
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {selectedEdge.position}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        This pattern appears at position {selectedEdge.position} in the target pattern
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      {!isLoading && !error && data && (
        <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Legend</h3>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: getLevelColor(0) }} />
              <span className="text-sm text-gray-600 dark:text-gray-400">Level 0 (Phrases - Base Tokens)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: getLevelColor(1) }} />
              <span className="text-sm text-gray-600 dark:text-gray-400">Level 1 (Sentences)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: getLevelColor(2) }} />
              <span className="text-sm text-gray-600 dark:text-gray-400">Level 2 (Paragraphs)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: getLevelColor(3) }} />
              <span className="text-sm text-gray-600 dark:text-gray-400">Level 3 (Documents)</span>
            </div>
          </div>
          <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Node size represents frequency (logarithmic scale). Arrows show compositional direction.
          </div>
        </div>
      )}
    </div>
  )
}
