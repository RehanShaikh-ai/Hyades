import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from './AppShell';
import { WorkspaceNav } from './WorkspaceNav';

// Mock StarField
vi.mock('./StarField', () => ({
  StarField: () => <div data-testid="mock-starfield" />,
}));

describe('WorkspaceNav', () => {
  it('renders all canonical navigation items and highlights active item', () => {
    const onSelectSection = vi.fn();
    render(
      <WorkspaceNav
        activeSection="sources"
        onSelectSection={onSelectSection}
        selectedWorkspace={{ id: 'ws-1', name: 'Test Workspace', description: null, owner_id: 'u-1', created_at: '', updated_at: '' }}
      />
    );

    expect(screen.getByTestId('nav-notes')).toBeInTheDocument();
    expect(screen.getByTestId('nav-sources')).toBeInTheDocument();
    expect(screen.getByTestId('nav-search')).toBeInTheDocument();
    expect(screen.getByTestId('nav-graph')).toBeInTheDocument();
    expect(screen.getByTestId('nav-assistant')).toBeInTheDocument();

    const activeItem = screen.getByTestId('nav-sources');
    expect(activeItem).toHaveAttribute('aria-current', 'page');
  });

  it('triggers onSelectSection when clicking a nav item', async () => {
    const user = userEvent.setup();
    const onSelectSection = vi.fn();
    render(
      <WorkspaceNav
        activeSection="notes"
        onSelectSection={onSelectSection}
      />
    );

    await user.click(screen.getByTestId('nav-assistant'));
    expect(onSelectSection).toHaveBeenCalledWith('assistant');
  });
});

describe('AppShell', () => {
  it('renders AppShell layout with nav, header, and content', () => {
    render(
      <AppShell
        activeSection="notes"
        onSelectSection={vi.fn()}
        healthStatus="connected"
      >
        <div data-testid="test-child">Dashboard Content</div>
      </AppShell>
    );

    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-nav')).toBeInTheDocument();
    expect(screen.getByTestId('app-shell-header')).toBeInTheDocument();
    expect(screen.getByTestId('test-child')).toHaveTextContent('Dashboard Content');
    expect(screen.getByTestId('health-status')).toHaveTextContent('Connected');
  });

  it('calls onRefreshHealth when refresh button is clicked', async () => {
    const user = userEvent.setup();
    const onRefreshHealth = vi.fn();
    render(
      <AppShell
        activeSection="graph"
        onSelectSection={vi.fn()}
        healthStatus="connected"
        onRefreshHealth={onRefreshHealth}
      >
        <div>Content</div>
      </AppShell>
    );

    const refreshBtn = screen.getByRole('button', { name: /refresh system health/i });
    await user.click(refreshBtn);
    expect(onRefreshHealth).toHaveBeenCalled();
  });
});
