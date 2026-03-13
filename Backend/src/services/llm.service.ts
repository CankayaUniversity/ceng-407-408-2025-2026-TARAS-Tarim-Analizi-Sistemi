import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

// 1. AWS İstemcisini Başlatıyoruz
// .env dosyasındaki AWS_REGION ve AWS_ACCESS_KEY bilgilerini otomatik olarak algılar.
const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || "eu-north-1" });

/**
 * TARAS verilerini (JSON) ve çiftçinin sorusunu alıp AWS Bedrock üzerinden LLM'e gönderir.
 * Model olarak hızı ve maliyet avantajı sebebiyle Claude 3 Haiku kullanıyoruz.
 */
export const generateAdvisory = async (tarasContext: any, userMessage: string) => {
  

  // Modelin halüsinasyon yapmasını (uydurmasını) engelleyen en kritik yer burasıdır.
  const systemPrompt = `Sen TARAS (Tarımsal Karar Destek Sistemi) için çalışan uzman bir ziraat asistanısın.

KESİN KURALLAR:
1. Sana verilen [TARAS SİSTEM VERİSİ] dışındaki hiçbir bilgiyi kullanarak sulama, ilaç veya gübre tavsiyesi verme.
2. Çiftçi teknik olmayan bir dilde soru sorabilir, ona her zaman saygılı, net ve profesyonel bir dille (Sen/Siz) hitap et.
3. Kural motorunun aldığı kararın ("son_sistem_karari") NEDENİNİ, sistem eşiklerini ("sistem_esikleri") ve mevcut durumu ("mevcut_durum") karşılaştırarak açıkla.
4. Eğer çiftçinin sorusunun cevabı verilerde yoksa, tahmin yürütme! Sadece "Mevcut sistem verilerinde bu soruya dair bir ölçüm bulunmuyor" de.
5. Cevabın kısa ve doğrudan konuya yönelik olsun.`;

  // ==========================================
  // 3. KULLANICI MESAJI (User Prompt)
  // ==========================================
  // Prisma'dan gelen JSON'ı ve çiftçinin sorusunu şablona gömüyoruz.
  const promptText = `
[TARAS SİSTEM VERİSİ]
${JSON.stringify(tarasContext, null, 2)}

[ÇİFTÇİNİN SORUSU]
${userMessage}
  `;

  // ==========================================
  // 4. AWS BEDROCK PAYLOAD (Claude 3 Formatı)
  // ==========================================
  const payload = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 500, // Model en fazla kaç kelime/token üretebilir?
    temperature: 0.1, // DİKKAT: Sıfıra yakın olması, modelin "yaratıcılığını" öldürüp sadece verilere sadık kalmasını sağlar. Tarımda yaratıcılık istemeyiz.
    system: systemPrompt,
    messages: [
      { role: "user", content: [{ type: "text", text: promptText }] }
    ]
  };

  try {
    // 5. API İsteğini Hazırlama ve Gönderme
    const command = new InvokeModelCommand({
      modelId: "anthropic.claude-3-haiku-20240307-v1:0", // AWS konsolunda erişim açtığın modelin ID'si
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(payload),
    });

    const response = await client.send(command);
    
    // 6. AWS'den Dönen Cevabı Çözümleme (Buffer to String)
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    // Claude 3'ün cevap formatına göre metni dönüyoruz
    return responseBody.content[0].text;

  } catch (error) {
    console.error("LLM Çağrı Hatası:", error);
    return "Şu anda TARAS yapay zeka asistanına ulaşılamıyor. Lütfen daha sonra tekrar deneyin.";
  }
};