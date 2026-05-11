// Demo modu icin kelime tabanli intent matcher — yerel LLM yerine gecer.
// useChat XHR yerine runDemoTurn cagirir; SSE-shaped event sequence emit edilir.

import {
  generateDemoDashboardData,
  getDemoCarbonSummary,
  getDemoActiveAlerts,
  getDemoZones,
} from "./demoData";
import type { DiseaseDetection, FieldSummary } from "../api";

export type DemoChatLang = "tr" | "en";

export interface DemoSseEvent {
  status?: string;
  chunk?: string;
  navigate?: string;
  section?: string | null;
  done?: boolean;
  session_id?: string;
  error?: string;
}

export interface DemoTurnContext {
  message: string;
  fieldId: string | null;
  sessionId: string | null;
  fields: FieldSummary[];
  selectedFieldName?: string;
  language: DemoChatLang;
  onEvent: (event: DemoSseEvent) => void;
  onSwitchTheme?: (mode: "light" | "dark" | "system") => Promise<void> | void;
  onSwitchLanguage?: (lang: DemoChatLang) => Promise<void> | void;
  onCreateFolder?: (
    zoneId: string,
    name: string,
  ) => Promise<{ folderId: string; folderName: string } | null>;
  onSimulateScan?: (label: string) => Promise<DiseaseDetection | null>;
}

export interface DemoTurnHandle {
  cancel: () => void;
}

// ─────────────────────────────────────────────────────────────────────────
// Intent matcher
// ─────────────────────────────────────────────────────────────────────────

type Intent =
  | "field_overview"
  | "zone_latest"
  | "zone_history"
  | "disease_history"
  | "carbon_summary"
  | "active_alerts"
  | "irrigation_history"
  | "search_knowledge"
  | "switch_theme_dark"
  | "switch_theme_light"
  | "switch_lang_en"
  | "switch_lang_tr"
  | "create_folder"
  | "simulate_scan"
  | "navigate_home"
  | "navigate_disease"
  | "navigate_carbon"
  | "navigate_settings"
  | "navigate_timetable"
  | "help"
  | "default";

function matchIntent(message: string): Intent {
  const m = message.toLowerCase();

  // Theme switching
  if (/koyu\s*mod|karanl[ıi]k\s*mod|dark\s*mode|night\s*mode/.test(m))
    return "switch_theme_dark";
  if (/a[çc][ıi]k\s*mod|ayd[ıi]nl[ıi]k\s*mod|light\s*mode|day\s*mode/.test(m))
    return "switch_theme_light";

  // Language switching
  if (/ingilizce|english\s*(yap|to|please)?/.test(m)) return "switch_lang_en";
  if (/t[üu]rk[çc]e|turkish/.test(m)) return "switch_lang_tr";

  // Folder + scan creation
  if (/yeni\s+klas[öo]r|klas[öo]r\s+olu[şs]tur|create\s+folder|new\s+folder/.test(m))
    return "create_folder";
  if (
    /hastal[ıi]k\s*tara|tarama\s*yap|disease\s*scan|leaf\s*scan|run\s*scan|sahte\s*scan|simulate\s*scan/
      .test(m)
  )
    return "simulate_scan";

  // Help
  if (/yard[ıi]m|help|ne\s*yapabilir|what\s*can\s*you/.test(m)) return "help";

  // Tool intents (sira onemli — daha spesifik olan once)
  if (
    /(geçmi[şs]|history|son\s*\d+|trend|grafik|chart)/.test(m) &&
    /(s[ıi]cakl[ıi]k|nem|moisture|temperature|humidity|sens[öo]r|sensor)/.test(m)
  )
    return "zone_history";

  if (/(s[ıi]cakl[ıi]k|nem|moisture|temperature|humidity|sens[öo]r|sensor|[şs]u\s*an|now|latest|son\s*okuma)/.test(m))
    return "zone_latest";

  if (
    /(geçmi[şs]|history|kay[ıi]t|records?|onceki|onceden)/.test(m) &&
    /(hastal[ıi]k|disease|yaprak|leaf)/.test(m)
  )
    return "disease_history";

  if (/(karbon|carbon|co2|emisyon|emission)/.test(m)) return "carbon_summary";
  if (/(uyar[ıi]|alert|alarm|warning|bildirim)/.test(m)) return "active_alerts";
  if (/(sulama|irrigation|water)/.test(m)) return "irrigation_history";
  if (/(nedir|what\s*is|how\s*to|nas[ıi]l|tan[ıi]m)/.test(m)) return "search_knowledge";

  if (/(tarla.*[öo]zet|[öo]zetle|farm\s*summary|field\s*overview|durum)/.test(m))
    return "field_overview";

  // Navigation by name
  if (/(ana\s*sayfa|home(?!work))/.test(m)) return "navigate_home";
  if (/(hastal[ıi]k\s*ekran|disease\s*tab|disease\s*screen)/.test(m))
    return "navigate_disease";
  if (/(karbon\s*ekran|carbon\s*tab|carbon\s*screen)/.test(m))
    return "navigate_carbon";
  if (/(ayar|settings)/.test(m)) return "navigate_settings";
  if (/([çc]izelge|timetable|tablo|table)/.test(m)) return "navigate_timetable";

  return "default";
}

// ─────────────────────────────────────────────────────────────────────────
// Yardimci — biraz cok dilli metin
// ─────────────────────────────────────────────────────────────────────────

const T = {
  tr: {
    fieldOverview: (
      fieldName: string,
      moisture: number,
      temp: number,
      hum: number,
      nodes: number,
    ) =>
      `${fieldName} tarlasında şu an ${nodes} sensör ölçüm yapıyor. ` +
      `Ortalama toprak nemi %${moisture}, hava sıcaklığı ${temp}°C ve nem %${hum}. ` +
      (moisture < 30
        ? "Toprak nemi düşük; sulama programını kontrol etmeni öneririm. "
        : moisture > 80
          ? "Toprak nemi oldukça yüksek; sulamayı bir süre erteleyebilirsin. "
          : "Toprak nemi optimum aralıkta. "),
    zoneLatest: (
      moisture: number,
      temp: number,
      hum: number,
    ) =>
      `Son okumalar: toprak nemi %${moisture}, hava sıcaklığı ${temp}°C, nem %${hum}.`,
    zoneHistory: () =>
      "Son 24 saat sensör verilerini açıyorum. Çizelge ekranında nem ve sıcaklık trendlerini detaylı görebilirsin.",
    diseaseHistory: () =>
      "Son hastalık tespitlerini Hastalık ekranında listeledim. Klasörlere göre filtreleyebilirsin.",
    carbonSummary: (total: number, top: { category: string; total: number }) =>
      `Bu sezona kadar toplam ${total} kgCO2 emisyon ürettiniz. ` +
      `En yüksek katkı ${top.category} kategorisinden geliyor (${top.total} kgCO2). ` +
      "Karbon ekranında log ekleyip kaynaklarını takip edebilirsin.",
    activeAlerts: (count: number, first?: { title: string }) =>
      count === 0
        ? "Şu an aktif uyarı yok."
        : `${count} aktif uyarı var. En önemlisi: "${first?.title ?? "—"}".`,
    irrigationHistory: () =>
      "Son sulama kayıtlarını gösterdim. Çizelge ekranındaki sulama bölümünden detayları inceleyebilirsin.",
    searchKnowledge: () =>
      "Bu konuyla ilgili bilgi tabanında birkaç kayıt buldum. Tarımsal kaynaklara göre, doğru sulama ve gübreleme rejimi mahsulü %20'ye kadar artırabiliyor.",
    switchThemeDark: "Tamam — koyu moda geçtim.",
    switchThemeLight: "Tamam — açık moda geçtim.",
    switchLangEn: "Switching to English now.",
    switchLangTr: "Türkçeye geçiyorum.",
    createFolderSuccess: (name: string) =>
      `Yeni klasör oluşturdum: "${name}". Kamerayla çekeceğin fotoğraflar buraya bağlanabilir.`,
    createFolderError: "Klasör oluşturamadım — uygun bölge bulunamadı.",
    simulateScanSuccess: (label: string) =>
      `Sahte tarama tamamlandı; sonuç: ${label}. Hastalık ekranındaki Genel Tespitler listesinde görebilirsin.`,
    simulateScanError: "Sahte tarama başarısız oldu.",
    navigate: (target: string) => `${target} ekranına yönlendiriyorum.`,
    help:
      "Şu komutları deneyebilirsin: tarlamı özetle, nem geçmişini göster, koyu mod, İngilizce, yeni klasör oluştur, hastalık taraması yap.",
    fallback:
      "Demo modunda kelime tabanlı çalışıyorum, tam bir LLM bağlantısı yok. Şunları sorabilirsin: tarlamı özetle, nem nedir, hastalık taraması yap, koyu mod.",
    noField:
      "Henüz tarla seçilmedi. Lütfen Ana sayfadan bir tarla seçip tekrar dene.",
  },
  en: {
    fieldOverview: (
      fieldName: string,
      moisture: number,
      temp: number,
      hum: number,
      nodes: number,
    ) =>
      `Field "${fieldName}" has ${nodes} sensors reporting. ` +
      `Average soil moisture is ${moisture}%, air temp ${temp}°C, humidity ${hum}%. ` +
      (moisture < 30
        ? "Soil moisture is low — consider checking the irrigation schedule. "
        : moisture > 80
          ? "Soil moisture is high — you may delay watering for a bit. "
          : "Moisture is in the healthy range. "),
    zoneLatest: (moisture: number, temp: number, hum: number) =>
      `Latest readings: soil moisture ${moisture}%, air temp ${temp}°C, humidity ${hum}%.`,
    zoneHistory: () =>
      "Pulling the last 24 hours of sensor data. Open the Timetable tab to inspect humidity and temperature trends in detail.",
    diseaseHistory: () =>
      "I listed the recent disease detections on the Disease tab. You can filter by folder.",
    carbonSummary: (total: number, top: { category: string; total: number }) =>
      `This season totals ${total} kgCO2 emissions. ` +
      `The biggest contributor is ${top.category} at ${top.total} kgCO2. ` +
      "Open the Carbon tab to add logs and track sources.",
    activeAlerts: (count: number, first?: { title: string }) =>
      count === 0
        ? "No active alerts at the moment."
        : `${count} active alerts. The top one is: "${first?.title ?? "—"}".`,
    irrigationHistory: () =>
      "Surfacing the latest irrigation log. Use the Timetable tab's irrigation section for details.",
    searchKnowledge: () =>
      "Found a few entries in the knowledge base. Agronomic sources show that proper watering and fertilization can lift yield by up to 20%.",
    switchThemeDark: "Okay — switched to dark mode.",
    switchThemeLight: "Okay — switched to light mode.",
    switchLangEn: "Switching to English now.",
    switchLangTr: "Switching to Turkish.",
    createFolderSuccess: (name: string) =>
      `Created a new folder: "${name}". Photos you take next can be linked to it.`,
    createFolderError: "Could not create folder — no suitable zone found.",
    simulateScanSuccess: (label: string) =>
      `Demo scan complete; result: ${label}. You'll see it in the General Detections on the Disease tab.`,
    simulateScanError: "Demo scan failed.",
    navigate: (target: string) => `Navigating to ${target}.`,
    help:
      "Try: summarize my farm, show moisture history, dark mode, Turkish, create folder, run a disease scan.",
    fallback:
      "I'm running on a keyword matcher in demo mode (no live LLM). Try: summarize my farm, what's the moisture, run a disease scan, dark mode.",
    noField: "No field selected yet — please pick one from the Home tab.",
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────
// Streaming dispatcher
// ─────────────────────────────────────────────────────────────────────────

interface ScheduledEmit {
  delay: number; // ms after start
  event: DemoSseEvent;
}

function streamWords(
  startDelay: number,
  text: string,
  perWordMs = 35,
): ScheduledEmit[] {
  const out: ScheduledEmit[] = [];
  let cursor = startDelay;
  const tokens = text.match(/\S+\s*|\s+/g) ?? [text];
  for (const tok of tokens) {
    out.push({ delay: cursor, event: { chunk: tok } });
    cursor += perWordMs;
  }
  return out;
}

export function runDemoTurn(ctx: DemoTurnContext): DemoTurnHandle {
  const intent = matchIntent(ctx.message);
  const lang = ctx.language;
  const strings = T[lang];
  const sessionId = ctx.sessionId ?? `demo-sess-${Date.now().toString(36)}`;
  const timeoutHandles: ReturnType<typeof setTimeout>[] = [];
  let cancelled = false;

  const schedule = (delay: number, fn: () => void) => {
    const h = setTimeout(() => {
      if (!cancelled) fn();
    }, delay);
    timeoutHandles.push(h);
  };

  const cancel = () => {
    cancelled = true;
    for (const h of timeoutHandles) clearTimeout(h);
  };

  if (!ctx.fieldId) {
    schedule(80, () => ctx.onEvent({ chunk: strings.noField }));
    schedule(220, () => ctx.onEvent({ done: true, session_id: sessionId }));
    return { cancel };
  }

  const dashboard = generateDemoDashboardData(ctx.fieldId);
  const fieldName =
    ctx.selectedFieldName ??
    ctx.fields.find((f) => f.id === ctx.fieldId)?.name ??
    "Tarla";

  const dispatch = (
    toolStatus: string,
    text: string,
    nav?: { screen: string; section?: string | null } | null,
    afterStream?: () => void,
  ) => {
    schedule(0, () => ctx.onEvent({ status: toolStatus }));
    const events = streamWords(700, text);
    for (const e of events) {
      schedule(e.delay, () => ctx.onEvent(e.event));
    }
    const lastDelay = events.length
      ? events[events.length - 1].delay + 100
      : 800;
    if (nav) {
      schedule(lastDelay, () =>
        ctx.onEvent({ navigate: nav.screen, section: nav.section ?? null }),
      );
    }
    schedule(lastDelay + 60, () => {
      if (afterStream) afterStream();
      ctx.onEvent({ done: true, session_id: sessionId });
    });
  };

  switch (intent) {
    case "field_overview": {
      const text = strings.fieldOverview(
        fieldName,
        dashboard.sensors.soilMoisture,
        dashboard.weather.airTemperature,
        dashboard.weather.airHumidity,
        dashboard.sensors.nodeCount,
      );
      dispatch("get_field_overview", text, {
        screen: "home",
        section: "statusCard",
      });
      break;
    }

    case "zone_latest": {
      const text = strings.zoneLatest(
        dashboard.sensors.soilMoisture,
        dashboard.weather.airTemperature,
        dashboard.weather.airHumidity,
      );
      dispatch("get_zone_latest", text, {
        screen: "home",
        section: "statusCard",
      });
      break;
    }

    case "zone_history": {
      dispatch("get_zone_history", strings.zoneHistory(), {
        screen: "timetable",
        section: "soilMoistureChart",
      });
      break;
    }

    case "disease_history": {
      dispatch("get_disease_history", strings.diseaseHistory(), {
        screen: "disease",
        section: "detectionList",
      });
      break;
    }

    case "carbon_summary": {
      const summary = getDemoCarbonSummary();
      const top =
        summary.by_category.slice().sort((a, b) => b.total - a.total)[0] ??
        { category: "—", total: 0 };
      dispatch(
        "get_carbon_summary",
        strings.carbonSummary(summary.total_emission, top),
        { screen: "carbon", section: "summaryCard" },
      );
      break;
    }

    case "active_alerts": {
      const alerts = getDemoActiveAlerts(ctx.fieldId);
      dispatch(
        "get_active_alerts",
        strings.activeAlerts(alerts.length, alerts[0]),
        null,
      );
      break;
    }

    case "irrigation_history": {
      dispatch("get_irrigation_history", strings.irrigationHistory(), {
        screen: "timetable",
        section: "soilMoistureChart",
      });
      break;
    }

    case "search_knowledge": {
      dispatch("search_knowledge", strings.searchKnowledge(), null);
      break;
    }

    case "switch_theme_dark": {
      dispatch("navigate_to_section", strings.switchThemeDark, null, () => {
        ctx.onSwitchTheme?.("dark");
      });
      break;
    }

    case "switch_theme_light": {
      dispatch("navigate_to_section", strings.switchThemeLight, null, () => {
        ctx.onSwitchTheme?.("light");
      });
      break;
    }

    case "switch_lang_en": {
      dispatch("navigate_to_section", strings.switchLangEn, null, () => {
        ctx.onSwitchLanguage?.("en");
      });
      break;
    }

    case "switch_lang_tr": {
      dispatch("navigate_to_section", strings.switchLangTr, null, () => {
        ctx.onSwitchLanguage?.("tr");
      });
      break;
    }

    case "create_folder": {
      schedule(0, () => ctx.onEvent({ status: "navigate_to_section" }));
      schedule(700, async () => {
        const zones = getDemoZones().filter(
          (z) => z.field_id === ctx.fieldId,
        );
        const zone = zones[0];
        if (!zone || !ctx.onCreateFolder) {
          for (const e of streamWords(0, strings.createFolderError)) {
            schedule(e.delay, () => ctx.onEvent(e.event));
          }
          schedule(800, () =>
            ctx.onEvent({ done: true, session_id: sessionId }),
          );
          return;
        }
        const folderName = `${fieldName} — Demo Klasör ${
          Math.floor(Math.random() * 90) + 10
        }`;
        const created = await ctx.onCreateFolder(zone.zone_id, folderName);
        if (!created) {
          for (const e of streamWords(0, strings.createFolderError)) {
            schedule(e.delay, () => ctx.onEvent(e.event));
          }
          schedule(800, () =>
            ctx.onEvent({ done: true, session_id: sessionId }),
          );
          return;
        }
        const text = strings.createFolderSuccess(created.folderName);
        const events = streamWords(0, text);
        for (const e of events) schedule(e.delay, () => ctx.onEvent(e.event));
        const lastDelay = events.length
          ? events[events.length - 1].delay + 100
          : 800;
        schedule(lastDelay, () =>
          ctx.onEvent({ navigate: "disease", section: "detectionList" }),
        );
        schedule(lastDelay + 60, () =>
          ctx.onEvent({ done: true, session_id: sessionId }),
        );
      });
      break;
    }

    case "simulate_scan": {
      schedule(0, () => ctx.onEvent({ status: "get_disease_history" }));
      schedule(700, async () => {
        if (!ctx.onSimulateScan) {
          for (const e of streamWords(0, strings.simulateScanError)) {
            schedule(e.delay, () => ctx.onEvent(e.event));
          }
          schedule(800, () =>
            ctx.onEvent({ done: true, session_id: sessionId }),
          );
          return;
        }
        // Rastgele bir hastalik hint sec — gercekci dagilim
        const labels = ["healthy", "early_blight", "leaf_mold", "powdery_mildew"];
        const pick = labels[Math.floor(Math.random() * labels.length)];
        const detection = await ctx.onSimulateScan(pick);
        if (!detection) {
          for (const e of streamWords(0, strings.simulateScanError)) {
            schedule(e.delay, () => ctx.onEvent(e.event));
          }
          schedule(800, () =>
            ctx.onEvent({ done: true, session_id: sessionId }),
          );
          return;
        }
        const text = strings.simulateScanSuccess(
          detection.detected_disease ?? pick,
        );
        const events = streamWords(0, text);
        for (const e of events) schedule(e.delay, () => ctx.onEvent(e.event));
        const lastDelay = events.length
          ? events[events.length - 1].delay + 100
          : 800;
        schedule(lastDelay, () =>
          ctx.onEvent({ navigate: "disease", section: "detectionList" }),
        );
        schedule(lastDelay + 60, () =>
          ctx.onEvent({ done: true, session_id: sessionId }),
        );
      });
      break;
    }

    case "navigate_home":
      dispatch("navigate_to_section", strings.navigate("Home"), {
        screen: "home",
        section: null,
      });
      break;
    case "navigate_disease":
      dispatch("navigate_to_section", strings.navigate("Disease"), {
        screen: "disease",
        section: null,
      });
      break;
    case "navigate_carbon":
      dispatch("navigate_to_section", strings.navigate("Carbon"), {
        screen: "carbon",
        section: null,
      });
      break;
    case "navigate_settings":
      dispatch("navigate_to_section", strings.navigate("Settings"), {
        screen: "settings",
        section: null,
      });
      break;
    case "navigate_timetable":
      dispatch("navigate_to_section", strings.navigate("Timetable"), {
        screen: "timetable",
        section: null,
      });
      break;

    case "help": {
      schedule(80, () => ctx.onEvent({ chunk: strings.help }));
      schedule(900, () => ctx.onEvent({ done: true, session_id: sessionId }));
      break;
    }

    case "default":
    default: {
      schedule(80, () => ctx.onEvent({ chunk: strings.fallback }));
      schedule(1100, () => ctx.onEvent({ done: true, session_id: sessionId }));
      break;
    }
  }

  return { cancel };
}
