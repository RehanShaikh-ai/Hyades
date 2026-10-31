import {
  AddToCollectionProposalData,
  FlashcardDeckData,
  GenericActionProposalData,
  GenericActionResultData,
  InboxReviewCardData,
  LinkNotesCardData,
  NoteDraftProposal,
  SearchCardData,
  SummaryCardData,
} from './commands';

export interface CitedSourceItem {
  chunk_id: string;
  note_id?: string | null;
  source_id?: string | null;
  title: string;
  excerpt: string;
  score: number;
}

export interface LocalDisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  citations?: CitedSourceItem[];
  latencyMs?: number;
  model?: string;
  error?: string;
  noteDraft?: NoteDraftProposal;
  summaryCard?: SummaryCardData;
  searchResults?: SearchCardData;
  inboxReview?: InboxReviewCardData;
  addToCollectionProposal?: AddToCollectionProposalData;
  linkNotesResults?: LinkNotesCardData;
  genericProposal?: GenericActionProposalData;
  genericResult?: GenericActionResultData;
  flashcardDeck?: FlashcardDeckData;
}

