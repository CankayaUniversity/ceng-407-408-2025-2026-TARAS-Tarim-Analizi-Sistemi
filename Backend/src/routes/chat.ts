import { Router } from "express";
import { getAIResponse } from "../services/llm.service";
import prisma from "../config/database";

const router = Router();

router.post("/ask", async (req, res) => {
  const { message, userId } = req.body;

  try {
    // 1. LLM'den cevap al
    const aiReply = await getAIResponse(message);

    // 2. Mesajları DB'ye kaydet (Opsiyonel ama önerilir)
    await prisma.chatMessage.create({
      data: {
        content: message,
        role: "USER",
        userId: userId
      }
    });

    res.json({ reply: aiReply });
  } catch (error) {
    res.status(500).json({ error: "LLM bağlantı hatası" });
  }
});

export default router;