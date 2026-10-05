export interface ObservatoryTarget {
  entityId?: string;
  sourceId?: string;
  noteId?: string;
  relationshipId?: string;
  entityName?: string;
}

export interface StellaContext {
  prompt?: string;
  sourceId?: string;
  sourceTitle?: string;
  noteId?: string;
  noteTitle?: string;
  entityIds?: string[];
  entityNames?: string[];
  relationshipId?: string;
  relationshipType?: string;
  connectionSummary?: {
    sourceEntityName: string;
    targetEntityName: string;
    relationshipType: string;
  };
}
