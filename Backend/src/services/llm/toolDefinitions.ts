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

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "navigate_to_section",
    description:
      "Open a specific section of the TARAS mobile app. Use SPARINGLY — only when SEEING genuinely helps the user more than text would. The mobile app will switch to the target tab, scroll the section into view, and pulse its border. After calling this tool, your final text reply is rendered as a small toast bubble on top of the target screen — keep that reply to ONE short sentence (<=140 characters). Do NOT navigate when a data tool already gives you the answer in numbers — a one-sentence text reply is usually better.",
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
      "Time-range sensor history for a zone. Use for trend analysis — 'last 24 hours', 'is moisture dropping?'. Default 24h, max 72h.",
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
      "Farm carbon-footprint summary by category: total emissions, breakdown by fuel / fertilizer / electricity. Use for carbon or emission questions.",
    input_schema: {
      type: "object" as const,
      properties: {
        farm_id: {
          type: "string",
          description: "Farm ID (farm_id)",
        },
      },
      required: ["farm_id"],
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
