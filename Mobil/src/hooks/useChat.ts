// Chat hook - asistan mesajlasma mantigi
// Kullanim: messages, chatInput, setChatInput, sendMessage dondurur

import { useState } from "react";
import { ChatMessage } from "../types";
import { ScreenType } from "../constants";
import { getAssistantResponse } from "../utils/chatAssistant";

const WELCOME: ChatMessage = {
  id: "1",
  text: "Merhaba! Ben TarasMobil asistanınızım. Navigasyon ve sorularınız konusunda yardımcı olabilirim.",
  sender: "assistant",
  timestamp: new Date(),
};

export const useChat = (setScreen: (screen: ScreenType) => void) => {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [chatInput, setChatInput] = useState("");

  const sendMessage = () => {
    const text = chatInput.trim();
    if (!text) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      text,
      sender: "user",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setChatInput("");

    setTimeout(() => {
      const reply: ChatMessage = {
        id: (Date.now() + 1).toString(),
        text: getAssistantResponse(text, setScreen),
        sender: "assistant",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, reply]);
    }, 400);
  };

  return { messages, chatInput, setChatInput, sendMessage };
};
