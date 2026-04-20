import { useState, useRef, useEffect, useCallback } from "react";
import { ChatMessage } from "../types";
import { API_HOST, authAPI } from "../utils/api";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

const ADVISORY_STREAM_URL = `${API_HOST}/api/advisory/stream`;
const SESSION_URL = `${API_HOST}/api/advisory/session`;
const HISTORY_URL = `${API_HOST}/api/advisory/history`;

// Arac adlari → kullanici dostu etiketler (noktalar dinamik eklenir)
const TOOL_LABELS: Record<string, string> = {
  get_field_overview: "📊 Tarla verilerini çekiyor",
  get_zone_latest: "📡 Sensör okumaları alınıyor",
  get_zone_history: "📈 Sensör geçmişi yükleniyor",
  get_zone_details: "⚙️ Bölge yapılandırması okunuyor",
  get_irrigation_history: "💧 Sulama geçmişi kontrol ediliyor",
  get_sensor_diagnostics: "🔧 Sensör sağlığı kontrol ediliyor",
  get_carbon_summary: "🌿 Karbon ayak izi hesaplanıyor",
  get_disease_history: "🍃 Hastalık geçmişi alınıyor",
  get_active_alerts: "🚨 Aktif uyarılar kontrol ediliyor",
  search_knowledge: "📚 Bilgi tabanında aranıyor",
  navigate_to_section: "🧭 Ekran yönlendiriliyor",
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
  section: string | null;
}

interface PendingNavigate {
  screen: string;
  section: string | null;
}

export type NavigateHandler = (screen: string, section: string | null) => void;

export interface ChatSessionSummary {
  session_id: string;
  field_name: string;
  started_at: string;
  last_message: string;
  last_message_at: string | null;
}

export const useChat = (
  onNavigate: NavigateHandler,
  fieldId: string | null,
) => {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [chatInput, setChatInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pendingBubble, setPendingBubble] = useState<PendingBubble | null>(null);

  const fieldIdRef = useRef(fieldId);
  const pendingNavigateRef = useRef<PendingNavigate | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const typingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toolDotIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentToolLabelRef = useRef<string>("");

  // Unmount'ta acik stream ve intervalleri temizle
  useEffect(() => {
    return () => {
      xhrRef.current?.abort();
      if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
      if (toolDotIntervalRef.current) clearInterval(toolDotIntervalRef.current);
    };
  }, []);

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

    // Stream temizleme — interval ve xhr referanslarini sifirlar
    const cleanupStream = () => {
      if (typingIntervalRef.current) { clearInterval(typingIntervalRef.current); typingIntervalRef.current = null; }
      if (toolDotIntervalRef.current) { clearInterval(toolDotIntervalRef.current); toolDotIntervalRef.current = null; }
      xhrRef.current = null;
    };

    // Hata mesajini streaming mesajina yaz ve stream'i temizle
    const setStreamError = (msg: string) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingId
            ? { ...m, text: msg, isStreaming: false }
            : m,
        ),
      );
      cleanupStream();
    };

    // Typing efekti — accumulated'dan karakter karakter goster
    let displayedLength = 0;
    let toolDotCount = 0;
    typingIntervalRef.current = setInterval(() => {
      if (displayedLength < accumulated.length) {
        displayedLength = Math.min(displayedLength + TYPING_CHARS_PER_TICK, accumulated.length);
        const visible = accumulated.slice(0, displayedLength);
        setMessages((prev) =>
          prev.map((m) => (m.id === streamingId ? { ...m, text: visible } : m)),
        );
      }
    }, TYPING_TICK_MS);

    // Onceki acik stream varsa iptal et, yeni xhr'i kaydet
    xhrRef.current?.abort();
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", ADVISORY_STREAM_URL);
    xhr.setRequestHeader("Content-Type", "application/json");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.timeout = 60000;

    let byteOffset = 0;
    let accumulated = "";

    // Stream bitince navigasyon ve bubble islemlerini yap
    const finalizeStream = () => {
      // Intervalleri temizle, kalan metni hemen goster
      if (typingIntervalRef.current) { clearInterval(typingIntervalRef.current); typingIntervalRef.current = null; }
      if (toolDotIntervalRef.current) { clearInterval(toolDotIntervalRef.current); toolDotIntervalRef.current = null; }
      xhrRef.current = null;
      if (accumulated) {
        setMessages((prev) =>
          prev.map((m) => (m.id === streamingId ? { ...m, text: accumulated } : m)),
        );
      }

      setIsLoading(false);

      if (pendingNavigateRef.current) {
        const { screen, section } = pendingNavigateRef.current;
        const bubbleText = accumulated || "Ekrana yönlendirildiniz.";
        pendingNavigateRef.current = null;
        onNavigate(screen, section);
        setPendingBubble({ text: bubbleText, screen, section });
        console.log("[CHAT] navigasyon:", screen, section ?? "-");
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
            section?: string | null;
          };

          if (parsed.navigate) {
            // Navigasyonu ertele — stream bitince yapilacak
            const validScreens = ["home", "timetable", "disease", "carbon", "settings"];
            if (validScreens.includes(parsed.navigate)) {
              pendingNavigateRef.current = {
                screen: parsed.navigate,
                section:
                  typeof parsed.section === "string" && parsed.section.length > 0
                    ? parsed.section
                    : null,
              };
            }
          }

          if (parsed.status) {
            // Onceki nokta animasyonunu temizle
            if (toolDotIntervalRef.current) { clearInterval(toolDotIntervalRef.current); toolDotIntervalRef.current = null; }
            toolDotCount = 0;

            // Arac etiketinden "..." son ekini kaldir (biz ekleyecegiz)
            const rawLabel = TOOL_LABELS[parsed.status] ?? "⏳ Veriler işleniyor";
            currentToolLabelRef.current = rawLabel.replace(/\.+$/, "");

            // Hemen goster
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamingId && !accumulated
                  ? { ...m, text: currentToolLabelRef.current }
                  : m,
              ),
            );

            // Nokta animasyonu baslat (1.2 saniyede bir nokta ekle, maks 3)
            toolDotIntervalRef.current = setInterval(() => {
              toolDotCount = (toolDotCount % 3) + 1;
              const dots = ".".repeat(toolDotCount);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamingId && !accumulated
                    ? { ...m, text: currentToolLabelRef.current + dots }
                    : m,
                ),
              );
            }, 500);
          }

          if (parsed.chunk) {
            // Ilk chunk gelince nokta animasyonunu durdur
            if (toolDotIntervalRef.current) {
              clearInterval(toolDotIntervalRef.current);
              toolDotIntervalRef.current = null;
            }
            accumulated += parsed.chunk;
          }

          if (parsed.done && parsed.session_id) {
            setSessionId(parsed.session_id);
          }

          if (parsed.error) {
            setStreamError("Üzgünüm, şu an asistan sunucusuna bağlanamıyorum.");
            setIsLoading(false);
          }
        } catch {
          if (line.startsWith("data: {")) {
            console.log("[CHAT] malformed SSE:", line.slice(0, 60));
          }
        }
      }
    };

    xhr.onprogress = () => {
      parseNewChunks(xhr.responseText);
    };

    xhr.onload = () => {
      parseNewChunks(xhr.responseText);

      if (!accumulated) {
        setStreamError("Yanıt alınamadı.");
        setIsLoading(false);
        return;
      }
      finalizeStream();
    };

    xhr.onerror = () => {
      setStreamError("Üzgünüm, şu an asistan sunucusuna bağlanamıyorum. Lütfen internet bağlantınızı kontrol edin.");
      setIsLoading(false);
    };

    xhr.ontimeout = () => {
      setStreamError("Üzgünüm, bağlantı zaman aşımına uğradı. Lütfen tekrar deneyin.");
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
