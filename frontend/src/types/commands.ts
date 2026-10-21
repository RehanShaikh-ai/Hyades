export interface SlashCommand {
  command: string; // e.g. '/create-note'
  name: string; // e.g. 'Create Note'
  description: string;
  syntax: string;
  example: string;
}

export interface NoteDraftProposal {
  proposalId: string;
  confirmationToken: string;
  actionId?: string;
  title: string;
  content: string;
  wordCount: number;
  status: 'preview' | 'committing' | 'committed' | 'cancelled';
  savedNoteId?: string;
  savedAt?: string;
  topic: string;
}
