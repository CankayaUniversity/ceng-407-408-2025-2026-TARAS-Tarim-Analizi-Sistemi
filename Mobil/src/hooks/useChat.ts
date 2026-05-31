import { useState, useRef, useEffect, useCallback } from "react";
import { ChatMessage, ChatMessageAction } from "../types";
import { API_HOST, authAPI, isDemoToken, isLockedLiveDemo } from "../utils/api";
import type { DiseaseDetection, FieldSummary } from "../utils/api";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { runDemoTurn, type DemoSseEvent } from "../utils/demo/demoChat";
import type { TimetableFilterPayload } from "../context/TimetableFilterContext";

const ADVISORY_STREAM_URL = `${API_HOST}/api/advisory/stream`;
const SESSION_URL = `${API_HOST}/api/advisory/session`;
const HISTORY_URL = `${API_HOST}/api/advisory/history`;
const DELETE_SESSION_URL_BASE = `${API_HOST}/api/advisory/sessions`;

// Arac adlari → kullanici dostu etiketler (noktalar dinamik eklenir)
const TOOL_LABELS: Record<string, string> = {
  get_field_overview: "📊 Tarla verilerini çekiyor",
  get_zone_latest: "📡 Sensör okumaları alınıyor",
  get_zone_history: "📈 Sensör geçmişi yükleniyor",
  get_field_history: "📈 Tarla geçmişi yükleniyor",
  get_zone_details: "⚙️ Bölge yapılandırması okunuyor",
  get_irrigation_history: "💧 Sulama geçmişi kontrol ediliyor",
  get_sensor_diagnostics: "🔧 Sensör sağlığı kontrol ediliyor",
  get_carbon_summary: "🌿 Karbon ayak izi hesaplanıyor",
  get_disease_history: "🍃 Hastalık geçmişi alınıyor",
  get_active_alerts: "🚨 Aktif uyarılar kontrol ediliyor",
  search_knowledge: "📚 Bilgi tabanında aranıyor",
  navigate_to_section: "🧭 Ekran yönlendiriliyor",
  set_timetable_filters: "⚙️ Çizelge filtreleri ayarlanıyor",
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

export type NavigateHandler = (
  screen: string,
  section: string | null,
  zoneId?: string,
) => void;

// set_timetable_filters direktifi — LLM Cizelge filtrelerini degistirir.
export type SetFiltersHandler = (payload: TimetableFilterPayload) => void;

// add_carbon_log buton aksiyonu (camelCase) — onay sonrasi createLog'a gider.
export type CarbonLogAction = Extract<ChatMessageAction, { kind: "add_carbon_log" }>;

// Mesaj-alti butonlarla onaylanan LLM eylemleri (select_field / set_theme / set_language /
// add_carbon_log). ChatContext bunlari saglar; useChat yalnizca buton tap'inde cagirir.
export interface ChatActionHandlers {
  onSelectField?: (fieldId: string) => void;
  onSetTheme?: (mode: "light" | "dark" | "system") => void;
  onSetLanguage?: (lang: "tr" | "en") => void;
  // createLog cagrisi — true=basarili. void de kabul (demo/erisimsiz).
  onAddCarbonLog?: (action: CarbonLogAction) => Promise<boolean> | void;
}

export interface ChatSessionSummary {
  session_id: string;
  field_name: string;
  started_at: string;
  last_message: string;
  last_message_at: string | null;
}

/** ChatContext'in inject ettigi demo callback'leri (AWS modunda kullanilmaz). */
export interface DemoChatOptions {
  fields: FieldSummary[];
  selectedFieldName?: string;
  language: "tr" | "en";
  onSwitchTheme?: (mode: "light" | "dark" | "system") => Promise<void> | void;
  onSwitchLanguage?: (lang: "tr" | "en") => Promise<void> | void;
  onCreateFolder?: (
    zoneId: string,
    name: string,
  ) => Promise<{ folderId: string; folderName: string } | null>;
  onSimulateScan?: (label: string) => Promise<DiseaseDetection | null>;
}

// Backend {action:{kind,...}} SSE yukunu (snake_case) mobil ChatMessageAction'a (camelCase)
// cevirir. Taninmayan/eksik alanli kind -> null (atlanir).
function mapBackendAction(a: Record<string, unknown>): ChatMessageAction | null {
  const kind = a.kind;
  if (kind === "select_field" && typeof a.field_id === "string") {
    return {
      kind: "select_field",
      fieldId: a.field_id,
      fieldName: typeof a.field_name === "string" ? a.field_name : "",
    };
  }
  if (kind === "set_theme" && (a.mode === "light" || a.mode === "dark" || a.mode === "system")) {
    return { kind: "set_theme", mode: a.mode };
  }
  if (kind === "set_language" && (a.lang === "tr" || a.lang === "en")) {
    return { kind: "set_language", lang: a.lang };
  }
  if (
    kind === "add_carbon_log" &&
    typeof a.farm_id === "string" &&
    typeof a.activity_type_id === "number" &&
    typeof a.activity_amount === "number"
  ) {
    return {
      kind: "add_carbon_log",
      farmId: a.farm_id,
      activityTypeId: a.activity_type_id,
      activityTypeName: typeof a.activity_type_name === "string" ? a.activity_type_name : "",
      unit: typeof a.unit === "string" ? a.unit : "",
      activityDate: typeof a.activity_date === "string" ? a.activity_date : "",
      activityAmount: a.activity_amount,
      estimatedEmission:
        typeof a.estimated_emission === "number" ? a.estimated_emission : 0,
      ...(typeof a.notes === "string" ? { notes: a.notes } : {}),
    };
  }
  return null;
}

// Tek bir SSE event yukunu ({navigate|set_filters|action}) mesaj-alti aksiyon(lar)a cevirir.
// TEK kaynak: hem canli stream parse'i hem de kaydedilmis sohbet yuklemesi bunu kullanir,
// boylece eski sohbet acildiginda butonlar canli akistakiyle birebir ayni uretilir.
function eventToActions(ev: Record<string, any>): ChatMessageAction[] {
  const out: ChatMessageAction[] = [];
  if (ev.set_filters && typeof ev.set_filters === "object") {
    out.push({ kind: "set_filters", filters: ev.set_filters as Record<string, unknown> });
  } else if (ev.navigate) {
    const validScreens = ["home", "timetable", "disease", "carbon", "settings"];
    if (validScreens.includes(ev.navigate)) {
      out.push({
        kind: "navigate",
        screen: ev.navigate,
        section:
          typeof ev.section === "string" && ev.section.length > 0 ? ev.section : null,
        zoneId:
          typeof ev.zone_id === "string" && ev.zone_id.length > 0 ? ev.zone_id : undefined,
      });
    }
  }
  if (ev.action && typeof ev.action === "object") {
    const mapped = mapBackendAction(ev.action);
    if (mapped) out.push(mapped);
  }
  return out;
}

// Backend/demo'dan yuklenen ham mesaji ChatMessage'a cevir. Kaydedilmis aksiyon event'leri
// (m.events — ham SSE) varsa butona cevrilir ve TIKLANABILIR birakilir (kullanici eski
// sohbette butonu yeniden kullanabilsin). AMA add_carbon_log haric: yazma teklifi anlik bir
// onaydir; aylar sonra gecmisten yeniden "Onayla" sessizce ikinci kayit olusturur — riskli.
// Gorsel (navigate/set_filters/select_field) + ayar (theme/lang) butonlari guvenle geri gelir.
function toLoadedMessage(m: any): ChatMessage {
  const events = Array.isArray(m?.events) ? m.events : null;
  const actions: ChatMessageAction[] = events
    ? events
        .flatMap((e: any) => eventToActions(e))
        .filter((a: ChatMessageAction) => a.kind !== "add_carbon_log")
    : [];
  return {
    id: m.id,
    text: m.text,
    sender: m.sender as "user" | "assistant",
    timestamp: new Date(m.timestamp),
    ...(actions.length > 0 ? { actions } : {}),
  };
}

export const useChat = (
  onNavigate: NavigateHandler,
  fieldId: string | null,
  demoOptions?: DemoChatOptions,
  onSetFilters?: SetFiltersHandler,
  actionHandlers?: ChatActionHandlers,
) => {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [chatInput, setChatInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pendingBubble, setPendingBubble] = useState<PendingBubble | null>(null);

  const fieldIdRef = useRef(fieldId);
  // Stream sirasinda toplanan buton aksiyonlari — stream bitince mesaja iliştirilir,
  // OTOMATIK CALISMAZ; kullanici butona basinca runMessageAction tetikler.
  const pendingActionsRef = useRef<ChatMessageAction[]>([]);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const typingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentToolLabelRef = useRef<string>("");
  const demoTurnRef = useRef<{ cancel: () => void } | null>(null);
  const demoOptionsRef = useRef<DemoChatOptions | undefined>(demoOptions);
  useEffect(() => {
    demoOptionsRef.current = demoOptions;
  }, [demoOptions]);

  useEffect(() => {
    return () => {
      xhrRef.current?.abort();
      demoTurnRef.current?.cancel();
      if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
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

      // Kilitli demoda paylasilan hesabin sohbet gecmisini YUKLEME — testçiler
      // birbirinin konusmalarini gormesin. Yalnizca karsilama mesaji gosterilir.
      if (isLockedLiveDemo(token)) {
        setSessionId(null);
        setMessages([WELCOME]);
        return;
      }

      if (isDemoToken(token)) {
        const { getActiveSessionForField } = await import("../utils/demo/demoStorage");
        const fieldName = demoOptionsRef.current?.fields.find(
          (f) => f.id === fId,
        )?.name ?? "Tarla";
        const session = await getActiveSessionForField(fId, fieldName);
        if (session && session.messages.length > 0) {
          console.log("[CHAT] demo session yuklendi:", session.messages.length, "mesaj");
          setSessionId(session.session_id);
          setMessages([
            WELCOME,
            ...session.messages.map(toLoadedMessage),
          ]);
        } else {
          setSessionId(null);
          setMessages([WELCOME]);
        }
        return;
      }

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
            ...data.data.messages.map(toLoadedMessage),
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

  const startNewChat = useCallback(async () => {
    console.log("[CHAT] yeni sohbet");
    const token = await authAPI.getToken();
    if (isDemoToken(token) && fieldIdRef.current) {
      try {
        const { startNewSession } = await import("../utils/demo/demoStorage");
        await startNewSession(fieldIdRef.current);
      } catch { /* sessiz */ }
    }
    setSessionId(null);
    setMessages([WELCOME]);
    setChatInput("");
  }, []);

  const clearPendingBubble = useCallback(() => {
    setPendingBubble(null);
  }, []);

  // Mesaj-alti buton tap'i — ilgili eylemi calistirir, sonra butonlari "consumed" yapar.
  // choice: add_carbon_log icin "accept" | "cancel"; digerleri icin yok sayilir.
  // Navigasyon/filtre eylemleri pendingBubble set eder → ChatContext chat'i kapatir →
  // FocusableSection vurgu + 10sn toast (mevcut makine) devreye girer.
  const runMessageAction = useCallback(
    async (
      messageId: string,
      action: ChatMessageAction,
      choice?: "accept" | "cancel",
    ): Promise<void> => {
      // add_carbon_log "İptal": butonlari kapat + IPTAL isaretle (badge "İptal edildi"
      // gosterir, "Tamamlandı" DEGIL — kullanici onaylamis gibi gozukmesin).
      if (action.kind === "add_carbon_log" && choice === "cancel") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, actionsConsumed: true, actionsCancelled: true } : m,
          ),
        );
        return;
      }

      // Gorsel eylemler (navigate / set_filters / select_field) TEKRAR KULLANILABILIR:
      // buton tuketilmez, kullanici tekrar dokunup yeniden gezinebilir. Degistiren eylemler
      // (set_theme / set_language / add_carbon_log) tek seferliktir → actionsConsumed=true.
      const reusable =
        action.kind === "navigate" ||
        action.kind === "set_filters" ||
        action.kind === "select_field";

      let bubbleText = "";
      setMessages((prev) => {
        const msg = prev.find((m) => m.id === messageId);
        bubbleText = msg?.text || "";
        if (reusable) return prev;
        return prev.map((m) =>
          m.id === messageId ? { ...m, actionsConsumed: true } : m,
        );
      });

      switch (action.kind) {
        case "navigate":
          onNavigate(action.screen, action.section, action.zoneId);
          setPendingBubble({
            text: bubbleText || "Ekrana yönlendirildiniz.",
            screen: action.screen,
            section: action.section,
          });
          console.log("[CHAT] aksiyon navigate:", action.screen, action.section ?? "-");
          break;
        case "set_filters":
          onNavigate("timetable", null);
          onSetFilters?.(action.filters as TimetableFilterPayload);
          setPendingBubble({
            text: bubbleText || "Çizelge filtreleri uygulandı.",
            screen: "timetable",
            section: null,
          });
          console.log("[CHAT] aksiyon set_filters");
          break;
        case "select_field":
          actionHandlers?.onSelectField?.(action.fieldId);
          console.log("[CHAT] aksiyon select_field:", action.fieldId);
          break;
        case "set_theme":
          actionHandlers?.onSetTheme?.(action.mode);
          console.log("[CHAT] aksiyon set_theme:", action.mode);
          break;
        case "set_language":
          actionHandlers?.onSetLanguage?.(action.lang);
          console.log("[CHAT] aksiyon set_language:", action.lang);
          break;
        case "add_carbon_log":
          await actionHandlers?.onAddCarbonLog?.(action);
          console.log("[CHAT] aksiyon add_carbon_log:", action.activityTypeName);
          break;
      }
    },
    [onNavigate, onSetFilters, actionHandlers],
  );

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
    pendingActionsRef.current = [];

    const sessionIdSnapshot = sessionId;
    const token = await authAPI.getToken();

    // Stream temizleme — interval ve xhr referanslarini sifirlar
    const cleanupStream = () => {
      if (typingIntervalRef.current) { clearInterval(typingIntervalRef.current); typingIntervalRef.current = null; }
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
      xhrRef.current = null;
      // Toplanan aksiyonlari mesaja iliştir — OTOMATIK CALISTIRMA; butonla tetiklenir.
      const actions = pendingActionsRef.current;
      pendingActionsRef.current = [];
      if (accumulated || actions.length > 0) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingId
              ? {
                  ...m,
                  text: accumulated || m.text,
                  actions: actions.length > 0 ? actions : undefined,
                  // Durum etiketi/spinner'i kapat — yanit (metin veya butonlar) geldi.
                  statusLabel: undefined,
                }
              : m,
          ),
        );
      }
      if (actions.length > 0) {
        console.log("[CHAT] aksiyon butonlari:", actions.map((a) => a.kind).join(","));
      }

      setIsLoading(false);
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
            zone_id?: string;
            set_filters?: TimetableFilterPayload;
            action?: Record<string, unknown>;
          };

          // set_timetable_filters — navigate:"timetable" ile ayni event'te gelir; tek
          // "set_filters" aksiyonu uret (navigate'i ayrica ekleme). Aksi halde duz navigate.
          // navigate / set_filters / action -> mesaj-alti buton(lar). eventToActions
          // canli akis + kaydedilmis sohbet icin ortak parser.
          pendingActionsRef.current.push(...eventToActions(parsed));

          if (parsed.status) {
            // Arac etiketini statusLabel olarak set et (text bos kalir) -> bos balonda
            // TypingDots etiket + animasyonlu uc-nokta gosterir. Eski metin-bazli "..."
            // dongusu (setInterval) kaldirildi; animasyon artik ChatWindow'da.
            const rawLabel = TOOL_LABELS[parsed.status] ?? "⏳ Veriler işleniyor";
            currentToolLabelRef.current = rawLabel.replace(/\.+$/, "");
            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamingId && !accumulated
                  ? { ...m, statusLabel: currentToolLabelRef.current }
                  : m,
              ),
            );
          }

          if (parsed.chunk) {
            // Ilk chunk gelince durum etiketini temizle (metin akmaya basliyor)
            if (accumulated.length === 0) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamingId ? { ...m, statusLabel: undefined } : m,
                ),
              );
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

    // Demo: XHR yerine runDemoTurn parseNewChunks + finalizeStream ikilisine emit eder
    if (isDemoToken(token)) {
      const opts = demoOptionsRef.current;
      let demoBuffer = "";
      const handleDemoEvent = (event: DemoSseEvent) => {
        demoBuffer += `data: ${JSON.stringify(event)}\n`;
        parseNewChunks(demoBuffer);
        if (event.done) {
          finalizeStream();
          const fieldName =
            opts?.fields.find((f) => f.id === currentFieldId)?.name ?? "Tarla";
          const finalText = accumulated;
          void (async () => {
            try {
              const { appendMessages } = await import("../utils/demo/demoStorage");
              await appendMessages(currentFieldId, fieldName, [
                {
                  id: userMsg.id,
                  text: userMsg.text,
                  sender: "user",
                  timestamp: userMsg.timestamp.toISOString(),
                },
                {
                  id: streamingId,
                  text: finalText,
                  sender: "assistant",
                  timestamp: new Date().toISOString(),
                },
              ]);
            } catch (err) {
              console.log("[CHAT] demo persist err:", err);
            }
          })();
        }
      };

      demoTurnRef.current?.cancel();
      const handle = runDemoTurn({
        message: text,
        fieldId: currentFieldId,
        sessionId: sessionIdSnapshot,
        fields: opts?.fields ?? [],
        selectedFieldName: opts?.selectedFieldName,
        language: opts?.language ?? "tr",
        onSwitchTheme: opts?.onSwitchTheme,
        onSwitchLanguage: opts?.onSwitchLanguage,
        onCreateFolder: opts?.onCreateFolder,
        onSimulateScan: opts?.onSimulateScan,
        onEvent: handleDemoEvent,
      });
      demoTurnRef.current = handle;
      return;
    }

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
      // Kilitli demoda gecmis sekmesi bos — paylasilan hesabin konusmalari gosterilmez.
      if (isLockedLiveDemo(token)) {
        setHistorySessions([]);
        return;
      }
      setIsLoadingHistory(true);

      if (isDemoToken(token)) {
        const { listSessionSummaries } = await import("../utils/demo/demoStorage");
        const summaries = await listSessionSummaries();
        setHistorySessions(summaries);
        return;
      }

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

      if (isDemoToken(token)) {
        const { getSessionById } = await import("../utils/demo/demoStorage");
        const session = await getSessionById(sid);
        if (session && session.messages.length > 0) {
          setSessionId(session.session_id);
          setMessages([
            WELCOME,
            ...session.messages.map(toLoadedMessage),
          ]);
          console.log("[CHAT] demo gecmis session yuklendi:", sid.slice(0, 8));
        }
        return;
      }

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
          ...data.data.messages.map(toLoadedMessage),
        ]);
        console.log("[CHAT] gecmis session yuklendi:", sid.slice(0, 8));
      }
    } catch {
      console.log("[CHAT] session yuklenemedi:", sid.slice(0, 8));
    }
  }, []);

  // Bir gecmis session'i sil — backend (DELETE /advisory/sessions/:id) sahiplik dogrulamasi
  // yapar (user_id filtresi). Demo modunda demoStorage uzerinden silinir. Yerel listeden de
  // cikar; aktif yuklenmis oturum siliniyorsa yeni-sohbet durumuna doneriz.
  const deleteSession = useCallback(async (sid: string): Promise<boolean> => {
    try {
      const token = await authAPI.getToken();
      if (!token) return false;

      if (isDemoToken(token)) {
        const { deleteSession: demoDelete } = await import("../utils/demo/demoStorage");
        await demoDelete(sid);
      } else {
        const res = await fetchWithTimeout(
          `${DELETE_SESSION_URL_BASE}/${sid}`,
          {
            method: "DELETE",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
          10000,
        );
        const data = await res.json();
        if (!data.success) return false;
      }

      setHistorySessions((prev) => prev.filter((s) => s.session_id !== sid));

      if (sid === sessionId) {
        setSessionId(null);
        setMessages([WELCOME]);
      }

      return true;
    } catch {
      console.log("[CHAT] session silinemedi:", sid.slice(0, 8));
      return false;
    }
  }, [sessionId]);

  return {
    messages,
    chatInput,
    setChatInput,
    sendMessage,
    isLoading,
    startNewChat,
    pendingBubble,
    clearPendingBubble,
    runMessageAction,
    historySessions,
    isLoadingHistory,
    loadHistory,
    loadSessionById,
    deleteSession,
  };
};
