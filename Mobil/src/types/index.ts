export interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
}

// Theme type is defined in utils/theme.ts and re-exported here for convenience.
export type { Theme } from '../utils/theme';

