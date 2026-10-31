export interface CommandArgumentDef {
  name: string;
  label: string;
  arg_type: 'free_text' | 'resource';
  required: boolean;
  resource_types: Array<'note' | 'source' | 'entity' | 'collection' | 'thread'>;
  placeholder: string;
  description: string;
}

export interface SlashCommand {
  command: string; // e.g. '/create-note'
  name: string; // e.g. 'Create Note'
  description: string;
  syntax: string;
  example: string;
  examples?: string[];
  category?: string;
  action_id?: string | null;
  arguments?: CommandArgumentDef[];
  execution_type?: 'action' | 'proposal' | 'workflow' | 'search' | 'stream' | 'placeholder';
  availability?: 'available' | 'coming_soon' | 'internal';
  requires_confirmation?: boolean;
}

export interface CommandSuggestionItem {
  id: string;
  title: string;
  item_type: 'note' | 'source' | 'entity' | 'collection' | 'thread' | string;
  subtitle: string;
  snippet?: string;
  word_count?: number;
  updated_at?: string;
}

export interface SummaryCardData {
  targetId: string;
  targetTitle: string;
  targetType: string;
  summaryTitle: string;
  metaDescription: string;
  keyPoints: string[];
  fullSummary: string;
  relatedNotesCount?: number;
  sourceId?: string | null;
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

export interface SearchResultItem {
  id: string;
  title: string;
  item_type: 'note' | 'source' | 'entity' | 'collection' | 'thread';
  snippet?: string | null;
  score?: number | null;
  extra?: string | null;
}

export interface SearchCardData {
  query: string;
  total: number;
  items: SearchResultItem[];
}

export interface InboxReviewItem {
  id: string;
  source_id: string;
  source_title: string;
  source_type: string;
  status: string;
  detection_status: string;
  detected_count: number;
  detected_entities: string[];
  created_at: string;
}

export interface InboxReviewCardData {
  totalPending: number;
  items: InboxReviewItem[];
  summaryMessage: string;
}

export interface AddToCollectionProposalData {
  proposalId: string;
  confirmationToken: string;
  actionId: string;
  itemId: string;
  itemTitle: string;
  itemType: string;
  collectionId: string;
  collectionName: string;
  status: 'preview' | 'committing' | 'committed' | 'cancelled';
}

export interface LinkCandidateItem {
  noteId: string;
  title: string;
  excerpt?: string | null;
  commonTags: string[];
  similarityScore: number;
  alreadyLinked?: boolean;
  connectionStatus?: 'idle' | 'connecting' | 'connected' | 'error';
}

export interface LinkNotesCardData {
  sourceNoteId: string;
  sourceNoteTitle: string;
  candidates: LinkCandidateItem[];
  summary: string;
}

export interface GenericActionProposalData {
  proposalId: string;
  confirmationToken: string;
  actionId: string;
  command: string;
  commandName: string;
  message: string;
  status: 'preview' | 'committing' | 'committed' | 'cancelled';
  data?: Record<string, any>;
  affectedItemIds?: string[];
}

export interface GenericActionResultData {
  command: string;
  actionId: string;
  message: string;
  status: 'completed' | 'error';
  data?: Record<string, any>;
}

export interface FlashcardItem {
  id: string;
  question: string;
  answer: string;
  explanation?: string | null;
  concept?: string | null;
}

export interface FlashcardDeckData {
  deck_id: string;
  title: string;
  source_type: string;
  source_id?: string | null;
  source_title: string;
  cards_count: number;
  cards: FlashcardItem[];
  current_index?: number;
  review_state?: Record<string, 'got_it' | 'again'>;
}


