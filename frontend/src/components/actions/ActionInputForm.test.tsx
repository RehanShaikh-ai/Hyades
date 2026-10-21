import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ActionInputForm } from './ActionInputForm';
import { ActionDefinition } from '@/types/actions';

describe('ActionInputForm Component (§3.B, §6)', () => {
  const mockWriteAction: ActionDefinition = {
    id: 'notes.update',
    name: 'Update Note',
    description: 'Modify title and body of an existing note',
    side_effect: 'write',
    input_schema: {
      type: 'object',
      properties: {
        note_id: {
          type: 'string',
          title: 'Note ID',
          description: 'Unique identifier of the note to update',
        },
        title: {
          type: 'string',
          title: 'New Note Title',
        },
        revision_count: {
          type: 'integer',
          title: 'Revision Count',
        },
        is_published: {
          type: 'boolean',
          title: 'Publish Note',
        },
        tags: {
          type: 'array',
          title: 'Tags List',
          description: 'Comma separated list of tags',
        },
      },
      required: ['note_id', 'title'],
    },
  };

  const mockReadAction: ActionDefinition = {
    id: 'notes.get',
    name: 'Get Note',
    description: 'Retrieve note by ID without side effects',
    side_effect: 'read',
    input_schema: {
      type: 'object',
      properties: {
        note_id: { type: 'string' },
      },
      required: ['note_id'],
    },
  };

  it('renders dynamic schema fields from action input_schema', () => {
    render(
      <ActionInputForm
        action={mockWriteAction}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByTestId('action-input-note_id')).toBeDefined();
    expect(screen.getByTestId('action-input-title')).toBeDefined();
    expect(screen.getByTestId('action-input-revision_count')).toBeDefined();
    expect(screen.getByTestId('action-input-is_published')).toBeDefined();
    expect(screen.getByTestId('action-input-tags')).toBeDefined();
  });

  it('generates an idempotency key automatically (§3.B)', () => {
    render(
      <ActionInputForm
        action={mockWriteAction}
        onSubmit={vi.fn()}
      />
    );

    const idempotencySpan = screen.getByTestId('action-idempotency-key');
    expect(idempotencySpan.textContent).toBeTruthy();
  });

  it('prevents submission and displays validation errors when required fields are missing (§3.B)', () => {
    const handleSubmit = vi.fn();
    render(
      <ActionInputForm
        action={mockWriteAction}
        onSubmit={handleSubmit}
      />
    );

    // Click submit without filling note_id or title
    const submitBtn = screen.getByTestId('execute-action-btn');
    fireEvent.click(submitBtn);

    // Validation error banner must appear
    expect(screen.getByTestId('action-validation-errors')).toBeDefined();
    expect(screen.getAllByText(/Note ID is required/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/New Note Title is required/i).length).toBeGreaterThanOrEqual(1);
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('submits valid input with idempotency key and selected mode', () => {
    const handleSubmit = vi.fn();
    render(
      <ActionInputForm
        action={mockWriteAction}
        onSubmit={handleSubmit}
      />
    );

    // Fill required fields
    fireEvent.change(screen.getByTestId('action-input-note_id'), {
      target: { value: 'note-456' },
    });
    fireEvent.change(screen.getByTestId('action-input-title'), {
      target: { value: 'Refined Cosmology Notes' },
    });

    // Select propose mode
    fireEvent.click(screen.getByTestId('mode-select-propose'));

    // Submit
    fireEvent.click(screen.getByTestId('execute-action-btn'));

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    const submission = handleSubmit.mock.calls[0][0];
    expect(submission.mode).toBe('propose');
    expect(submission.input.note_id).toBe('note-456');
    expect(submission.input.title).toBe('Refined Cosmology Notes');
    expect(submission.idempotency_key).toBeTruthy();
  });

  it('never allows read-only actions to override classification or select commit mode (§3.B)', () => {
    render(
      <ActionInputForm
        action={mockReadAction}
        onSubmit={vi.fn()}
      />
    );

    // For side_effect === 'read', commit mode should be disabled or not selectable
    const commitBtn = screen.getByTestId('mode-select-commit') as HTMLButtonElement;
    expect(commitBtn.disabled).toBe(true);
    // Read mode is active
    const readBtn = screen.getByTestId('mode-select-read') as HTMLButtonElement;
    expect(readBtn.disabled).toBe(false);
  });

  it('renders confirmation token input when commit mode is selected', () => {
    render(
      <ActionInputForm
        action={mockWriteAction}
        initialMode="commit"
        initialConfirmationToken="tok-verified-999"
        onSubmit={vi.fn()}
      />
    );

    const tokenInput = screen.getByTestId('action-input-confirmation-token') as HTMLInputElement;
    expect(tokenInput).toBeDefined();
    expect(tokenInput.value).toBe('tok-verified-999');
  });

  it('displays server-side error message if execution fails (§3.B)', () => {
    render(
      <ActionInputForm
        action={mockWriteAction}
        serverError="Schema validation failed on server: invalid foreign key"
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByTestId('action-form-error')).toBeDefined();
    expect(screen.getByText(/Schema validation failed on server: invalid foreign key/i)).toBeDefined();
  });
});
