# Fork Changes — `@gorules/jdm-editor`

This document describes every change made to the forked `jdm-editor` library relative to the upstream package. All changes are inside `packages/jdm-editor/packages/jdm-editor/src/`.

---

## 1. Input Node Presets (`isInputNode` pattern)

### Problem
The upstream library hard-codes a single `inputNode` (the "Request" node). We needed to let the host app register pre-configured input nodes (e.g. RWA Input, IFRS9 Input) that:
- appear in the toolbar alongside the standard Request node
- create a real `inputNode` (not a custom type) so the Zen engine can simulate it without changes
- render with their own icon and colour in the canvas
- do **not** show the "Configure" button (their schema is fixed)
- obey the same mutual-exclusion rule as the Request node (only one input node allowed)

### Solution — `isInputNode?: boolean` flag on `CustomNodeSpecification`

Instead of adding new node types to the fork, the app registers presets via the existing `customNodes` prop on `<DecisionGraph>`. Setting `isInputNode: true` on a custom node specification opts it into the input-preset behaviour.

---

### Changed files

#### `nodes/custom-node/index.tsx`
Added one optional field to `CustomNodeSpecification`:

```ts
isInputNode?: boolean;
```

When `true`, the toolbar and drag system treat this node as an input preset rather than a regular custom node.

---

#### `nodes/specifications/specification-types.ts`
- Removed `RwaInput = 'rwaInputNode'` and `Ifrs9Input = 'ifrs9InputNode'` from the `NodeKind` enum (these types no longer live in the fork).
- Simplified `INPUT_FAMILY` back to `new Set([NodeKind.Input])`.

```ts
// Before
export const INPUT_FAMILY = new Set<string>([NodeKind.Input, NodeKind.RwaInput, NodeKind.Ifrs9Input]);

// After
export const INPUT_FAMILY = new Set<string>([NodeKind.Input]);
```

---

#### `helpers/schema.ts`
- Removed `rwaInputNodeSchema` and `ifrs9InputNodeSchema` and their entries in the `nodeSchema` discriminated union.
- Added `.passthrough()` to `inputNodeSchema`'s `content` object so that the `_kind` hint written during drag is preserved through Zod parsing:

```ts
content: z.object({
  schema: z.string().nullish().transform((val) => val ?? ''),
}).passthrough().default({ schema: '' }),
```

---

#### `graph/graph-components.tsx`
Two changes to the toolbar renderer:

**1. New `onDragStartInputPreset` handler**

When a preset is dragged, instead of setting `nodeType: "customNode"`, it sets `nodeData` — a fully pre-built `inputNode` JSON with `content._kind` to identify the preset:

```ts
event.dataTransfer.setData('nodeData', JSON.stringify({
  id: crypto.randomUUID(),
  type: 'inputNode',
  name: node.displayName,
  content: {
    schema: node.generateNode({ index: 1 }).config?.schema ?? '',
    _kind: node.kind,
  },
}));
```

The existing `nodeData` drop path in `graph.tsx` handles the rest — it calls `addNodes`, which triggers the `INPUT_FAMILY` replace logic naturally.

**2. `isInputNode` detection in both the `'core'` and `.otherwise()` render paths**

Preset nodes are disabled in the toolbar when any `inputNode` already exists (`inputDisabled`), and they route to `onDragStartInputPreset` instead of the regular drag handler.

---

#### `nodes/specifications/input.specification.tsx`
Patched `renderNode` to apply the preset's visual properties when the node was created from a preset:

```ts
// Read _kind from the full node content in the graph store
const { disabled, customNodes, nodeKind } = useDecisionGraphState(
  ({ disabled, customNodes, decisionGraph }) => ({
    disabled,
    customNodes,
    nodeKind: (decisionGraph?.nodes?.find((n) => n.id === id)?.content as any)?._kind,
  }),
);

// Look up the matching preset
const preset = nodeKind
  ? customNodes.find((n) => n.isInputNode && n.kind === nodeKind)
  : undefined;

// Override colour, icon, displayName if a preset matched
const effectiveSpec = preset
  ? { ...specification, color: preset.color ?? specification.color, icon: preset.icon ?? specification.icon, displayName: preset.displayName }
  : specification;
```

`_kind` is read from `decisionGraph.nodes` (not from ReactFlow's `data` object) because `mapToGraphNode` only maps `name` and `kind` into the ReactFlow `data` field — `content._kind` would otherwise be lost.

The "Configure" button is hidden for preset nodes since their schema is fixed:

```ts
actions={preset ? [] : [<Button onClick={() => graphActions.openTab(id)}>Configure</Button>]}
```

---

#### Deleted files
- `nodes/specifications/rwa-input.specification.tsx`
- `nodes/specifications/ifrs9-input.specification.tsx`

These are replaced by presets defined in the host app.

---

## 2. ReactFlow `nodeTypes` stability fix

### Problem
ReactFlow logged a warning on every render: *"It looks like you've created a new nodeTypes or edgeTypes object."* This caused unnecessary reconciliation.

### Root cause
`customNodeRenderer` was created inside the `Graph` component with `useMemo(() => React.memo(...), [customNodes])`. Even when `customNodes` didn't change in content, a new array reference from the store caused the memo to recompute, producing a new `nodeTypes` object.

### Fix (`graph/graph.tsx`)

**`CustomNodeRenderer`** moved to module level. It now reads `customNodes` from the store via `useDecisionGraphState` inside the component body (valid — it's a React component), removing it as a closure dependency:

```ts
const CustomNodeRenderer = React.memo((props: MinimalNodeProps) => {
  const customNodes = useDecisionGraphState((s) => s.customNodes);
  const node = customNodes.find((n) => n.kind === props?.data?.kind);
  ...
});
```

**`baseNodeTypes`** defined at module level — the stable default mapping used when no `components` extensions are registered:

```ts
const baseNodeTypes = { ...defaultNodeTypes, customNode: CustomNodeRenderer };
```

**`nodeTypes` memo** returns `baseNodeTypes` early when `components` is empty, guaranteeing the same object reference across renders:

```ts
const nodeTypes = useMemo(() => {
  if (components.length === 0) return baseNodeTypes;  // stable reference
  return components.reduce(...);
}, [components]);
```

---

## 3. Deprecated API fixes

| File | Before | After |
|------|--------|-------|
| `context/dg-store.context.tsx` | `import { create } from 'zustand'` | `import { createWithEqualityFn as create } from 'zustand/traditional'` |
| `graph/graph.tsx` (×2) | `reactFlowInstance.current.project(...)` | `reactFlowInstance.current.screenToFlowPosition(...)` |
| `hooks/use-graph-clipboard.ts` | `reactFlow.current.project(...)` | `reactFlow.current.screenToFlowPosition(...)` |
| `graph/graph-excel-dialog.tsx` | `destroyOnClose` | `destroyOnHidden` |
| `graph/json-to-json-schema-dialog.tsx` | `destroyOnClose` | `destroyOnHidden` |
| `components/decision-table/components/dt-excel-dialog.tsx` | `destroyOnClose` | `destroyOnHidden` |
| `components/decision-table/dialog/fields-reorder-dialog.tsx` | `destroyOnClose` | `destroyOnHidden` |

`screenToFlowPosition` does not require subtracting the ReactFlow container bounds — client coordinates are passed directly.

---

## How to add a new input preset (app side only, no fork rebuild)

```tsx
// In your app, pass to <DecisionGraph customNodes={[...]} />
{
  kind: 'my-preset',
  isInputNode: true,
  displayName: 'My Input',
  icon: <MyIcon />,
  color: 'var(--node-color-blue)',
  shortDescription: 'Description shown in toolbar tooltip',
  group: 'core',                          // places it alongside Request in the toolbar
  generateNode: () => ({
    name: 'My Input',
    config: { schema: mySchemaJson },     // pre-filled JSON Schema string
  }),
  renderNode: (() => null) as any,        // unused — input.specification.tsx handles rendering
}
```

The created node is saved as `type: "inputNode"` with `content.schema` set to your schema and `content._kind` set to `kind`. The Zen engine receives a standard input node and needs no changes.
