import { useState, useRef, useEffect, useCallback } from "react";
import { ChatMessage } from "../types";
import { API_HOST, authAPI } from "../utils/api";

const ADVISORY_STREAM_URL = `${API_HOST}/api/advisory/stream`;

// Yayin hizi sabitleri — karakter/saniye
const TYPING_CHARS_PER_TICK = 1;
const TYPING_TICK_MS = 25;

const WELCOME: ChatMessage = {
  id: "1",
  text: "Merhaba! Ben TarasMobil asistanınızım. Tarlanızdaki verileri analiz edebilir ve sorularınızı cevaplayabilirim.",
  sender: "assistant",
  timestamp: new Date(),
};

export const useChat = (fieldId: string | null) => {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [chatInput, setChatInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const fieldIdRef = useRef(fieldId);

  useEffect(() => {
    fieldIdRef.current = fieldId;
  }, [fieldId]);

  // Yeni sohbet baslat
  const startNewChat = useCallback(() => {
    console.log("[CHAT] yeni sohbet");
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

    // Bos asistan mesaji — stream geldikce doldurulacak
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

    const token = await authAPI.getToken();

    // Typing efekti — accumulated'dan karakter karakter goster
    let displayedLength = 0;
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

    const finalizeStream = () => {
      clearInterval(typingInterval);
      if (accumulated) {
        setMessages((prev) =>
          prev.map((m) => (m.id === streamingId ? { ...m, text: accumulated } : m)),
        );
      }
      setIsLoading(false);
    };

    const parseNewChunks = (responseText: string) => {
      const newData = responseText.slice(byteOffset);
      byteOffset = responseText.length;

      const lines = newData.split("\n");
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const parsed = JSON.parse(line.slice(6)) as {
            chunk?: string;
            done?: boolean;
            error?: string;
          };

          if (parsed.chunk) {
            accumulated += parsed.chunk;
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
      }),
    );
  };

  return {
    messages,
    chatInput,
    setChatInput,
    sendMessage,
    isLoading,
    startNewChat,
  };
};
