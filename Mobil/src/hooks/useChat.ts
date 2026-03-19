import { useState, useRef, useEffect, useCallback } from "react";
import { ChatMessage } from "../types";
import { ScreenType } from "../constants";
import { API_HOST, authAPI } from "../utils/api";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

const ADVISORY_STREAM_URL = `${API_HOST}/api/advisory/stream`;
const SESSION_URL = `${API_HOST}/api/advisory/session`;

const WELCOME: ChatMessage = {
  id: "1",
  text: "Merhaba! Ben TarasMobil asistanınızım. Tarlanızdaki verileri analiz edebilir ve sorularınızı cevaplayabilirim.",
  sender: "assistant",
  timestamp: new Date(),
};

export const useChat = (_setScreen: (screen: ScreenType) => void, fieldId: string | null) => {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [chatInput, setChatInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const fieldIdRef = useRef(fieldId);
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
        field_id: currentFieldId,
        session_id: sessionIdSnapshot,
      }),
    );
  };

  return { messages, chatInput, setChatInput, sendMessage, isLoading, startNewChat };
};
