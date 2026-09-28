import { MessageCitation } from './message';

export interface AssistantQueryRequest {
  content: string;
  stream?: boolean;
}

export type AssistantStreamEvent =
  | {
      type: 'user_message_created';
      message_id: string;
    }
  | {
      type: 'chunk';
      content: string;
    }
  | {
      type: 'done';
      message_id: string;
      citations?: MessageCitation[];
      provider?: string;
      model?: string;
      latency_ms?: number;
    }
  | {
      type: 'error';
      code: string;
      message: string;
    };
