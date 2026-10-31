import { apiClient } from './client';
import {
  AddToCollectionProposalData,
  CommandSuggestionItem,
  InboxReviewCardData,
  LinkNotesCardData,
  SearchCardData,
  SlashCommand,
  SummaryCardData,
} from '@/types/commands';

export interface StellaCommandsResponse {
  commands: SlashCommand[];
  total: number;
}

export interface StellaSuggestionsResponse {
  items: CommandSuggestionItem[];
  command: string;
  query: string;
  arg_index?: number;
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

export interface SummarizeItemBackendResponse {
  target_id: string;
  target_title: string;
  target_type: string;
  summary_title: string;
  meta_description: string;
  key_points: string[];
  full_summary: string;
  related_notes_count: number;
  source_id?: string | null;
}

export interface SearchBackendResponse {
  query: string;
  total: number;
  items: Array<{
    id: string;
    title: string;
    item_type: 'note' | 'source' | 'entity' | 'collection' | 'thread';
    snippet?: string | null;
    score?: number | null;
    extra?: string | null;
  }>;
}

export interface InboxBackendResponse {
  total_pending: number;
  items: Array<{
    id: string;
    source_id: string;
    source_title: string;
    source_type: string;
    status: string;
    detection_status: string;
    detected_count: number;
    detected_entities: string[];
    created_at: string;
  }>;
  summary_message: string;
}

export interface AddToCollectionDraftBackendResponse {
  proposal_id: string;
  confirmation_token: string;
  action_id: string;
  item_id: string;
  item_title: string;
  item_type: string;
  collection_id: string;
  collection_name: string;
  status: 'proposed' | 'pending';
}

export interface LinkNotesBackendResponse {
  source_note_id: string;
  source_note_title: string;
  candidates: Array<{
    note_id: string;
    title: string;
    excerpt?: string | null;
    common_tags: string[];
    similarity_score: number;
    already_linked?: boolean;
  }>;
  summary: string;
}

export interface LinkNotesConnectBackendResponse {
  source_note_id: string;
  source_note_title: string;
  target_note_id: string;
  target_note_title: string;
  status: 'linked' | 'already_linked';
  message: string;
}

export const FALLBACK_COMMANDS: SlashCommand[] = [
  {
    command: '/create-note',
    name: 'Create Note',
    description: 'Create a new note from a topic or content',
    syntax: '/create-note <topic>',
    example: '/create-note industrial revolution',
    examples: [
      '/create-note industrial revolution',
      '/create-note quantum computing',
      '/create-note meeting notes from this thread',
    ],
    category: 'write',
    action_id: 'notes.create',
    execution_type: 'proposal',
    requires_confirmation: true,
    arguments: [
      {
        name: 'topic',
        label: 'Topic',
        arg_type: 'free_text',
        required: true,
        resource_types: [],
        placeholder: 'Enter note topic or theme...',
        description: 'Topic or prompt for note synthesis',
      },
    ],
  },
  {
    command: '/summarize',
    name: 'Summarize',
    description: 'Summarize a note, source, collection, or entity',
    syntax: '/summarize <target>',
    example: '/summarize The Industrial Revolution',
    examples: [
      '/summarize The Industrial Revolution',
      '/summarize On Liberty',
      '/summarize Renaissance Astronomy',
    ],
    category: 'understand',
    action_id: 'notes.get',
    execution_type: 'action',
    requires_confirmation: false,
    arguments: [
      {
        name: 'target',
        label: 'Target Item',
        arg_type: 'resource',
        required: true,
        resource_types: ['note', 'source', 'collection', 'entity'],
        placeholder: 'Select note, source, or item...',
        description: 'Workspace item to summarize',
      },
    ],
  },
  {
    command: '/link-notes',
    name: 'Link Notes',
    description: 'Find and suggest links for a note (Coming Soon)',
    syntax: '/link-notes <note>',
    example: '/link-notes industrial revolution',
    examples: [
      '/link-notes industrial revolution',
      '/link-notes thermodynamics',
      '/link-notes neural networks',
    ],
    category: 'review',
    action_id: 'notes.find_related',
    execution_type: 'placeholder',
    availability: 'coming_soon',
    requires_confirmation: false,
    arguments: [
      {
        name: 'note',
        label: 'Source Note',
        arg_type: 'resource',
        required: true,
        resource_types: ['note'],
        placeholder: 'Select note to connect...',
        description: 'Note to find connections for',
      },
    ],
  },
  {
    command: '/review-inbox',
    name: 'Review Inbox',
    description: 'Review pending ingestion items in your workspace inbox (Coming Soon)',
    syntax: '/review-inbox',
    example: '/review-inbox',
    examples: ['/review-inbox'],
    category: 'review',
    action_id: 'inbox.list',
    execution_type: 'placeholder',
    availability: 'coming_soon',
    requires_confirmation: false,
    arguments: [],
  },
  {
    command: '/analyze',
    name: 'Analyze',
    description: 'Analyze a concept, note, or relationship (Coming Soon)',
    syntax: '/analyze <item>',
    example: '/analyze industrial revolution',
    examples: [
      '/analyze industrial revolution',
      '/analyze ptolemaic astronomy',
      '/analyze global trade networks',
    ],
    category: 'understand',
    action_id: 'entities.get',
    execution_type: 'placeholder',
    availability: 'coming_soon',
    requires_confirmation: false,
    arguments: [
      {
        name: 'item',
        label: 'Item or Concept',
        arg_type: 'resource',
        required: true,
        resource_types: ['note', 'entity', 'source'],
        placeholder: 'Select item to analyze...',
        description: 'Concept or note to examine',
      },
    ],
  },
  {
    command: '/generate-flashcards',
    name: 'Generate Flashcards',
    description: 'Create flashcards from a note',
    syntax: '/generate-flashcards <note>',
    example: '/generate-flashcards industrial revolution',
    examples: [
      '/generate-flashcards industrial revolution',
      '/generate-flashcards AI safety',
      '/generate-flashcards quantum computing',
    ],
    category: 'understand',
    action_id: 'notes.get',
    execution_type: 'stream',
    requires_confirmation: false,
    arguments: [
      {
        name: 'note',
        label: 'Note',
        arg_type: 'resource',
        required: true,
        resource_types: ['note'],
        placeholder: 'Select note for flashcards...',
        description: 'Note to generate flashcards from',
      },
    ],
  },
  {
    command: '/find-sources',
    name: 'Find Sources',
    description: 'Find relevant sources for a topic (Coming Soon)',
    syntax: '/find-sources <topic>',
    example: '/find-sources steam engine',
    examples: [
      '/find-sources steam engine',
      '/find-sources celestial orbits',
      '/find-sources archival compendiums',
    ],
    category: 'search',
    action_id: 'sources.search',
    execution_type: 'placeholder',
    availability: 'coming_soon',
    requires_confirmation: false,
    arguments: [
      {
        name: 'topic',
        label: 'Topic',
        arg_type: 'free_text',
        required: true,
        resource_types: [],
        placeholder: 'Enter research topic...',
        description: 'Topic to search sources for',
      },
    ],
  },
  {
    command: '/ask-about',
    name: 'Ask About',
    description: 'Ask Stella contextual questions about a workspace resource (Coming Soon)',
    syntax: '/ask-about <item>',
    example: '/ask-about Industrial Revolution consequences',
    examples: [
      '/ask-about Industrial Revolution consequences',
      '/ask-about quantum computing',
      '/ask-about connections between notes',
    ],
    category: 'understand',
    action_id: 'notes.get',
    execution_type: 'placeholder',
    availability: 'coming_soon',
    requires_confirmation: false,
    arguments: [
      {
        name: 'item',
        label: 'Item',
        arg_type: 'resource',
        required: true,
        resource_types: ['note', 'source', 'entity', 'collection'],
        placeholder: 'Select item to ask about...',
        description: 'Resource to discuss',
      },
    ],
  },
  {
    command: '/explore-graph',
    name: 'Explore Graph',
    description: 'Explore neighboring entities and relationships in the knowledge graph (Coming Soon)',
    syntax: '/explore-graph <entity>',
    example: '/explore-graph Johannes Kepler',
    examples: [
      '/explore-graph Johannes Kepler',
      '/explore-graph Steam Engine',
      '/explore-graph Industrial Revolution',
    ],
    category: 'read',
    action_id: 'graph.get_neighbors',
    execution_type: 'placeholder',
    availability: 'coming_soon',
    requires_confirmation: false,
    arguments: [
      {
        name: 'entity',
        label: 'Entity',
        arg_type: 'resource',
        required: true,
        resource_types: ['entity'],
        placeholder: 'Select entity to explore...',
        description: 'Knowledge graph entity',
      },
    ],
  },
  {
    command: '/create-source',
    name: 'Create Source',
    description: 'Ingest and synthesize a new text or document source',
    syntax: '/create-source <input>',
    example: '/create-source "Primary source excerpt on 19th century manufacturing"',
    examples: [
      '/create-source "Primary source excerpt on 19th century manufacturing"',
      '/create-source "Notes from Kepler\'s Astronomia Nova"',
    ],
    category: 'write',
    action_id: 'sources.create',
    execution_type: 'proposal',
    requires_confirmation: true,
    arguments: [
      {
        name: 'input',
        label: 'Source Input',
        arg_type: 'free_text',
        required: true,
        resource_types: [],
        placeholder: 'Enter source title or document text...',
        description: 'Source title and document content to ingest',
      },
    ],
  },
  {
    command: '/enrich-note',
    name: 'Enrich Note',
    description: 'Enrich a note with related workspace concepts, citations, and missing context',
    syntax: '/enrich-note <note>',
    example: '/enrich-note "Industrial Revolution"',
    examples: [
      '/enrich-note "Industrial Revolution"',
      '/enrich-note "Thermodynamics"',
    ],
    category: 'write',
    action_id: 'notes.update',
    execution_type: 'proposal',
    requires_confirmation: true,
    arguments: [
      {
        name: 'note',
        label: 'Note',
        arg_type: 'resource',
        required: true,
        resource_types: ['note'],
        placeholder: 'Select note to enrich...',
        description: 'Target note to expand with workspace knowledge',
      },
    ],
  },
  {
    command: '/merge-notes',
    name: 'Merge Notes',
    description: 'Synthesize and merge two or more related notes into a unified note',
    syntax: '/merge-notes <note_1> <note_2>',
    example: '/merge-notes "Early Steam Engines" "Steam Turbine Innovations"',
    examples: [
      '/merge-notes "Early Steam Engines" "Steam Turbine Innovations"',
      '/merge-notes "Quantum Entanglement" "Bell Inequalities"',
    ],
    category: 'write',
    action_id: 'notes.create',
    execution_type: 'proposal',
    requires_confirmation: true,
    arguments: [
      {
        name: 'note_1',
        label: 'First Note',
        arg_type: 'resource',
        required: true,
        resource_types: ['note'],
        placeholder: 'Select first note...',
        description: 'First source note to merge',
      },
      {
        name: 'note_2',
        label: 'Second Note',
        arg_type: 'resource',
        required: true,
        resource_types: ['note'],
        placeholder: 'Select second note to merge...',
        description: 'Second source note to merge',
      },
    ],
  },
  {
    command: '/split-note',
    name: 'Split Note',
    description: 'Deconstruct an extensive note and suggest modular atomic notes',
    syntax: '/split-note <note>',
    example: '/split-note "Comprehensive History of Computing"',
    examples: [
      '/split-note "Comprehensive History of Computing"',
      '/split-note "Overview of Thermodynamics"',
    ],
    category: 'write',
    action_id: 'notes.create',
    execution_type: 'proposal',
    requires_confirmation: true,
    arguments: [
      {
        name: 'note',
        label: 'Note',
        arg_type: 'resource',
        required: true,
        resource_types: ['note'],
        placeholder: 'Select note to split...',
        description: 'Extensive note to break into modular topics',
      },
    ],
  },
  {
    command: '/organize-knowledge',
    name: 'Organize Knowledge',
    description: 'Evaluate workspace taxonomy and propose collections, tags, or structure',
    syntax: '/organize-knowledge [scope]',
    example: '/organize-knowledge',
    examples: [
      '/organize-knowledge',
      '/organize-knowledge "Research Archive"',
    ],
    category: 'review',
    action_id: 'knowledge.audit_processing',
    execution_type: 'workflow',
    requires_confirmation: false,
    arguments: [
      {
        name: 'scope',
        label: 'Scope',
        arg_type: 'resource',
        required: false,
        resource_types: ['collection', 'note'],
        placeholder: 'Optional scope or collection...',
        description: 'Workspace area to organize',
      },
    ],
  },
  {
    command: '/populate-collection',
    name: 'Populate Collection',
    description: 'Search workspace for relevant items matching a collection theme',
    syntax: '/populate-collection <collection> [scope]',
    example: '/populate-collection "19th Century Inventions"',
    examples: [
      '/populate-collection "19th Century Inventions"',
      '/populate-collection "Astrophysics Papers"',
    ],
    category: 'write',
    action_id: 'collections.add_item',
    execution_type: 'proposal',
    requires_confirmation: true,
    arguments: [
      {
        name: 'collection',
        label: 'Collection',
        arg_type: 'resource',
        required: true,
        resource_types: ['collection'],
        placeholder: 'Select destination collection...',
        description: 'Target collection to populate',
      },
      {
        name: 'scope',
        label: 'Search Scope',
        arg_type: 'free_text',
        required: false,
        resource_types: [],
        placeholder: 'Optional thematic filter or topic...',
        description: 'Refinement query for candidate items',
      },
    ],
  },
  {
    command: '/extract-entities',
    name: 'Extract Entities',
    description: 'Extract key entities and relationships from a source or note for the graph',
    syntax: '/extract-entities <source>',
    example: '/extract-entities "Treatise on Celestial Orbits.pdf"',
    examples: [
      '/extract-entities "Treatise on Celestial Orbits.pdf"',
      '/extract-entities "The Industrial Revolution"',
    ],
    category: 'understand',
    action_id: 'notes.extract_concepts',
    execution_type: 'action',
    requires_confirmation: false,
    arguments: [
      {
        name: 'source',
        label: 'Source / Note',
        arg_type: 'resource',
        required: true,
        resource_types: ['source', 'note'],
        placeholder: 'Select source or note...',
        description: 'Target document to extract entities from',
      },
    ],
  },
  {
    command: '/reconcile-duplicates',
    name: 'Reconcile Duplicates',
    description: 'Identify overlapping or duplicate knowledge and propose consolidation',
    syntax: '/reconcile-duplicates [scope]',
    example: '/reconcile-duplicates',
    examples: [
      '/reconcile-duplicates',
      '/reconcile-duplicates "Optics Notes"',
    ],
    category: 'review',
    action_id: 'notes.compare',
    execution_type: 'action',
    requires_confirmation: false,
    arguments: [
      {
        name: 'scope',
        label: 'Scope',
        arg_type: 'resource',
        required: false,
        resource_types: ['collection', 'note'],
        placeholder: 'Optional scope or collection...',
        description: 'Workspace area to search for duplicates',
      },
    ],
  },
  {
    command: '/resolve-conflicts',
    name: 'Resolve Conflicts',
    description: 'Analyze contradictory statements across sources and synthesize consensus',
    syntax: '/resolve-conflicts <scope>',
    example: '/resolve-conflicts "Discovery date of Neptune"',
    examples: [
      '/resolve-conflicts "Discovery date of Neptune"',
      '/resolve-conflicts "Steam engine patent disputes"',
    ],
    category: 'understand',
    action_id: 'notes.compare',
    execution_type: 'action',
    requires_confirmation: false,
    arguments: [
      {
        name: 'scope',
        label: 'Topic / Dispute',
        arg_type: 'free_text',
        required: true,
        resource_types: [],
        placeholder: 'Enter contradictory topic or claim...',
        description: 'Subject with diverging notes or records',
      },
    ],
  },
  {
    command: '/process-inbox',
    name: 'Process Inbox',
    description: 'Triage pending inbox items, categorize content, and propose filings',
    syntax: '/process-inbox [scope]',
    example: '/process-inbox',
    examples: [
      '/process-inbox',
    ],
    category: 'review',
    action_id: 'inbox.list',
    execution_type: 'workflow',
    requires_confirmation: false,
    arguments: [
      {
        name: 'scope',
        label: 'Filter',
        arg_type: 'free_text',
        required: false,
        resource_types: [],
        placeholder: 'Optional filter criteria...',
        description: 'Optional filter for inbox triage',
      },
    ],
  },
];

/**
 * Deterministic Operations: internal routine CRUD and application operations
 * catalogued for Stella's autonomous selection and execution, not exposed in the slash menu.
 */
export const DETERMINISTIC_OPERATIONS: SlashCommand[] = [
  {
    command: '/audit-knowledge',
    name: 'Audit Knowledge',
    description: 'Audit processing health, unindexed sources, and graph gaps',
    syntax: '/audit-knowledge',
    example: '/audit-knowledge',
    examples: ['/audit-knowledge'],
    category: 'review',
    action_id: 'knowledge.audit_processing',
    execution_type: 'workflow',
    requires_confirmation: false,
    arguments: [],
  },
  {
    command: '/rename-note',
    name: 'Rename Note',
    description: 'Change the title of an existing note',
    syntax: '/rename-note <note> <new_title>',
    example: '/rename-note "Old Title" "New Title"',
    examples: ['/rename-note "Old Title" "New Title"'],
    category: 'write',
    action_id: 'notes.rename',
    execution_type: 'proposal',
    requires_confirmation: true,
    arguments: [
      {
        name: 'note',
        label: 'Note',
        arg_type: 'resource',
        required: true,
        resource_types: ['note'],
        placeholder: 'Select note to rename...',
        description: 'Target note',
      },
      {
        name: 'new_title',
        label: 'New Title',
        arg_type: 'free_text',
        required: true,
        resource_types: [],
        placeholder: 'Enter new note title...',
        description: 'New title',
      },
    ],
  },
  {
    command: '/duplicate-note',
    name: 'Duplicate Note',
    description: 'Clone a note with a new title and identical contents',
    syntax: '/duplicate-note <note>',
    example: '/duplicate-note "Research Notes"',
    examples: ['/duplicate-note "Research Notes"'],
    category: 'write',
    action_id: 'notes.duplicate',
    execution_type: 'proposal',
    requires_confirmation: true,
    arguments: [
      {
        name: 'note',
        label: 'Note',
        arg_type: 'resource',
        required: true,
        resource_types: ['note'],
        placeholder: 'Select note to clone...',
        description: 'Source note to duplicate',
      },
    ],
  },
  {
    command: '/archive-note',
    name: 'Archive Note',
    description: 'Archive a note without deleting it permanently',
    syntax: '/archive-note <note>',
    example: '/archive-note "Old Thesis"',
    examples: ['/archive-note "Old Thesis"'],
    category: 'write',
    action_id: 'notes.archive',
    execution_type: 'proposal',
    requires_confirmation: true,
    arguments: [
      {
        name: 'note',
        label: 'Note',
        arg_type: 'resource',
        required: true,
        resource_types: ['note'],
        placeholder: 'Select note to archive...',
        description: 'Target note',
      },
    ],
  },
  {
    command: '/restore-note',
    name: 'Restore Note',
    description: 'Restore an archived note back to active library',
    syntax: '/restore-note <note>',
    example: '/restore-note "Old Thesis"',
    examples: ['/restore-note "Old Thesis"'],
    category: 'write',
    action_id: 'notes.restore',
    execution_type: 'proposal',
    requires_confirmation: true,
    arguments: [
      {
        name: 'note',
        label: 'Note',
        arg_type: 'resource',
        required: true,
        resource_types: ['note'],
        placeholder: 'Select note to restore...',
        description: 'Target archived note',
      },
    ],
  },
  {
    command: '/pin-note',
    name: 'Pin Note',
    description: 'Pin a note to the top of your workspace library',
    syntax: '/pin-note <note>',
    example: '/pin-note "Active Research"',
    examples: ['/pin-note "Active Research"'],
    category: 'write',
    action_id: 'notes.pin',
    execution_type: 'proposal',
    requires_confirmation: true,
    arguments: [
      {
        name: 'note',
        label: 'Note',
        arg_type: 'resource',
        required: true,
        resource_types: ['note'],
        placeholder: 'Select note to pin...',
        description: 'Target note',
      },
    ],
  },
  {
    command: '/unpin-note',
    name: 'Unpin Note',
    description: 'Unpin a previously pinned note',
    syntax: '/unpin-note <note>',
    example: '/unpin-note "Active Research"',
    examples: ['/unpin-note "Active Research"'],
    category: 'write',
    action_id: 'notes.unpin',
    execution_type: 'proposal',
    requires_confirmation: true,
    arguments: [
      {
        name: 'note',
        label: 'Note',
        arg_type: 'resource',
        required: true,
        resource_types: ['note'],
        placeholder: 'Select note to unpin...',
        description: 'Target note',
      },
    ],
  },
  {
    command: '/delete-note',
    name: 'Delete Note',
    description: 'Permanently remove a note with two-phase confirmation',
    syntax: '/delete-note <note>',
    example: '/delete-note "Scratchpad"',
    examples: ['/delete-note "Scratchpad"'],
    category: 'write',
    action_id: 'notes.delete',
    execution_type: 'proposal',
    requires_confirmation: true,
    arguments: [
      {
        name: 'note',
        label: 'Note',
        arg_type: 'resource',
        required: true,
        resource_types: ['note'],
        placeholder: 'Select note to delete...',
        description: 'Target note',
      },
    ],
  },
  {
    command: '/create-collection',
    name: 'Create Collection',
    description: 'Create a new organized collection dossier in your workspace',
    syntax: '/create-collection <name> [description]',
    example: '/create-collection "Renaissance Astronomy"',
    examples: ['/create-collection "Renaissance Astronomy"'],
    category: 'write',
    action_id: 'collections.create',
    execution_type: 'proposal',
    requires_confirmation: true,
    arguments: [
      {
        name: 'name',
        label: 'Collection Name',
        arg_type: 'free_text',
        required: true,
        resource_types: [],
        placeholder: 'Enter collection name...',
        description: 'Name for the new collection',
      },
      {
        name: 'description',
        label: 'Description',
        arg_type: 'free_text',
        required: false,
        resource_types: [],
        placeholder: 'Optional collection description...',
        description: 'Description of scope',
      },
    ],
  },
  {
    command: '/rename-collection',
    name: 'Rename Collection',
    description: 'Rename an existing workspace collection',
    syntax: '/rename-collection <collection> <new_name>',
    example: '/rename-collection "Draft Notes" "Archived Dossiers"',
    examples: ['/rename-collection "Draft Notes" "Archived Dossiers"'],
    category: 'write',
    action_id: 'collections.rename',
    execution_type: 'proposal',
    requires_confirmation: true,
    arguments: [
      {
        name: 'collection',
        label: 'Collection',
        arg_type: 'resource',
        required: true,
        resource_types: ['collection'],
        placeholder: 'Select collection to rename...',
        description: 'Target collection',
      },
      {
        name: 'new_name',
        label: 'New Name',
        arg_type: 'free_text',
        required: true,
        resource_types: [],
        placeholder: 'Enter new collection name...',
        description: 'New title for collection',
      },
    ],
  },
  {
    command: '/delete-collection',
    name: 'Delete Collection',
    description: 'Delete a collection dossier with two-phase confirmation',
    syntax: '/delete-collection <collection>',
    example: '/delete-collection "Temporary Research"',
    examples: ['/delete-collection "Temporary Research"'],
    category: 'write',
    action_id: 'collections.delete',
    execution_type: 'proposal',
    requires_confirmation: true,
    arguments: [
      {
        name: 'collection',
        label: 'Collection',
        arg_type: 'resource',
        required: true,
        resource_types: ['collection'],
        placeholder: 'Select collection to delete...',
        description: 'Target collection',
      },
    ],
  },
  {
    command: '/remove-from-collection',
    name: 'Remove from Collection',
    description: 'Remove an item from a collection dossier',
    syntax: '/remove-from-collection <item> <collection>',
    example: '/remove-from-collection "Note Title" "Collection Name"',
    examples: ['/remove-from-collection "Note Title" "Collection Name"'],
    category: 'write',
    action_id: 'collections.remove_item',
    execution_type: 'proposal',
    requires_confirmation: true,
    arguments: [
      {
        name: 'item',
        label: 'Item',
        arg_type: 'resource',
        required: true,
        resource_types: ['note', 'source'],
        placeholder: 'Select item to remove...',
        description: 'Target item',
      },
      {
        name: 'collection',
        label: 'Collection',
        arg_type: 'resource',
        required: true,
        resource_types: ['collection'],
        placeholder: 'Select collection...',
        description: 'Target collection',
      },
    ],
  },
  {
    command: '/move-collection-item',
    name: 'Move Collection Item',
    description: 'Move an item from one collection to another',
    syntax: '/move-collection-item <item> <source_collection> <dest_collection>',
    example: '/move-collection-item "Kepler Notes" "Drafts" "Astronomy"',
    examples: ['/move-collection-item "Kepler Notes" "Drafts" "Astronomy"'],
    category: 'write',
    action_id: 'collections.move_item',
    execution_type: 'proposal',
    requires_confirmation: true,
    arguments: [
      {
        name: 'item',
        label: 'Item',
        arg_type: 'resource',
        required: true,
        resource_types: ['note', 'source'],
        placeholder: 'Select item to move...',
        description: 'Target item',
      },
      {
        name: 'source_collection',
        label: 'Source Collection',
        arg_type: 'resource',
        required: true,
        resource_types: ['collection'],
        placeholder: 'Select source collection...',
        description: 'Current collection',
      },
      {
        name: 'dest_collection',
        label: 'Destination Collection',
        arg_type: 'resource',
        required: true,
        resource_types: ['collection'],
        placeholder: 'Select destination collection...',
        description: 'Target destination collection',
      },
    ],
  },
  {
    command: '/create-source',
    name: 'Create Source',
    description: 'Register a primary archival source into workspace repository',
    syntax: '/create-source <title> [content]',
    example: '/create-source "Treatise on Celestial Orbits"',
    examples: ['/create-source "Treatise on Celestial Orbits"'],
    category: 'write',
    action_id: 'sources.create',
    execution_type: 'proposal',
    requires_confirmation: true,
    arguments: [
      {
        name: 'title',
        label: 'Source Title',
        arg_type: 'free_text',
        required: true,
        resource_types: [],
        placeholder: 'Enter source title or filename...',
        description: 'Title or identifier for source',
      },
      {
        name: 'content',
        label: 'Content',
        arg_type: 'free_text',
        required: false,
        resource_types: [],
        placeholder: 'Optional text content or synopsis...',
        description: 'Initial text content',
      },
    ],
  },
  {
    command: '/rename-source',
    name: 'Rename Source',
    description: 'Rename an ingested source document',
    syntax: '/rename-source <source> <new_title>',
    example: '/rename-source "OldSource.pdf" "Galileo Dialogue.pdf"',
    examples: ['/rename-source "OldSource.pdf" "Galileo Dialogue.pdf"'],
    category: 'write',
    action_id: 'sources.rename',
    execution_type: 'proposal',
    requires_confirmation: true,
    arguments: [
      {
        name: 'source',
        label: 'Source',
        arg_type: 'resource',
        required: true,
        resource_types: ['source'],
        placeholder: 'Select source to rename...',
        description: 'Target source',
      },
      {
        name: 'new_title',
        label: 'New Title',
        arg_type: 'free_text',
        required: true,
        resource_types: [],
        placeholder: 'Enter new title...',
        description: 'New source title',
      },
    ],
  },
  {
    command: '/delete-source',
    name: 'Delete Source',
    description: 'Permanently remove a source document with confirmation',
    syntax: '/delete-source <source>',
    example: '/delete-source "Outdated Manuscript"',
    examples: ['/delete-source "Outdated Manuscript"'],
    category: 'write',
    action_id: 'sources.delete',
    execution_type: 'proposal',
    requires_confirmation: true,
    arguments: [
      {
        name: 'source',
        label: 'Source',
        arg_type: 'resource',
        required: true,
        resource_types: ['source'],
        placeholder: 'Select source to remove...',
        description: 'Target source to delete',
      },
    ],
  },
  {
    command: '/create-entity',
    name: 'Create Entity',
    description: 'Create an entity node in the workspace knowledge graph',
    syntax: '/create-entity <name>',
    example: '/create-entity "James Watt"',
    examples: ['/create-entity "James Watt"'],
    category: 'write',
    action_id: 'entities.create',
    execution_type: 'proposal',
    requires_confirmation: true,
    arguments: [
      {
        name: 'name',
        label: 'Entity Name',
        arg_type: 'free_text',
        required: true,
        resource_types: [],
        placeholder: 'Enter entity name...',
        description: 'Entity node name',
      },
    ],
  },
  {
    command: '/update-entity',
    name: 'Update Entity',
    description: 'Update the name or properties of a knowledge graph entity',
    syntax: '/update-entity <entity> <new_name>',
    example: '/update-entity "Kepler" "Johannes Kepler"',
    examples: ['/update-entity "Kepler" "Johannes Kepler"'],
    category: 'write',
    action_id: 'entities.update',
    execution_type: 'proposal',
    requires_confirmation: true,
    arguments: [
      {
        name: 'entity',
        label: 'Entity',
        arg_type: 'resource',
        required: true,
        resource_types: ['entity'],
        placeholder: 'Select entity...',
        description: 'Target entity',
      },
      {
        name: 'new_name',
        label: 'New Name',
        arg_type: 'free_text',
        required: true,
        resource_types: [],
        placeholder: 'Enter revised entity name...',
        description: 'New entity name',
      },
    ],
  },
  {
    command: '/delete-entity',
    name: 'Delete Entity',
    description: 'Delete an entity and its edges from the knowledge graph',
    syntax: '/delete-entity <entity>',
    example: '/delete-entity "Incorrect Concept"',
    examples: ['/delete-entity "Incorrect Concept"'],
    category: 'write',
    action_id: 'entities.delete',
    execution_type: 'proposal',
    requires_confirmation: true,
    arguments: [
      {
        name: 'entity',
        label: 'Entity',
        arg_type: 'resource',
        required: true,
        resource_types: ['entity'],
        placeholder: 'Select entity to delete...',
        description: 'Target entity to remove',
      },
    ],
  },
  {
    command: '/tag-note',
    name: 'Tag Note',
    description: 'Assign a tag to a workspace note',
    syntax: '/tag-note <note> <tag>',
    example: '/tag-note "Industrial Revolution" history',
    examples: ['/tag-note "Industrial Revolution" history'],
    category: 'write',
    action_id: 'tags.add_to_note',
    execution_type: 'proposal',
    requires_confirmation: true,
    arguments: [
      {
        name: 'note',
        label: 'Note',
        arg_type: 'resource',
        required: true,
        resource_types: ['note'],
        placeholder: 'Select note to tag...',
        description: 'Target note',
      },
      {
        name: 'tag',
        label: 'Tag Name',
        arg_type: 'free_text',
        required: true,
        resource_types: [],
        placeholder: 'Enter tag name...',
        description: 'Tag to assign',
      },
    ],
  },
  {
    command: '/untag-note',
    name: 'Untag Note',
    description: 'Remove a tag from a workspace note',
    syntax: '/untag-note <note> <tag>',
    example: '/untag-note "Industrial Revolution" draft',
    examples: ['/untag-note "Industrial Revolution" draft'],
    category: 'write',
    action_id: 'tags.remove_from_note',
    execution_type: 'proposal',
    requires_confirmation: true,
    arguments: [
      {
        name: 'note',
        label: 'Note',
        arg_type: 'resource',
        required: true,
        resource_types: ['note'],
        placeholder: 'Select note to untag...',
        description: 'Target note',
      },
      {
        name: 'tag',
        label: 'Tag Name',
        arg_type: 'free_text',
        required: true,
        resource_types: [],
        placeholder: 'Enter tag to remove...',
        description: 'Tag to remove',
      },
    ],
  },
  {
    command: '/new-conversation',
    name: 'New Conversation',
    description: 'Create a new research conversation thread',
    syntax: '/new-conversation [title]',
    example: '/new-conversation "Renaissance Astronomy"',
    examples: ['/new-conversation "Renaissance Astronomy"'],
    category: 'write',
    action_id: 'conversations.create',
    execution_type: 'action',
    requires_confirmation: false,
    arguments: [
      {
        name: 'title',
        label: 'Conversation Title',
        arg_type: 'free_text',
        required: false,
        resource_types: [],
        placeholder: 'Optional conversation title...',
        description: 'Initial title for thread',
      },
    ],
  },
  {
    command: '/rename-conversation',
    name: 'Rename Conversation',
    description: 'Rename the active conversation thread',
    syntax: '/rename-conversation <title>',
    example: '/rename-conversation "Advanced Thermodynamics"',
    examples: ['/rename-conversation "Advanced Thermodynamics"'],
    category: 'write',
    action_id: 'conversations.rename',
    execution_type: 'action',
    requires_confirmation: false,
    arguments: [
      {
        name: 'title',
        label: 'New Title',
        arg_type: 'free_text',
        required: true,
        resource_types: [],
        placeholder: 'Enter new conversation title...',
        description: 'New title for thread',
      },
    ],
  },
  {
    command: '/delete-conversation',
    name: 'Delete Conversation',
    description: 'Delete the active conversation thread with confirmation',
    syntax: '/delete-conversation',
    example: '/delete-conversation',
    examples: ['/delete-conversation'],
    category: 'write',
    action_id: 'conversations.delete',
    execution_type: 'proposal',
    requires_confirmation: true,
    arguments: [],
  },
  {
    command: '/add-to-collection',
    name: 'Add to Collection',
    description: 'Add a note, source, or entity to a collection',
    syntax: '/add-to-collection <item> <collection>',
    example: '/add-to-collection The Industrial Revolution History',
    examples: [
      '/add-to-collection The Industrial Revolution History',
      '/add-to-collection Quantum Computing Physics',
      '/add-to-collection On Liberty Philosophy',
    ],
    category: 'write',
    action_id: 'collections.add_item',
    execution_type: 'proposal',
    availability: 'internal',
    requires_confirmation: true,
    arguments: [
      {
        name: 'item',
        label: 'Item',
        arg_type: 'resource',
        required: true,
        resource_types: ['note', 'source', 'entity'],
        placeholder: 'Select note or source...',
        description: 'Item to add to collection',
      },
      {
        name: 'collection',
        label: 'Collection',
        arg_type: 'resource',
        required: true,
        resource_types: ['collection'],
        placeholder: 'Select destination collection...',
        description: 'Destination collection',
      },
    ],
  },
  {
    command: '/search',
    name: 'Search',
    description: 'Search across notes, sources, entities, collections, and threads',
    syntax: '/search <query>',
    example: '/search renaissance instruments',
    examples: [
      '/search renaissance instruments',
      '/search thermodynamics',
      '/search social classes in industrialization',
    ],
    category: 'search',
    action_id: 'knowledge.search_all',
    execution_type: 'search',
    availability: 'internal',
    requires_confirmation: false,
    arguments: [
      {
        name: 'query',
        label: 'Search Query',
        arg_type: 'free_text',
        required: true,
        resource_types: [],
        placeholder: 'Search knowledge base...',
        description: 'Search query across all workspace resources',
      },
    ],
  },
];

export const PLACEHOLDER_COMMANDS = new Set([
  '/link-notes',
  '/review-inbox',
  '/analyze',
  '/find-sources',
  '/ask-about',
  '/explore-graph',
]);

export const INTERNAL_AGENT_COMMANDS = new Set([
  '/add-to-collection',
  '/search',
]);

export const ALL_STELLA_OPERATIONS: SlashCommand[] = [...FALLBACK_COMMANDS, ...DETERMINISTIC_OPERATIONS];

/**
 * List available slash commands for autocomplete.
 */
export async function listStellaCommands(workspaceId: string): Promise<SlashCommand[]> {
  try {
    const res = await apiClient.get<StellaCommandsResponse>(
      `/workspaces/${encodeURIComponent(workspaceId)}/stella/commands`
    );
    const cmds = res.commands || FALLBACK_COMMANDS;
    return cmds.filter(
      (c) => c.availability !== 'internal' && !INTERNAL_AGENT_COMMANDS.has(c.command.toLowerCase())
    );
  } catch (err) {
    console.warn('Failed to fetch slash commands from backend, using canonical fallback:', err);
    return FALLBACK_COMMANDS.filter(
      (c) => c.availability !== 'internal' && !INTERNAL_AGENT_COMMANDS.has(c.command.toLowerCase())
    );
  }
}

/**
 * Fetch candidate item suggestions for argument-aware slash commands.
 */
export async function getCommandSuggestions(
  workspaceId: string,
  command: string,
  query: string = '',
  limit: number = 10,
  argIndex: number = 0
): Promise<CommandSuggestionItem[]> {
  if (PLACEHOLDER_COMMANDS.has(command.trim().toLowerCase())) {
    return [];
  }
  try {
    const params = new URLSearchParams({
      command,
      q: query,
      limit: String(limit),
      arg_index: String(argIndex),
    });
    const res = await apiClient.get<StellaSuggestionsResponse>(
      `/workspaces/${encodeURIComponent(workspaceId)}/stella/suggestions?${params.toString()}`
    );
    return res.items || [];
  } catch (err) {
    console.warn('Failed to fetch command suggestions:', err);
    return [];
  }
}

/**
 * Summarize an item in the workspace using real content.
 */
export async function summarizeItem(
  workspaceId: string,
  target: string,
  conversationId?: string,
  prompt?: string
): Promise<SummaryCardData> {
  const res = await apiClient.post<SummarizeItemBackendResponse>(
    `/workspaces/${encodeURIComponent(workspaceId)}/stella/commands/summarize`,
    { target, conversation_id: conversationId || null, prompt: prompt || null }
  );
  return {
    targetId: res.target_id,
    targetTitle: res.target_title,
    targetType: res.target_type,
    summaryTitle: res.summary_title,
    metaDescription: res.meta_description,
    keyPoints: res.key_points,
    fullSummary: res.full_summary,
    relatedNotesCount: res.related_notes_count,
    sourceId: res.source_id || null,
  };
}

/**
 * Execute multi-domain search across notes, sources, entities, collections, threads.
 */
export async function executeStellaSearch(
  workspaceId: string,
  query: string,
  limit: number = 10,
  conversationId?: string,
  prompt?: string
): Promise<SearchCardData> {
  const res = await apiClient.post<SearchBackendResponse>(
    `/workspaces/${encodeURIComponent(workspaceId)}/stella/commands/search`,
    { query, limit, conversation_id: conversationId || null, prompt: prompt || null }
  );
  return {
    query: res.query,
    total: res.total,
    items: (res.items || []).map((it) => ({
      id: it.id,
      title: it.title,
      item_type: it.item_type,
      snippet: it.snippet,
      score: it.score,
      extra: it.extra,
    })),
  };
}

/**
 * Review pending items in workspace ingestion inbox.
 */
export async function reviewStellaInbox(
  workspaceId: string,
  conversationId?: string
): Promise<InboxReviewCardData> {
  const query = conversationId ? `?conversation_id=${encodeURIComponent(conversationId)}` : '';
  const res = await apiClient.get<InboxBackendResponse>(
    `/workspaces/${encodeURIComponent(workspaceId)}/stella/commands/inbox${query}`
  );
  return {
    totalPending: res.total_pending,
    items: res.items || [],
    summaryMessage: res.summary_message,
  };
}

/**
 * Propose adding an item to a collection with two-phase commit protection.
 */
export async function stageAddToCollection(
  workspaceId: string,
  itemId: string,
  itemType: string,
  collectionId: string,
  conversationId?: string,
  prompt?: string
): Promise<AddToCollectionProposalData> {
  const res = await apiClient.post<AddToCollectionDraftBackendResponse>(
    `/workspaces/${encodeURIComponent(workspaceId)}/stella/commands/add-to-collection/draft`,
    {
      item_id: itemId,
      item_type: itemType,
      collection_id: collectionId,
      conversation_id: conversationId || null,
      prompt: prompt || null,
    }
  );
  return {
    proposalId: res.proposal_id,
    confirmationToken: res.confirmation_token,
    actionId: res.action_id,
    itemId: res.item_id,
    itemTitle: res.item_title,
    itemType: res.item_type,
    collectionId: res.collection_id,
    collectionName: res.collection_name,
    status: 'preview',
  };
}

/**
 * Commit a staged add-to-collection proposal.
 */
export async function commitAddToCollection(
  workspaceId: string,
  proposalId: string,
  confirmationToken: string,
  conversationId?: string
): Promise<{ collection_id: string; item_id: string; status: string }> {
  return apiClient.post<{ collection_id: string; item_id: string; status: string }>(
    `/workspaces/${encodeURIComponent(workspaceId)}/stella/commands/add-to-collection/commit`,
    {
      proposal_id: proposalId,
      confirmation_token: confirmationToken,
      conversation_id: conversationId || null,
    }
  );
}

/**
 * Discover connections and related notes for a note.
 */
export async function getStellaLinkNotes(
  workspaceId: string,
  target: string,
  limit: number = 5,
  conversationId?: string,
  prompt?: string
): Promise<LinkNotesCardData> {
  const res = await apiClient.post<LinkNotesBackendResponse>(
    `/workspaces/${encodeURIComponent(workspaceId)}/stella/commands/link-notes`,
    { target, limit, conversation_id: conversationId || null, prompt: prompt || null }
  );
  return {
    sourceNoteId: res.source_note_id,
    sourceNoteTitle: res.source_note_title,
    candidates: (res.candidates || []).map((c) => ({
      noteId: c.note_id,
      title: c.title,
      excerpt: c.excerpt,
      commonTags: c.common_tags || [],
      similarityScore: c.similarity_score,
      alreadyLinked: Boolean(c.already_linked),
      connectionStatus: c.already_linked ? 'connected' : 'idle',
    })),
    summary: res.summary,
  };
}

/**
 * Connect two notes directly from link suggestions.
 */
export async function connectStellaNoteLink(
  workspaceId: string,
  sourceNoteId: string,
  targetNoteId: string,
  conversationId?: string
): Promise<LinkNotesConnectBackendResponse> {
  return apiClient.post<LinkNotesConnectBackendResponse>(
    `/workspaces/${encodeURIComponent(workspaceId)}/stella/commands/link-notes/connect`,
    {
      source_note_id: sourceNoteId,
      target_note_id: targetNoteId,
      conversation_id: conversationId || null,
    }
  );
}

/**
 * Generate ~300-word note draft and stage a 2-phase action proposal.
 */
export async function createNoteDraft(
  workspaceId: string,
  topic: string,
  conversationId?: string,
  prompt?: string
): Promise<CreateNoteDraftResponse> {
  return apiClient.post<CreateNoteDraftResponse>(
    `/workspaces/${encodeURIComponent(workspaceId)}/stella/commands/create-note/draft`,
    { topic, conversation_id: conversationId || null, prompt: prompt || null }
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
  content?: string,
  conversationId?: string
): Promise<CommitNoteDraftResponse> {
  return apiClient.post<CommitNoteDraftResponse>(
    `/workspaces/${encodeURIComponent(workspaceId)}/stella/commands/create-note/commit`,
    {
      proposal_id: proposalId,
      confirmation_token: confirmationToken,
      title: title || null,
      content: content || null,
      conversation_id: conversationId || null,
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

export interface StellaCommandExecutePayload {
  command: string;
  args?: string[];
  action_id?: string;
  parameters?: Record<string, any>;
  conversation_id?: string;
  proposal_id?: string;
  confirmation_token?: string;
  prompt?: string;
}

export interface StellaCommandExecuteResult {
  command: string;
  action_id: string;
  status: 'completed' | 'proposed' | 'cancelled' | 'coming_soon' | 'error';
  message: string;
  data: Record<string, any>;
  proposal_id?: string | null;
  confirmation_token?: string | null;
  requires_confirmation: boolean;
  affected_item_ids: string[];
}

/**
 * Execute or stage proposal for any Stella slash command using canonical domain actions.
 */
export async function executeStellaCommand(
  workspaceId: string,
  payload: StellaCommandExecutePayload
): Promise<StellaCommandExecuteResult> {
  return apiClient.post<StellaCommandExecuteResult>(
    `/workspaces/${encodeURIComponent(workspaceId)}/stella/commands/execute`,
    payload
  );
}

/**
 * Persist user or assistant message to database conversation thread.
 */
export async function recordStellaMessage(
  workspaceId: string,
  conversationId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<{ id: string; status: string }> {
  return apiClient.post<{ id: string; status: string }>(
    `/workspaces/${encodeURIComponent(workspaceId)}/stella/conversations/${encodeURIComponent(conversationId)}/messages`,
    { role, content }
  );
}

