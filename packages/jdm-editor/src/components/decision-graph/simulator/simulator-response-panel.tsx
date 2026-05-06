import { CloseOutlined } from '@ant-design/icons';
import { Button, Tabs, Tooltip } from 'antd';
import json5 from 'json5';
import React from 'react';
import { P, match } from 'ts-pattern';

import '../../../helpers/monaco';
import { usePersistentState } from '../../../helpers/use-persistent-state';
import type { Simulation } from './simulation.types';
import { SimulatorEditor } from './simulator-editor';

enum SimulationSegment {
  Output = 'Output',
  Input = 'Input',
  Trace = 'Trace',
}

export type SimulatorResponsePanelProps = {
  simulate?: Simulation;
  selectedNode: string;
  onClose?: () => void;
};

export const SimulatorResponsePanel: React.FC<SimulatorResponsePanelProps> = ({
  simulate,
  selectedNode,
  onClose,
}) => {
  const [segment, setSegment] = usePersistentState<SimulationSegment>('simulation.segment', SimulationSegment.Output);

  return (
    <>
      <div className={'grl-dg__simulator__section__bar grl-dg__simulator__section__bar--response'}>
        <Tabs
          rootClassName='grl-inline-tabs'
          size='small'
          style={{ width: '100%' }}
          onChange={(tab) => setSegment(tab as SimulationSegment)}
          items={Object.values(SimulationSegment).map((s) => ({
            key: s,
            label: s,
          }))}
          tabBarExtraContent={
            onClose && (
              <Tooltip title='Close panel'>
                <Button
                  type='text'
                  icon={<CloseOutlined style={{ fontSize: 12 }} />}
                  onClick={onClose}
                />
              </Tooltip>
            )
          }
        />
      </div>
      <div className={'grl-dg__simulator__section__content'}>
        <SimulatorEditor
          readOnly
          value={match(simulate)
            .with({ result: P._ }, ({ result }) =>
              match(selectedNode)
                .with('graph', () =>
                  displaySegment(
                    {
                      traceData: result?.trace,
                      output: result?.result,
                    },
                    segment ?? SimulationSegment.Output,
                  ),
                )
                .otherwise(() => displaySegment(result?.trace[selectedNode], segment ?? SimulationSegment.Output)),
            )
            .otherwise(() => '')}
        />
      </div>
    </>
  );
};

const displaySegment = (data: unknown, segment: SimulationSegment) => {
  const jsonData = match([segment, data])
    .with([SimulationSegment.Output, { output: P._ }], ([, { output }]) => output)
    .with([SimulationSegment.Input, { input: P._ }], ([, { input }]) => input)
    .with([SimulationSegment.Trace, { trace: P._ }], ([, { trace }]) => trace)
    .with([SimulationSegment.Trace, { traceData: P._ }], ([, { traceData }]) => traceData)
    .otherwise(() => ({}));

  return json5.stringify(jsonData, undefined, 2);
};
