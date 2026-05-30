// LLM arac tanimlari — Anthropic Tool[] formati
// navigate_to_section: duz enum <screen>.<section> formatinda hedef alir
// Bolum navigasyonu ve yeni veri araclari (disease history, alerts) burada tanimli
import Anthropic from "@anthropic-ai/sdk";

// Bolum hedefleri — mobil UI'daki tum odaklanabilir alanlarin tek kaynagi
// Format: "<screen>.<section>". Mobil parser string'i nokta ile boler.
export const SECTION_TARGETS = [
  // Home
  "home.statusCard",
  "home.fieldVisualization",
  // Timetable
  "timetable.timeRangeSelector",
  "timetable.temperatureChart",
  "timetable.humidityChart",
  "timetable.soilMoistureChart",
  "timetable.tableButton",
  // Carbon
  "carbon.summaryCard",
  "carbon.categoryButtons",
  "carbon.recentLogsList",
  // Disease
  "disease.detectionList",
  "disease.addButton",
  // Settings
  "settings.themeMode",
  "settings.language",
  "settings.awsTest",
  "settings.hardwareSetup",
  "settings.logout",
] as const;

export type SectionTarget = (typeof SECTION_TARGETS)[number];

// Cizelge (Timetable) filtre secenekleri — mobil tarafindaki AggregationMode/MetricKey
// ile birebir ayni. set_timetable_filters tool semasi + toolExecutor dogrulamasi tek
// kaynaktan beslensin diye burada tutulur.
export const TIMETABLE_AGGREGATIONS = ["per_node", "per_zone_avg", "field_avg"] as const;
export const TIMETABLE_METRICS = ["temperature", "humidity", "sm_percent"] as const;
export const TIMETABLE_VIEWS = ["chart", "table"] as const;
export type TimetableAggregation = (typeof TIMETABLE_AGGREGATIONS)[number];
export type TimetableMetric = (typeof TIMETABLE_METRICS)[number];
export type TimetableView = (typeof TIMETABLE_VIEWS)[number];

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "navigate_to_section",
    description:
      "Open a specific section of the TARAS mobile app: it switches to the target tab, scrolls the section into view, and pulses its border. Your final text reply is then rendered as a small toast bubble on top of that screen (the system prompt governs when to navigate and the toast length). Provide the <screen>.<section> target (one of the enum values) and a one-line reason.",
    input_schema: {
      type: "object" as const,
      properties: {
        target: {
          type: "string",
          enum: [...SECTION_TARGETS],
          description:
            "The <screen>.<section> ID to navigate to. Must be one of the listed enum values.",
        },
        reason: {
          type: "string",
          description:
            "One short sentence explaining why this section answers the user's question.",
        },
      },
      required: ["target", "reason"],
    },
  },
  {
    name: "highlight_zone",
    description:
      "Point at a specific zone on the Home screen's 3D field view: switches to the Home tab, focuses the field visualization, selects the given zone, and draws a connector line from that zone up to its sensor/irrigation data card. The zone must belong to the user's currently viewed field. Your final text reply is rendered as a small toast bubble on top of the Home screen (the system prompt governs when to use this and the toast length). Provide zone_id and a one-line reason.",
    input_schema: {
      type: "object" as const,
      properties: {
        zone_id: {
          type: "string",
          description: "The zone_id of the zone to highlight on the 3D field view.",
        },
        reason: {
          type: "string",
          description:
            "One short sentence explaining why highlighting this zone answers the user's question.",
        },
      },
      required: ["zone_id", "reason"],
    },
  },
  {
    name: "set_timetable_filters",
    description:
      "Open the Timetable screen — the app's dedicated surface for visualizing the three sensor metrics (temperature, humidity, soil moisture) over a time window as line charts or a table — with the filters you choose. This is the DEFAULT, GO-TO response whenever the user wants to see, compare, or track any of those metrics across a period, even implicitly: 'how was the temperature this week', 'soil moisture trend', 'last 3 days', 'compare zone A and B humidity', 'this month's data as a table'. Asking for the data over a period IS asking to see it here — do NOT wait for an explicit 'show/open/chart'. Unlike navigate_to_section (which only scrolls to and pulses a control without changing it), this ACTUALLY CHANGES what is plotted: time window, aggregation mode, which metrics, zone selection, and chart-vs-table view. Every field is optional; send ONLY what should change (pick table view for raw values/rows). The Timetable tab opens and your reply is shown as a small toast on top of it, so keep it short and point at what is now on screen. Provide a one-line reason.",
    input_schema: {
      type: "object" as const,
      properties: {
        range: {
          type: "object",
          description:
            "Time window. Provide ONE of: (a) days — last N days from now; (b) hours — last N hours from now (sub-day); (c) from+to — a SPECIFIC past calendar range as ISO dates (YYYY-MM-DD), e.g. {from:'2026-05-01', to:'2026-05-10'} for 'May 1 to 10' or 'last week of April'. Use from+to whenever the user names actual dates/months rather than a rolling 'last N'. Omit to leave the current range unchanged.",
          properties: {
            days: {
              type: "number",
              description: "Last N days from now (1-90). Rolling window ending now.",
            },
            hours: {
              type: "number",
              description: "Last N hours from now (1-2160). Use for sub-day windows like 6 or 12.",
            },
            from: {
              type: "string",
              description: "Custom range START date, ISO YYYY-MM-DD. Must be paired with `to` and be before it.",
            },
            to: {
              type: "string",
              description: "Custom range END date, ISO YYYY-MM-DD. Must be paired with `from`.",
            },
          },
        },
        aggregation: {
          type: "string",
          enum: [...TIMETABLE_AGGREGATIONS],
          description:
            "How lines are grouped: per_node (one line per sensor), per_zone_avg (one averaged line per zone), field_avg (single field-wide average line).",
        },
        metrics: {
          type: "array",
          items: { type: "string", enum: [...TIMETABLE_METRICS] },
          description:
            "Which metrics to plot (one chart each): temperature, humidity, sm_percent (soil moisture %). Omit to leave unchanged; at least one must remain.",
        },
        zones: {
          type: "array",
          items: { type: "string" },
          description:
            "Zone IDs to show — must be zone_id UUIDs of the selected field, copied verbatim from the context. Pass an empty array [] to show ALL zones. Omit to leave the current zone selection unchanged.",
        },
        view: {
          type: "string",
          enum: [...TIMETABLE_VIEWS],
          description: "chart (line graphs) or table (raw rows + summary stats). Omit to leave unchanged.",
        },
        reason: {
          type: "string",
          description:
            "One short sentence explaining why these filters answer the user's question.",
        },
      },
      required: ["reason"],
    },
  },
  {
    name: "select_field",
    description:
      "Switch the app's actively-selected field. The whole app (Home dashboard, Timetable, Carbon) follows the selected field, so use this when the user wants to WORK WITH or LOOK AT a different field than the current [SELECTED] one. A 'Go' button appears under your reply; the user taps it to switch. Provide the field_id (verbatim from context) and a one-line reason.",
    input_schema: {
      type: "object" as const,
      properties: {
        field_id: {
          type: "string",
          description: "The field_id to switch to (a UUID from the context, copied verbatim).",
        },
        reason: {
          type: "string",
          description: "One short sentence explaining why switching to this field helps.",
        },
      },
      required: ["field_id", "reason"],
    },
  },
  {
    name: "set_theme",
    description:
      "Change the app's color theme. An 'Apply' button appears under your reply; the user taps it to apply. Use for 'switch to dark mode', 'go light', 'follow system'. Provide mode and a one-line reason.",
    input_schema: {
      type: "object" as const,
      properties: {
        mode: {
          type: "string",
          enum: ["light", "dark", "system"],
          description: "light, dark, or system (follow the OS setting).",
        },
        reason: {
          type: "string",
          description: "One short sentence explaining the change.",
        },
      },
      required: ["mode", "reason"],
    },
  },
  {
    name: "set_language",
    description:
      "Change the app's interface language. An 'Apply' button appears under your reply; the user taps it to apply. Supported: Turkish (tr) and English (en). Provide lang and a one-line reason.",
    input_schema: {
      type: "object" as const,
      properties: {
        lang: {
          type: "string",
          enum: ["tr", "en"],
          description: "tr (Turkish) or en (English).",
        },
        reason: {
          type: "string",
          description: "One short sentence explaining the change.",
        },
      },
      required: ["lang", "reason"],
    },
  },
  {
    name: "add_carbon_log",
    description:
      "Stage a new carbon-footprint activity log for the user's farm. This does NOT write anything by itself — it shows the user an 'Accept / Cancel' confirmation under your reply with the computed CO2 estimate; the record is only created when they tap Accept. Use when the user wants to RECORD an activity, e.g. 'log 50 liters of diesel', 'add 100 kg urea for today'. First call get_activity_types to find the correct activity_type_id and its unit. Only stage a log when the user has clearly stated the activity and amount — never invent the amount. Provide a one-line reason.",
    input_schema: {
      type: "object" as const,
      properties: {
        activity_type_id: {
          type: "number",
          description:
            "The activity_type_id from get_activity_types matching what the user described (e.g. diesel, urea, electricity).",
        },
        activity_amount: {
          type: "number",
          description: "Amount in the activity type's unit (e.g. liters, kg, kWh). Must be > 0.",
        },
        activity_date: {
          type: "string",
          description:
            "ISO date (YYYY-MM-DD) of the activity. Omit to use today. Only set it if the user gave a specific date.",
        },
        notes: {
          type: "string",
          description: "Optional short note for the log entry.",
        },
        reason: {
          type: "string",
          description: "One short sentence explaining what is being logged.",
        },
      },
      required: ["activity_type_id", "activity_amount", "reason"],
    },
  },
  {
    name: "get_field_overview",
    description:
      "Full snapshot of a field: all zones' current sensor values (soil moisture, temperature, humidity), system thresholds, and last irrigation decision. Use for 'how's my field?' or 'should I irrigate?'",
    input_schema: {
      type: "object" as const,
      properties: {
        field_id: {
          type: "string",
          description:
            "Field ID (field_id). Use the [SELECTED] field's ID from the context.",
        },
      },
      required: ["field_id"],
    },
  },
  {
    name: "get_zone_latest",
    description:
      "Latest sensor readings for a single zone: soil moisture %, temperature, air humidity, battery. Use when asked about one specific zone.",
    input_schema: {
      type: "object" as const,
      properties: {
        zone_id: {
          type: "string",
          description: "Zone ID (zone_id)",
        },
      },
      required: ["zone_id"],
    },
  },
  {
    name: "get_zone_history",
    description:
      "Compact sensor STATISTICS for one zone over the last N hours (default 24, max 72): for temperature, humidity and soil moisture % it returns avg, min, max, the first vs last value and the overall direction (rising/falling/flat) — a cheap numeric summary, NOT a point-by-point series. Use for 'is moisture dropping?' or the zone's recent average. To let the user SEE the chart over time, use set_timetable_filters instead.",
    input_schema: {
      type: "object" as const,
      properties: {
        zone_id: {
          type: "string",
          description: "Zone ID (zone_id)",
        },
        hours: {
          type: "number",
          description: "How many hours of history (default 24, max 72)",
        },
      },
      required: ["zone_id"],
    },
  },
  {
    name: "get_field_history",
    description:
      "Compact field-wide sensor STATISTICS over the last N days (1-90, default 7), every zone averaged together: for temperature, humidity and soil moisture % it returns avg, min, max, the first vs last value and the overall direction (rising/falling/flat) — a cheap numeric summary to REASON about a multi-day trend, NOT a point-by-point series. Use it to answer 'what was the average/highest moisture this week?' or 'is temperature trending down over 10 days?' when get_zone_history's single-zone 72-hour limit is not enough. To let the user SEE the actual chart over time use set_timetable_filters; for one zone's shorter window use get_zone_history.",
    input_schema: {
      type: "object" as const,
      properties: {
        field_id: {
          type: "string",
          description:
            "Field ID (field_id). Use the [SELECTED] field's ID from the context.",
        },
        days: {
          type: "number",
          description: "How many days of history to summarize (1-90, default 7).",
        },
      },
      required: ["field_id"],
    },
  },
  {
    name: "get_zone_details",
    description:
      "Zone adaptive-control configuration: Kc coefficient, irrigation gain, target/critical soil-moisture thresholds, active planting, crop info, Kc calibration history. Use when asked about thresholds or planting.",
    input_schema: {
      type: "object" as const,
      properties: {
        zone_id: {
          type: "string",
          description: "Zone ID (zone_id)",
        },
      },
      required: ["zone_id"],
    },
  },
  {
    name: "get_irrigation_history",
    description:
      "Past irrigation decisions for a zone: date, status (PENDING/EXECUTED/SKIPPED), duration, reason, soil-moisture before/after. Use for 'when did we irrigate?' questions.",
    input_schema: {
      type: "object" as const,
      properties: {
        zone_id: {
          type: "string",
          description: "Zone ID (zone_id)",
        },
        limit: {
          type: "number",
          description: "How many records (default 5, max 20)",
        },
      },
      required: ["zone_id"],
    },
  },
  {
    name: "get_sensor_diagnostics",
    description:
      "Sensor node health: reboot reasons, boot count, failures, last comms timestamp, battery. Use for sensor/hardware health questions.",
    input_schema: {
      type: "object" as const,
      properties: {
        node_id: {
          type: "string",
          description: "Sensor node ID (node_id)",
        },
      },
      required: ["node_id"],
    },
  },
  {
    name: "get_carbon_summary",
    description:
      "Farm carbon-footprint summary by category: total emissions, breakdown by fuel / fertilizer / electricity, and the log count per category. Use for carbon or emission questions. Optionally restrict to the last N days for trend questions ('emissions this week/month').",
    input_schema: {
      type: "object" as const,
      properties: {
        farm_id: {
          type: "string",
          description: "Farm ID (farm_id)",
        },
        days: {
          type: "number",
          description:
            "Optional: only count activities from the last N days (1-365). Omit for all-time total.",
        },
      },
      required: ["farm_id"],
    },
  },
  {
    name: "get_activity_types",
    description:
      "List the carbon activity types the user can log, grouped by category (fuel / fertilizer / electricity), each with its activity_type_id and unit. Call this BEFORE add_carbon_log to find the right activity_type_id and the unit the amount must be in.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_disease_history",
    description:
      "Fetch the user's recent plant-disease detections. Returns disease name, confidence %, status (COMPLETED/FAILED/PROCESSING), and timestamps. Use when the user asks about past photos, detection accuracy, or 'what diseases did I find'.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "How many recent detections to return (1-10, default 5).",
          minimum: 1,
          maximum: 10,
        },
        status: {
          type: "string",
          enum: ["any", "completed", "failed"],
          description: "Filter by detection status (default: any).",
        },
      },
      required: [],
    },
  },
  {
    name: "get_active_alerts",
    description:
      "Fetch the user's currently unread system alerts: low battery, sensor offline, critical moisture, irrigation failures. Use when the user asks 'what's wrong', 'are there any warnings', or you need to proactively surface an issue.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Max alerts to return (1-20, default 10).",
          minimum: 1,
          maximum: 20,
        },
        severity: {
          type: "string",
          enum: ["any", "INFO", "WARNING", "CRITICAL"],
          description: "Filter by severity (default: any).",
        },
      },
      required: [],
    },
  },
  {
    name: "search_knowledge",
    description:
      "Search the agricultural knowledge base: plant diseases, fertilizer guides, irrigation techniques, Turkish regional climate data, pest control. Use only when the built-in reference in the system prompt does not cover the topic.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search query (Turkish or Latin plant/disease name).",
        },
        limit: {
          type: "number",
          description: "Max results (default 3, max 5).",
        },
      },
      required: ["query"],
    },
  },
];
