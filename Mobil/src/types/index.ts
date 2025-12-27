export interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
}

export interface Theme {
  isDark: boolean;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  accent: string;
  accentDim: string;
}
