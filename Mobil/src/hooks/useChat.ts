import { useState, useRef, useEffect } from "react";
import { ChatMessage } from "../types";
import { ScreenType } from "../constants";
import { API_HOST, authAPI } from "../utils/api";

const ADVISORY_STREAM_URL = `${API_HOST}/api/advisory/stream`;

const WELCOME: ChatMessage = {
  id: "1",
  text: "Merhaba! Ben TarasMobil asistanınızım. Tarlanızdaki verileri analiz edebilir ve sorularınızı cevaplayabilirim.",
  sender: "assistant",
  timestamp: new Date(),
};

export const useChat = (_setScreen: (screen: ScreenType) => void, zoneId: string | null) => {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [chatInput, setChatInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Ref ile her zaman guncel zoneId'ye eris
  const zoneIdRef = useRef(zoneId);
  useEffect(() => {
    zoneIdRef.current = zoneId;
  }, [zoneId]);

  const sendMessage = async () => {
    const text = chatInput.trim();
    if (!text || isLoading) return;

    const currentZoneId = zoneIdRef.current;
    if (!currentZoneId) {
      const noZoneMsg: ChatMessage = {
        id: "error-" + Date.now(),
        text: "Henüz tarla verisi yüklenmedi. Lütfen bir tarla seçin ve tekrar deneyin.",
        sender: "assistant",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, noZoneMsg]);
      return;
    }

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      text,
      sender: "user",
      timestamp: new Date(),
    };

    // Boş asistan mesajı ekle — stream geldikçe doldurulacak
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

    const sessionIdSnapshot = sessionId;

    const token = await authAPI.getToken();

    const xhr = new XMLHttpRequest();
    xhr.open("POST", ADVISORY_STREAM_URL);
    xhr.setRequestHeader("Content-Type", "application/json");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.timeout = 60000;

    let byteOffset = 0;
    let accumulated = "";

    const parseNewChunks = (responseText: string) => {
      const newData = responseText.slice(byteOffset);
      byteOffset = responseText.length;

      // SSE satırlarını işle
      const lines = newData.split("\n");
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const parsed = JSON.parse(line.slice(6)) as {
            chunk?: string;
            done?: boolean;
            session_id?: string;
            error?: string;
          };

          if (parsed.chunk) {
            accumulated += parsed.chunk;
            const snapshot = accumulated;
            setMessages((prev) =>
              prev.map((m) => (m.id === streamingId ? { ...m, text: snapshot } : m)),
            );
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
      // Son kalan veriyi işle
      parseNewChunks(xhr.responseText);

      if (!accumulated) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingId ? { ...m, text: "Yanıt alınamadı." } : m,
          ),
        );
      }
      setIsLoading(false);
    };

    xhr.onerror = () => {
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
        zone_id: currentZoneId,
        session_id: sessionIdSnapshot,
      }),
    );
  };

  return { messages, chatInput, setChatInput, sendMessage, isLoading };
};
