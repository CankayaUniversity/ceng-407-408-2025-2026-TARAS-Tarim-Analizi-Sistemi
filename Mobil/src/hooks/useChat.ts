import { useState, useRef, useEffect } from "react";
import { ChatMessage } from "../types";
import { ScreenType } from "../constants";
import { API_HOST } from "../utils/api";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

const ADVISORY_URL = `${API_HOST}/api/advisory`;

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

    setMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setIsLoading(true);

    try {
      const response = await fetchWithTimeout(
        ADVISORY_URL,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            zone_id: currentZoneId,
            session_id: sessionId,
          }),
        },
        15000,
      );

      const data = await response.json();

      if (data.success) {
        if (data.session_id) setSessionId(data.session_id);

        const reply: ChatMessage = {
          id: (Date.now() + 1).toString(),
          text: data.reply,
          sender: "assistant",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, reply]);
      } else {
        throw new Error(data.error || "Sunucu hatası");
      }
    } catch (error) {
      console.log("[ERR] chat fetch failed:", error);
      const errorMsg: ChatMessage = {
        id: "error-" + Date.now(),
        text: "Üzgünüm, şu an asistan sunucusuna bağlanamıyorum. Lütfen internet bağlantınızı kontrol edin.",
        sender: "assistant",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return { messages, chatInput, setChatInput, sendMessage, isLoading };
};
