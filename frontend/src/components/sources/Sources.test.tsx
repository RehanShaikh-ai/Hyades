import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SourceStatusBadge } from './SourceStatusBadge';
import { SourceUploadPanel } from './SourceUploadPanel';
import { SourceDetailView } from './SourceDetailView';
import { SourceList } from './SourceList';
import * as sourcesApi from '@/api/sources';
import { Source } from '@/types/source';

vi.mock('@/api/sources', () => ({
  listSources: vi.fn(),
  uploadSource: vi.fn(),
  getSource: vi.fn(),
  deleteSource: vi.fn(),
  retrySource: vi.fn(),
  linkSourceToNote: vi.fn(),
  unlinkSourceFromNote: vi.fn(),
}));

const mockReadySource: Source = {
  id: 'src-1',
  workspace_id: 'ws-1',
  title: 'Architecture Overview.pdf',
  file_name: 'Architecture Overview.pdf',
  original_path: '/docs/Architecture Overview.pdf',
  source_type: 'pdf',
  processing_stage: 'complete',
  processing_status: 'READY',
  file_size_bytes: 1048576,
  page_count: 5,
  chunk_count: 12,
  extracted_text: 'This is the extracted content from the architecture doc.',
  created_at: '2026-09-26T10:00:00Z',
};

const mockFailedSource: Source = {
  id: 'src-2',
  workspace_id: 'ws-1',
  title: 'Corrupted Notes.md',
  file_name: 'Corrupted Notes.md',
  original_path: '/docs/Corrupted Notes.md',
  source_type: 'markdown',
  processing_stage: 'extract',
  processing_status: 'FAILED',
  error_stage: 'extract',
  error_message: 'Unicode decode error at byte offset 42',
  file_size_bytes: 2048,
  created_at: '2026-09-26T10:05:00Z',
};

describe('SourceStatusBadge', () => {
  it('renders READY status badge correctly', () => {
    render(<SourceStatusBadge status="READY" />);
    const badge = screen.getByTestId('source-status-badge');
    expect(badge).toHaveTextContent('Ready');
    expect(badge).toHaveAttribute('data-status', 'READY');
  });

  it('renders PROCESSING status with stage', () => {
    render(<SourceStatusBadge status="PROCESSING" stage="chunk" />);
    const badge = screen.getByTestId('source-status-badge');
    expect(badge).toHaveTextContent('Processing (chunk)');
    expect(badge).toHaveAttribute('data-status', 'PROCESSING');
  });

  it('renders FAILED status badge correctly', () => {
    render(<SourceStatusBadge status="FAILED" stage="embed" />);
    const badge = screen.getByTestId('source-status-badge');
    expect(badge).toHaveTextContent('Failed (embed)');
    expect(badge).toHaveAttribute('data-status', 'FAILED');
  });
});

describe('SourceUploadPanel', () => {
  it('handles file selection, validation, and upload', async () => {
    const user = userEvent.setup();
    const onUploaded = vi.fn();
    vi.mocked(sourcesApi.uploadSource).mockResolvedValueOnce(mockReadySource);

    render(
      <SourceUploadPanel
        workspaceId="ws-1"
        onSourceUploaded={onUploaded}
      />
    );

    const file = new File(['sample content'], 'test-doc.pdf', { type: 'application/pdf' });
    const fileInput = screen.getByTestId('source-file-input');

    await user.upload(fileInput, file);

    expect(screen.getByText('test-doc.pdf')).toBeInTheDocument();

    const submitBtn = screen.getByTestId('upload-submit-btn');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(sourcesApi.uploadSource).toHaveBeenCalledWith('ws-1', file);
      expect(onUploaded).toHaveBeenCalledWith(mockReadySource);
      expect(screen.getByTestId('upload-success')).toBeInTheDocument();
    });
  });

  it('rejects unsupported file formats', async () => {
    render(<SourceUploadPanel workspaceId="ws-1" />);

    const invalidFile = new File(['dummy'], 'test.exe', { type: 'application/octet-stream' });
    const dropzone = screen.getByTestId('upload-dropzone');

    const dropEvent = {
      preventDefault: vi.fn(),
      dataTransfer: {
        files: [invalidFile],
      },
    };

    // Trigger drop
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.drop(dropzone, dropEvent);

    expect(screen.getByTestId('upload-error')).toHaveTextContent(/Unsupported file format/i);
  });
});

describe('SourceDetailView', () => {
  it('renders source details and sanitized extracted text', () => {
    render(<SourceDetailView source={mockReadySource} />);

    expect(screen.getByTestId('source-title')).toHaveTextContent('Architecture Overview.pdf');
    expect(screen.getByTestId('source-extracted-content')).toHaveTextContent(
      'This is the extracted content from the architecture doc.'
    );
    expect(screen.getByTestId('footer-retry-btn')).toBeDisabled();
  });

  it('shows error panel on FAILED source and enables retry button', async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    vi.mocked(sourcesApi.retrySource).mockResolvedValueOnce({
      ...mockFailedSource,
      processing_status: 'PENDING',
      processing_stage: 'upload',
      error_stage: null,
      error_message: null,
    });

    render(
      <SourceDetailView
        source={mockFailedSource}
        onSourceUpdated={onUpdated}
      />
    );

    expect(screen.getByTestId('source-error-panel')).toBeInTheDocument();
    expect(screen.getByText(/Unicode decode error at byte offset 42/i)).toBeInTheDocument();

    const retryBtn = screen.getByTestId('retry-source-btn');
    expect(retryBtn).not.toBeDisabled();

    await user.click(retryBtn);

    await waitFor(() => {
      expect(sourcesApi.retrySource).toHaveBeenCalledWith('src-2');
      expect(onUpdated).toHaveBeenCalled();
    });
  });
});

describe('SourceList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders list of sources with status badges', async () => {
    vi.mocked(sourcesApi.listSources).mockResolvedValueOnce({
      items: [mockReadySource, mockFailedSource],
      total: 2,
      page: 1,
      page_size: 50,
    });

    render(<SourceList workspaceId="ws-1" />);

    await waitFor(() => {
      expect(screen.getByText('Architecture Overview.pdf')).toBeInTheDocument();
      expect(screen.getByText('Corrupted Notes.md')).toBeInTheDocument();
    });

    expect(screen.getAllByTestId('source-status-badge')).toHaveLength(2);
  });

  it('renders empty state when no sources are returned', async () => {
    vi.mocked(sourcesApi.listSources).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      page_size: 50,
    });

    render(<SourceList workspaceId="ws-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('source-list-empty')).toBeInTheDocument();
    });
  });

  it('opens detail view when clicking a source card', async () => {
    const user = userEvent.setup();
    vi.mocked(sourcesApi.listSources).mockResolvedValueOnce({
      items: [mockReadySource],
      total: 1,
      page: 1,
      page_size: 50,
    });

    render(<SourceList workspaceId="ws-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('source-card-src-1')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('source-card-src-1'));

    expect(screen.getByTestId('source-detail-view')).toBeInTheDocument();
  });
});
