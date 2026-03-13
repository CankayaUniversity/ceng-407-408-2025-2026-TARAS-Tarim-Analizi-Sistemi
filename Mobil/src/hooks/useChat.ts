import { useState } from "react";
import { ChatMessage } from "../types";
import { ScreenType } from "../constants";

// Kendi bilgisayarının yerel IP adresini yaz (Örn: 192.168.1.50)
// localhost veya 127.0.0.1 fiziksel cihazlarda/emülatörlerde çalışmaz.
const API_URL = "http://192.168.1.xx:3000/api/advisory";

const WELCOME: ChatMessage = {
  id: "1",
  text: "Merhaba! Ben TarasMobil asistanınızım. Tarlanızdaki verileri analiz edebilir ve sorularınızı cevaplayabilirim.",
  sender: "assistant",
  timestamp: new Date(),
};

export const useChat = (setScreen: (screen: ScreenType) => void) => {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [chatInput, setChatInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const sendMessage = async () => {
    const text = chatInput.trim();
    if (!text || isLoading) return;

    // 1. Kullanıcı mesajını ekrana ekle
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
      // 2. Backend'e (TARAS-Backend) istek at
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text,
          zone_id: "zone-1", // Şimdilik test için sabit, gerekirse dinamik yapılabilir
          session_id: sessionId // Varsa önceki oturum ID'sini gönder
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Session ID'yi güncelle (Hafıza için)
        if (data.session_id) setSessionId(data.session_id);

        // 3. Backend'den gelen LLM cevabını ekrana ekle
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
      console.error("Chat Hatası:", error);
      const errorMsg: ChatMessage = {
        id: "error-" + Date.now(),
        text: "Üzgünüm, şu an asistan sunucusuna bağlanamıyorum. Lütfen internetini veya server'ı kontrol et.",
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