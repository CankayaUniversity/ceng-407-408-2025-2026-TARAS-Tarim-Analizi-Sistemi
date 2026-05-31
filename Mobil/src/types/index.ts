// LLM tool-call sonrasi mesaj altinda cizilen aksiyon butonu.
// Buton tap'lenene kadar HICBIR sey calismaz (navigasyon/yazma ertelenir).
// Backend: navigate/set_filters SSE event'leri + yeni {action:{kind}} event'i bu sekle normalize edilir.
export type ChatMessageAction =
  // Ekrana git + (varsa) bolum/zone vurgusu — "Git" butonu
  | {
      kind: "navigate";
      screen: string;
      section: string | null;
      zoneId?: string;
    }
  // Cizelge filtrelerini uygula + Cizelge'ye git — "Git" butonu
  | {
      kind: "set_filters";
      // TimetableFilterPayload (context'te tanimli) — burada gevsek tutulur, ChatContext cevirir
      filters: Record<string, unknown>;
    }
  // Secili tarlayi degistir — "Geç" butonu
  | { kind: "select_field"; fieldId: string; fieldName: string }
  // Tema degistir — "Uygula" butonu
  | { kind: "set_theme"; mode: "light" | "dark" | "system" }
  // Dil degistir — "Uygula" butonu
  | { kind: "set_language"; lang: "tr" | "en" }
  // Karbon kaydi teklifi — "Onayla / İptal" butonlari. Onaya kadar YAZILMAZ.
  | {
      kind: "add_carbon_log";
      farmId: string;
      activityTypeId: number;
      activityTypeName: string;
      unit: string;
      activityDate: string;
      activityAmount: number;
      estimatedEmission: number;
      notes?: string;
    };

export interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
  // LLM tool-call'lari icin mesaj altinda cizilecek butonlar. Persist EDİLMEZ
  // (gecmis yeniden yuklenince yalniz metin gelir). Tap'ten sonra consumed=true.
  actions?: ChatMessageAction[];
  // Aksiyonlar kullanildi mi (tap sonrasi butonlar gizlenir / "yapildi" gosterilir).
  actionsConsumed?: boolean;
  // Kullanici create/log onayini IPTAL etti mi — "Tamamlandı" yerine "İptal edildi" gosterilir.
  actionsCancelled?: boolean;
  // Arac calisirken gosterilen durum etiketi (orn "📊 Tarla verilerini çekiyor"). Set iken
  // bos asistan balonunda TypingDots ile birlikte animasyonlu uc-nokta gosterilir. Ilk
  // chunk gelince temizlenir. Persist EDİLMEZ.
  statusLabel?: string;
}

// Theme type is defined in utils/theme.ts and re-exported here for convenience.
export type { Theme } from '../utils/theme';
