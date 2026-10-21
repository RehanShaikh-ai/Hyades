import { apiClient } from './client';
import { SlashCommand } from '@/types/commands';

export interface StellaCommandsResponse {
  commands: SlashCommand[];
  total: number;
}

export interface CreateNoteDraftResponse {
  proposal_id: string;
  confirmation_token: string;
  action_id: string;
  title: string;
  content: string;
  word_count: number;
  status: 'proposed' | 'pending';
  topic: string;
}

export interface CommitNoteDraftResponse {
  note_id: string;
  title: string;
  word_count: number;
  status: 'committed';
  execution_id: string;
}

export interface CancelNoteDraftResponse {
  status: 'cancelled';
  proposal_id: string;
}

/**
 * List available slash commands for autocomplete.
 */
export async function listStellaCommands(workspaceId: string): Promise<SlashCommand[]> {
  try {
    const res = await apiClient.get<StellaCommandsResponse>(
      `/workspaces/${encodeURIComponent(workspaceId)}/stella/commands`
    );
    return res.commands || [];
  } catch (err) {
    console.warn('Failed to fetch slash commands from backend, using canonical fallback:', err);
    return [
      {
        command: '/create-note',
        name: 'Create Note',
        description: 'Draft and save a new note on any topic with Stella preview',
        syntax: '/create-note <topic>',
        example: '/create-note industrial revolution',
      },
      {
        command: '/summarize',
        name: 'Summarize',
        description: 'Summarize an existing note, source, or thread',
        syntax: '/summarize <target>',
        example: '/summarize ptolemaic astronomy',
      },
      {
        command: '/link-notes',
        name: 'Link Notes',
        description: 'Find or create semantic connections between notes',
        syntax: '/link-notes <query>',
        example: '/link-notes thermodynamics',
      },
      {
        command: '/review-inbox',
        name: 'Review Inbox',
        description: 'Review pending inbox items from ingestion',
        syntax: '/review-inbox',
        example: '/review-inbox',
      },
      {
        command: '/search',
        name: 'Search',
        description: 'Search notes, sources, entities, or threads across the workspace',
        syntax: '/search <query>',
        example: '/search renaissance instruments',
      },
    ];
  }
}

/**
 * Generate ~300-word note draft and stage a 2-phase action proposal.
 */
export async function createNoteDraft(
  workspaceId: string,
  topic: string,
  conversationId?: string
): Promise<CreateNoteDraftResponse> {
  return apiClient.post<CreateNoteDraftResponse>(
    `/workspaces/${encodeURIComponent(workspaceId)}/stella/commands/create-note/draft`,
    { topic, conversation_id: conversationId || null }
  );
}

/**
 * Commit note proposal into a persistent Note record.
 */
export async function commitNoteDraft(
  workspaceId: string,
  proposalId: string,
  confirmationToken: string,
  title?: string,
  content?: string
): Promise<CommitNoteDraftResponse> {
  return apiClient.post<CommitNoteDraftResponse>(
    `/workspaces/${encodeURIComponent(workspaceId)}/stella/commands/create-note/commit`,
    {
      proposal_id: proposalId,
      confirmation_token: confirmationToken,
      title: title || null,
      content: content || null,
    }
  );
}

/**
 * Cancel/reject a staged note creation proposal.
 */
export async function cancelNoteDraft(
  workspaceId: string,
  proposalId: string
): Promise<CancelNoteDraftResponse> {
  return apiClient.post<CancelNoteDraftResponse>(
    `/workspaces/${encodeURIComponent(workspaceId)}/stella/commands/create-note/cancel`,
    { proposal_id: proposalId }
  );
}
