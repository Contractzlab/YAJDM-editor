import { Input } from 'antd';
import clsx from 'clsx';
import React, { useCallback, useMemo, useState } from 'react';
import type { XYPosition } from 'reactflow';
import { match } from 'ts-pattern';

import { useDecisionGraphState } from '../context/dg-store.context';
import { DecisionNode } from '../nodes/decision-node';
import { INPUT_FAMILY, NodeKind, type NodeSpecification } from '../nodes/specifications/specification-types';
import { nodeSpecification } from '../nodes/specifications/specifications';

export type GraphComponentsProps = {
  inputDisabled?: boolean;
  components?: React.ReactNode[];
  disabled?: boolean;
  collapsed?: boolean;
};

export const GraphComponents: React.FC<GraphComponentsProps> = React.memo(({ inputDisabled, disabled, collapsed }) => {
  const customComponents = useDecisionGraphState((store) => store.components || []);
  const customNodes = useDecisionGraphState((store) => store.customNodes || []);

  const [search, setSearch] = useState('');

  const onDragStart = useCallback((event: React.DragEvent, nodeType: string, component?: string) => {
    const target = event.target as HTMLDivElement;
    if (!target) {
      return;
    }

    const { offsetX, offsetY } = event.nativeEvent;
    const { height, width } = target.getBoundingClientRect();

    const positionData: XYPosition = {
      x: offsetX / width,
      y: offsetY / height,
    };

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('nodeType', nodeType);
    event.dataTransfer.setData('relativePosition', JSON.stringify(positionData));
    if (component) {
      event.dataTransfer.setData('customNodeComponent', component);
    }
  }, []);

  const onDragStartInputPreset = useCallback((event: React.DragEvent, node: (typeof customNodes)[number]) => {
    const target = event.target as HTMLDivElement;
    if (!target) return;
    const { offsetX, offsetY } = event.nativeEvent;
    const { height, width } = target.getBoundingClientRect();
    const positionData: XYPosition = { x: offsetX / width, y: offsetY / height };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('nodeData', JSON.stringify({
      id: crypto.randomUUID(),
      type: 'inputNode',
      name: node.displayName,
      content: {
        schema: (node.generateNode({ index: 1 }) as any).config?.schema ?? '',
        _kind: node.kind,
      },
    }));
    event.dataTransfer.setData('relativePosition', JSON.stringify(positionData));
  }, [customNodes]);

  const innerGroups = useMemo<Record<string, NodeSpecification[]>>(() => {
    const initialGroups: Record<string, NodeSpecification[]> = {
      core: Object.values(nodeSpecification),
    };
    if (customComponents?.length > 0) {
      initialGroups.extended = customComponents;
    }

    (customNodes || []).forEach((node) => {
      const group = node.group?.trim?.() || '';
      if (group.length > 0) {
        if (initialGroups?.[group]) {
          initialGroups[group].push({ ...node, type: 'customNode' });
        } else {
          initialGroups[group] = [{ ...node, type: 'customNode' }];
        }
      }
    });

    (customNodes || []).forEach((node) => {
      if (!node?.group) {
        if (initialGroups?.['custom']) {
          initialGroups['custom'].push({ ...node, type: 'customNode' });
        } else {
          initialGroups['custom'] = [{ ...node, type: 'customNode' }];
        }
      }
    });

    return initialGroups;
  }, [customComponents, customNodes]);

  const groups = useMemo<Record<string, NodeSpecification[]>>(() => {
    return Object.keys(innerGroups).reduce((acc, key) => {
      return {
        ...acc,
        [key]: (innerGroups[key] || []).filter(
          (el) =>
            !(search?.trim?.().length > 0) ||
            (el.type || '').toLowerCase().indexOf(search.toLowerCase()) > -1 ||
            ((el.displayName || '') as string).toLowerCase().indexOf(search.toLowerCase()) > -1 ||
            (el.shortDescription || '').toLowerCase().indexOf(search.toLowerCase()) > -1 ||
            (el.group || '').toLowerCase().indexOf(search.toLowerCase()) > -1,
        ),
      };
    }, {});
  }, [innerGroups, search]);

  const customCount = customComponents.length + customNodes.length;

  return (
    <div>
      {customCount > 5 && (
        <Input
          placeholder={'Search components...'}
          value={search}
          onChange={(e) => setSearch(e.target.value || '')}
          allowClear
          className={'grl-dg__aside__menu__components__search'}
        />
      )}
      <div className={'grl-dg__aside__menu__components'}>
        {Object.keys(groups).map((group) => {
          return match(group)
            .with(
              'core',
              () =>
                groups['core']?.length > 0 && (
                  <React.Fragment key={group}>
                    {(groups['core'] || []).map((node) => {
                      const isInputPreset = 'isInputNode' in node && (node as any).isInputNode;
                      return (
                        <React.Fragment key={'kind' in node ? (node.kind as string) : node.type}>
                          <DragDecisionNode
                            collapsed={collapsed}
                            disabled={INPUT_FAMILY.has(node.type) || isInputPreset ? (disabled || inputDisabled) : disabled}
                            specification={node}
                            onDragStart={(event) =>
                              isInputPreset
                                ? onDragStartInputPreset(event, node as any)
                                : nodeSpecification[node.type as NodeKind] !== undefined
                                  ? onDragStart(event, node.type)
                                  : onDragStart(event, 'customNode', 'kind' in node ? (node.kind as string) : '')
                            }
                          />
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                ),
            )
            .otherwise(
              (group) =>
                groups[group]?.length > 0 && (
                  <React.Fragment key={group}>
                    {(groups?.[group] || []).map((customNode) => {
                      const isInputPreset = 'isInputNode' in customNode && (customNode as any).isInputNode;
                      return (
                        <DragDecisionNode
                          collapsed={collapsed}
                          key={'kind' in customNode ? (customNode.kind as string) : customNode.type}
                          disabled={isInputPreset ? (disabled || inputDisabled) : disabled}
                          specification={customNode}
                          onDragStart={(event) =>
                            isInputPreset
                              ? onDragStartInputPreset(event, customNode as any)
                              : group === 'extended'
                                ? onDragStart(event, customNode.type)
                                : onDragStart(event, 'customNode', 'kind' in customNode ? (customNode.kind as string) : '')
                          }
                        />
                      );
                    })}
                  </React.Fragment>
                ),
            );
        })}
      </div>
    </div>
  );
});

const DragDecisionNode: React.FC<
  {
    specification: Pick<NodeSpecification, 'color' | 'icon' | 'displayName' | 'shortDescription'>;
    disabled?: boolean;
    collapsed?: boolean;
  } & React.HTMLAttributes<HTMLDivElement>
> = ({ specification, disabled = false, collapsed, ...props }) => {
  return (
    <div className={clsx('draggable-component')} draggable={!disabled} {...props}>
      <div style={{ pointerEvents: 'none' }}>
        <DecisionNode
          listMode
          compactMode
          color={specification.color}
          icon={specification.icon}
          name={collapsed ? undefined : (specification.displayName as string)}
          type={specification.shortDescription}
        />
      </div>
    </div>
  );
};
