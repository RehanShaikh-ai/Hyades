import '@testing-library/jest-dom';
import React from 'react';
import { vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

if (typeof window !== 'undefined') {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!window.HTMLElement.prototype.scrollIntoView) {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  }
}

// Global mock for react-force-graph-2d to prevent Canvas rendering crashes in jsdom
vi.mock('react-force-graph-2d', () => {
  const MockForceGraph2D = React.forwardRef<
    { zoom: () => number; zoomToFit: () => void },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >(({ graphData, onNodeClick }, ref) => {
    React.useImperativeHandle(ref, () => ({
      zoom: () => 1,
      zoomToFit: () => {},
    }));

    return React.createElement(
      'div',
      { 'data-testid': 'force-graph-mock' },
      graphData?.nodes?.map((node: { id: string; name: string }) =>
        React.createElement(
          'button',
          {
            key: node.id,
            'data-testid': `graph-node-${node.id}`,
            onClick: () => onNodeClick && onNodeClick(node),
          },
          node.name
        )
      )
    );
  });
  MockForceGraph2D.displayName = 'MockForceGraph2D';
  return { default: MockForceGraph2D };
});

