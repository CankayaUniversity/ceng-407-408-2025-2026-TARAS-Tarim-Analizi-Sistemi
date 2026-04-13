import { useState, useRef, useEffect, useCallback } from "react";
import { ChatMessage } from "../types";
import { ScreenType } from "../constants";
import { API_HOST, authAPI } from "../utils/api";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

const ADVISORY_STREAM_URL = `${API_HOST}/api/advisory/stream`;
const SESSION_URL = `${API_HOST}/api/advisory/session`;
const HISTORY_URL = `${API_HOST}/api/advisory/history`;

// Arac adlari → kullanici dostu Turkce etiketler
// Arac adlari → kullanici dostu etiketler (noktalar dinamik eklenir)
const TOOL_LABELS: Record<string, string> = {
  get_field_overview: "📊 Tarla verilerini çekiyor",
  get_zone_latest: "📡 Sensör okumaları alınıyor",
  get_zone_history: "📈 Sensör geçmişi yükleniyor",
  get_zone_details: "⚙️ Bölge yapılandırması okunuyor",
  get_irrigation_history: "💧 Sulama geçmişi kontrol ediliyor",
  get_sensor_diagnostics: "🔧 Sensör sağlığı kontrol ediliyor",
  get_carbon_summary: "🌿 Karbon ayak izi hesaplanıyor",
  search_knowledge: "📚 Bilgi tabanında aranıyor",
  navigate_to_screen: "🧭 Ekran yönlendiriliyor",
};

// Yayin hizi sabitleri — karakter/saniye
const TYPING_CHARS_PER_TICK = 1;
const TYPING_TICK_MS = 25;

const WELCOME: ChatMessage = {
  id: "1",
  text: "Merhaba! Ben TarasMobil asistanınızım. Tarlanızdaki verileri analiz edebilir ve sorularınızı cevaplayabilirim.",
  sender: "assistant",
  timestamp: new Date(),
};

export interface PendingBubble {
  text: string;
  screen: string;
}

export interface ChatSessionSummary {
  session_id: string;
  field_name: string;
  started_at: string;
  last_message: string;
  last_message_at: string | null;
}

export const useChat = (setScreen: (screen: ScreenType) => void, fieldId: string | null) => {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [chatInput, setChatInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pendingBubble, setPendingBubble] = useState<PendingBubble | null>(null);

  const fieldIdRef = useRef(fieldId);
  const pendingNavigateRef = useRef<string | null>(null);

  useEffect(() => {
    fieldIdRef.current = fieldId;
  }, [fieldId]);

  // Tarla degisince mevcut session'i yukle
  const loadFieldSession = useCallback(async (fId: string) => {
    try {
      const token = await authAPI.getToken();
      if (!token) return;

      const res = await fetchWithTimeout(
        `${SESSION_URL}?field_id=${fId}`,
        {
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
        10000,
      );

      const data = await res.json();
      if (data.success && data.data) {
        if (data.data.session_id && data.data.messages.length > 0) {
          console.log("[CHAT] session yuklendi:", data.data.messages.length, "mesaj");
          setSessionId(data.data.session_id);
          setMessages([
            WELCOME,
            ...data.data.messages.map((m: any) => ({
              id: m.id,
              text: m.text,
              sender: m.sender as "user" | "assistant",
              timestamp: new Date(m.timestamp),
            })),
          ]);
        } else {
          console.log("[CHAT] yeni tarla, session yok");
          setSessionId(null);
          setMessages([WELCOME]);
        }
      }
    } catch {
      console.log("[CHAT] session yuklenemedi");
      setSessionId(null);
      setMessages([WELCOME]);
    }
  }, []);

  // fieldId degisince session degistir
  useEffect(() => {
    if (fieldId) {
      loadFieldSession(fieldId);
    } else {
      setSessionId(null);
      setMessages([WELCOME]);
    }
  }, [fieldId, loadFieldSession]);

  // Yeni sohbet baslat
  const startNewChat = useCallback(() => {
    console.log("[CHAT] yeni sohbet");
    setSessionId(null);
    setMessages([WELCOME]);
    setChatInput("");
  }, []);

  const clearPendingBubble = useCallback(() => {
    setPendingBubble(null);
  }, []);

  const sendMessage = async () => {
    const text = chatInput.trim();
    if (!text || isLoading) return;

    const currentFieldId = fieldIdRef.current;
    if (!currentFieldId) {
      const noFieldMsg: ChatMessage = {
        id: "error-" + Date.now(),
        text: "Henüz tarla verisi yüklenmedi. Lütfen bir tarla seçin ve tekrar deneyin.",
        sender: "assistant",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, noFieldMsg]);
      return;
    }

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      text,
      sender: "user",
      timestamp: new Date(),
    };

    // Bos asistan mesaji ekle — stream geldikce doldurulacak
    const streamingId = "streaming-" + (Date.now() + 1);
    const streamingMsg: ChatMessage = {
      id: streamingId,
      text: "",
      sender: "assistant",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg, streamingMsg]);
    setChatInput("");
    setIsLoading(true);
    pendingNavigateRef.current = null;

    const sessionIdSnapshot = sessionId;
    const token = await authAPI.getToken();

    // Typing efekti — accumulated'dan karakter karakter goster
    let displayedLength = 0;
    // Arac kullanimi nokta animasyonu
    let toolDotInterval: ReturnType<typeof setInterval> | null = null;
    let toolDotCount = 0;
    let currentToolLabel = "";
    const typingInterval = setInterval(() => {
      if (displayedLength < accumulated.length) {
        displayedLength = Math.min(displayedLength + TYPING_CHARS_PER_TICK, accumulated.length);
        const visible = accumulated.slice(0, displayedLength);
        setMessages((prev) =>
          prev.map((m) => (m.id === streamingId ? { ...m, text: visible } : m)),
        );
      }
    }, TYPING_TICK_MS);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", ADVISORY_STREAM_URL);
    xhr.setRequestHeader("Content-Type", "application/json");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.timeout = 60000;

    let byteOffset = 0;
    let accumulated = "";

    // Stream bitince navigasyon ve bubble islemlerini yap
    const finalizeStream = () => {
      // Intervalleri temizle, kalan metni hemen goster
      clearInterval(typingInterval);
      if (toolDotInterval) clearInterval(toolDotInterval);
      if (accumulated) {
        setMessages((prev) =>
          prev.map((m) => (m.id === streamingId ? { ...m, text: accumulated } : m)),
        );
      }

      setIsLoading(false);

      if (pendingNavigateRef.current) {
        const screen = pendingNavigateRef.current;
        const bubbleText = accumulated || "Ekrana yönlendirildiniz.";
        pendingNavigateRef.current = null;
        setScreen(screen as ScreenType);
        setPendingBubble({ text: bubbleText, screen });
        console.log("[CHAT] navigasyon:", screen);
      }
    };

    const parseNewChunks = (responseText: string) => {
      const newData = responseText.slice(byteOffset);
      byteOffset = responseText.length;

      // SSE satirlarini isle
      const lines = newData.split("\n");
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const parsed = JSON.parse(line.slice(6)) as {
            chunk?: string;
            done?: boolean;
            session_id?: string;
            error?: string;
            status?: string;
            navigate?: string;
          };

          if (parsed.navigate) {
            // Navigasyonu ertele — stream bitince yapilacak
            const validScreens = ["home", "timetable", "disease", "carbon", "settings"];
            if (validScreens.includes(parsed.navigate)) {
              pendingNavigateRef.current = parsed.navigate;
            }
          }

          if (parsed.status) {
            // Onceki nokta animasyonunu temizle
            if (toolDotInterval) clearInterval(toolDotInterval);
            toolDotCount = 0;

            // Arac etiketinden "..." son ekini kaldir (biz ekleyecegiz)
            const rawLabel = TOOL_LABELS[parsed.status] ?? "⏳ Veriler işleniyor";
            currentToolLabel = rawLabel.replace(/\.+$/, "");

            // Hemen goster
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamingId && !accumulated
                  ? { ...m, text: currentToolLabel }
                  : m,
              ),
            );

            // Nokta animasyonu baslat (1.2 saniyede bir nokta ekle, maks 3)
            toolDotInterval = setInterval(() => {
              toolDotCount = (toolDotCount % 3) + 1;
              const dots = ".".repeat(toolDotCount);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamingId && !accumulated
                    ? { ...m, text: currentToolLabel + dots }
                    : m,
                ),
              );
            }, 500);
          }

          if (parsed.chunk) {
            // Ilk chunk gelince nokta animasyonunu durdur
            if (toolDotInterval) {
              clearInterval(toolDotInterval);
              toolDotInterval = null;
            }
            accumulated += parsed.chunk;
          }

          if (parsed.done && parsed.session_id) {
            setSessionId(parsed.session_id);
          }

          if (parsed.error) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamingId
                  ? { ...m, text: "Üzgünüm, şu an asistan sunucusuna bağlanamıyorum." }
                  : m,
              ),
            );
          }
        } catch {
          // Eksik JSON — sonraki onprogress'te tekrar denenecek
        }
      }
    };

    xhr.onprogress = () => {
      parseNewChunks(xhr.responseText);
    };

    xhr.onload = () => {
      parseNewChunks(xhr.responseText);

      if (!accumulated) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingId ? { ...m, text: "Yanıt alınamadı." } : m,
          ),
        );
      }
      finalizeStream();
    };

    xhr.onerror = () => {
      clearInterval(typingInterval);
      if (toolDotInterval) clearInterval(toolDotInterval);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingId
            ? { ...m, text: "Üzgünüm, şu an asistan sunucusuna bağlanamıyorum. Lütfen internet bağlantınızı kontrol edin." }
            : m,
        ),
      );
      setIsLoading(false);
    };

    xhr.ontimeout = () => {
      clearInterval(typingInterval);
      if (toolDotInterval) clearInterval(toolDotInterval);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingId
            ? { ...m, text: "Üzgünüm, bağlantı zaman aşımına uğradı. Lütfen tekrar deneyin." }
            : m,
        ),
      );
      setIsLoading(false);
    };

    xhr.send(
      JSON.stringify({
        message: text,
        field_id: currentFieldId,
        session_id: sessionIdSnapshot,
      }),
    );
  };

  // Gecmis sohbetleri yukle
  const [historySessions, setHistorySessions] = useState<ChatSessionSummary[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const token = await authAPI.getToken();
      if (!token) return;
      setIsLoadingHistory(true);
      const res = await fetchWithTimeout(
        HISTORY_URL,
        { headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" } },
        10000,
      );
      const data = await res.json();
      if (data.success && data.data) {
        setHistorySessions(data.data);
      }
    } catch {
      console.log("[CHAT] gecmis yuklenemedi");
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  // Belirli bir gecmis session'i yukle
  const loadSessionById = useCallback(async (sid: string) => {
    try {
      const token = await authAPI.getToken();
      if (!token) return;
      // Session mesajlarini session endpoint'inden al (field_id gerekmez, session id ile)
      const res = await fetchWithTimeout(
        `${SESSION_URL}?session_id=${sid}`,
        { headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" } },
        10000,
      );
      const data = await res.json();
      if (data.success && data.data?.session_id && data.data.messages.length > 0) {
        setSessionId(data.data.session_id);
        setMessages([
          WELCOME,
          ...data.data.messages.map((m: any) => ({
            id: m.id,
            text: m.text,
            sender: m.sender as "user" | "assistant",
            timestamp: new Date(m.timestamp),
          })),
        ]);
        console.log("[CHAT] gecmis session yuklendi:", sid.slice(0, 8));
      }
    } catch {
      console.log("[CHAT] session yuklenemedi:", sid.slice(0, 8));
    }
  }, []);

  return {
    messages,
    chatInput,
    setChatInput,
    sendMessage,
    isLoading,
    startNewChat,
    pendingBubble,
    clearPendingBubble,
    historySessions,
    isLoadingHistory,
    loadHistory,
    loadSessionById,
  };
};
