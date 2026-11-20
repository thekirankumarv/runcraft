import dagre from '@dagrejs/dagre'
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
} from '@xyflow/react'
import { LayoutGrid, Maximize, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { isLive, saveConfig, select, useStore } from '../lib/store'
import { useTheme } from '../lib/theme'
import type { ServiceConfig } from '../lib/types'
import Onboarding from './Onboarding'
import ServiceNode, { NODE_H, NODE_W } from './ServiceNode'
import { Button } from './ui'

const nodeTypes = { service: ServiceNode }

export function autoLayout(services: ServiceConfig[]) {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 36, ranksep: 120 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const s of services) g.setNode(s.id, { width: NODE_W, height: NODE_H })
  for (const s of services) for (const d of s.dependsOn ?? []) g.setEdge(d, s.id)
  dagre.layout(g)
  return services.map((s) => {
    const n = g.node(s.id)
    return { ...s, position: { x: Math.round(n.x - NODE_W / 2), y: Math.round(n.y - NODE_H / 2) } }
  })
}

export function arrange() {
  const cfg = useStore.getState().config
  if (cfg) saveConfig({ ...cfg, services: autoLayout(cfg.services) })
}

// New services go to the right of the existing layout instead of reshuffling it.
function placeMissing(services: ServiceConfig[]) {
  if (services.every((s) => !s.position)) return autoLayout(services)
  const placed = services.filter((s) => s.position)
  const x = Math.max(...placed.map((s) => s.position!.x)) + NODE_W + 120
  const y = Math.min(...placed.map((s) => s.position!.y))
  let i = 0
  return services.map((s) => (s.position ? s : { ...s, position: { x, y: y + i++ * (NODE_H + 36) } }))
}

function Flow() {
  const config = useStore((s) => s.config)
  const pid = useStore((s) => s.pid)
  const selected = useStore((s) => s.selected)
  const services = useStore((s) => s.services)
  const flow = useReactFlow()
  const theme = useTheme((s) => s.theme)
  const [nodes, setNodes] = useState<Node[]>([])

  useEffect(() => {
    if (!config) return
    if (config.services.some((s) => !s.position)) {
      saveConfig({ ...config, services: placeMissing(config.services) })
      return
    }
    setNodes((prev) =>
      config.services.map((s) => {
        const old = prev.find((n) => n.id === s.id)
        return { id: s.id, type: 'service', position: old?.dragging ? old.position : s.position!, data: {}, selected: s.id === selected, deletable: false }
      }),
    )
  }, [config, selected])

  useEffect(() => {
    const t = setTimeout(() => flow.fitView({ padding: 0.3, maxZoom: 1.1, duration: 300 }), 50)
    return () => clearTimeout(t)
  }, [pid, flow, config?.services.length])

  const edges: Edge[] = useMemo(
    () =>
      (config?.services ?? []).flatMap((s) =>
        (s.dependsOn ?? []).map((d) => {
          const flowing = isLive(services[d]) && isLive(services[s.id])
          return {
            id: `${d}->${s.id}`,
            source: d,
            target: s.id,
            animated: flowing,
            style: { stroke: flowing ? '#22c55e88' : '#8a8a9a80', strokeWidth: 1.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color: flowing ? '#22c55e88' : '#8a8a9a80', width: 16, height: 16 },
          }
        }),
      ),
    [config, services],
  )

  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((ns) => applyNodeChanges(changes, ns)), [])

  const onDragStop = useCallback((_: unknown, __: Node, dragged: Node[]) => {
    const cfg = useStore.getState().config!
    const pos = new Map(dragged.map((n) => [n.id, { x: Math.round(n.position.x), y: Math.round(n.position.y) }]))
    saveConfig({ ...cfg, services: cfg.services.map((s) => (pos.has(s.id) ? { ...s, position: pos.get(s.id) } : s)) }, { debounce: true })
  }, [])

  const onConnect = useCallback((c: Connection) => {
    const cfg = useStore.getState().config!
    if (c.source === c.target) return
    saveConfig({ ...cfg, services: cfg.services.map((s) => (s.id === c.target ? { ...s, dependsOn: [...new Set([...(s.dependsOn ?? []), c.source])] } : s)) })
  }, [])

  const onEdgesDelete = useCallback((removed: Edge[]) => {
    const cfg = useStore.getState().config!
    saveConfig({
      ...cfg,
      services: cfg.services.map((s) => ({ ...s, dependsOn: s.dependsOn?.filter((d) => !removed.some((e) => e.source === d && e.target === s.id)) })),
    })
  }, [])

  if (config && !config.services.length) return <Onboarding />

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStop={onDragStop}
      onConnect={onConnect}
      onEdgesDelete={onEdgesDelete}
      onNodeClick={(_, n) => select(n.id)}
      onPaneClick={() => select(undefined)}
      fitView
      fitViewOptions={{ padding: 0.3, maxZoom: 1.1 }}
      minZoom={0.3}
      maxZoom={1.6}
      proOptions={{ hideAttribution: true }}
      colorMode={theme}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="var(--color-dots)" />
      <Controls showInteractive={false} position="bottom-right" />
      <Panel position="bottom-left" className="flex gap-1.5">
        <Button onClick={() => useStore.setState({ dialog: 'add' })}>
          <Plus size={14} /> Add service
        </Button>
        <Button onClick={arrange} title="Auto-arrange">
          <LayoutGrid size={14} /> Arrange
        </Button>
        <Button onClick={() => flow.fitView({ padding: 0.3, maxZoom: 1.1, duration: 300 })} title="Fit to screen">
          <Maximize size={14} />
        </Button>
      </Panel>
    </ReactFlow>
  )
}

export default function Canvas() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  )
}
