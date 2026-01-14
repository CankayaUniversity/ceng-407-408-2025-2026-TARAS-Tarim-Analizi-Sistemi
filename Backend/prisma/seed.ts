import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const demoData = {
  users: [
    {
      user_id: "a0000000-0000-0000-0000-000000000001",
      username: "ahmet_ciftci",
      email: "ahmet@example.com",
      password: "password123",
    },
    {
      user_id: "a0000000-0000-0000-0000-000000000002",
      username: "fatma_toprak",
      email: "fatma@example.com",
      password: "password123",
    },
    {
      user_id: "a0000000-0000-0000-0000-000000000003",
      username: "tarik_tohum",
      email: "tarik@example.com",
      password: "password123",
    },
  ],
  farms: [
    {
      farm_id: "b0000000-0000-0000-0000-000000000001",
      user_id: "a0000000-0000-0000-0000-000000000001",
      name: "Ahmet Çiftliği",
      location_text: "Ankara, Turkey (39.9208, 32.8541)",
    },
    {
      farm_id: "b0000000-0000-0000-0000-000000000002",
      user_id: "a0000000-0000-0000-0000-000000000002",
      name: "Toprak Tarım",
      location_text: "Antalya, Turkey (36.8969, 30.7133)",
    },
    {
      farm_id: "b0000000-0000-0000-0000-000000000003",
      user_id: "a0000000-0000-0000-0000-000000000003",
      name: "Tarık'ın Çiftliği",
      location_text: "İzmir, Turkey (38.4237, 27.1428)",
    },
  ],
  fields: [
    {
      field_id: "c0000000-0000-0000-0000-000000000001",
      farm_id: "b0000000-0000-0000-0000-000000000001",
      name: "Domates Tarlası",
      area: 15.5,
      polygon: {
        exterior: [
          [0, 0],
          [120, 0],
          [120, 80],
          [0, 80],
        ],
        holes: [],
      },
    },
    {
      field_id: "c0000000-0000-0000-0000-000000000002",
      farm_id: "b0000000-0000-0000-0000-000000000001",
      name: "Biber Seracılığı",
      area: 8.2,
      polygon: {
        exterior: [
          [0, 0],
          [80, 0],
          [80, 40],
          [50, 40],
          [50, 70],
          [0, 70],
        ],
        holes: [],
      },
    },
    {
      field_id: "c0000000-0000-0000-0000-000000000003",
      farm_id: "b0000000-0000-0000-0000-000000000002",
      name: "Patates Bahçesi",
      area: 22.0,
      polygon: {
        exterior: [
          [0, 0],
          [150, 0],
          [150, 100],
          [0, 100],
        ],
        holes: [
          [
            [60, 40],
            [90, 40],
            [90, 60],
            [60, 60],
          ],
        ],
      },
    },
    {
      field_id: "c0000000-0000-0000-0000-000000000004",
      farm_id: "b0000000-0000-0000-0000-000000000002",
      name: "Domates-Biber Karışık",
      area: 5.8,
      polygon: {
        exterior: [
          [10, 5],
          [95, 0],
          [100, 55],
          [5, 65],
        ],
        holes: [],
      },
    },
    {
      field_id: "c0000000-0000-0000-0000-000000000005",
      farm_id: "b0000000-0000-0000-0000-000000000003",
      name: "Domates Serası",
      area: 3.2,
      polygon: {
        exterior: [
          [0, 0],
          [60, 0],
          [60, 40],
          [0, 40],
        ],
        holes: [],
      },
    },
    {
      field_id: "c0000000-0000-0000-0000-000000000006",
      farm_id: "b0000000-0000-0000-0000-000000000003",
      name: "Biber Bahçesi",
      area: 4.8,
      polygon: {
        exterior: [
          [0, 0],
          [70, 0],
          [70, 30],
          [40, 30],
          [40, 60],
          [0, 60],
        ],
        holes: [],
      },
    },
    {
      field_id: "c0000000-0000-0000-0000-000000000007",
      farm_id: "b0000000-0000-0000-0000-000000000003",
      name: "Patates Tarlası",
      area: 12.5,
      polygon: {
        exterior: [
          [0, 0],
          [140, 5],
          [145, 90],
          [10, 95],
          [5, 50],
        ],
        holes: [
          [
            [60, 40],
            [80, 40],
            [80, 55],
            [60, 55],
          ],
        ],
      },
    },
  ],
  zones: [
    {
      zone_id: "d0000000-0000-0000-0000-000000000001",
      field_id: "c0000000-0000-0000-0000-000000000001",
      name: "Domates Ana Bölge",
      soil_type: "loamy",
    },
    {
      zone_id: "d0000000-0000-0000-0000-000000000002",
      field_id: "c0000000-0000-0000-0000-000000000002",
      name: "Biber Ana Bölge",
      soil_type: "clay",
    },
    {
      zone_id: "d0000000-0000-0000-0000-000000000003",
      field_id: "c0000000-0000-0000-0000-000000000003",
      name: "Patates Ana Bölge",
      soil_type: "sandy",
    },
    {
      zone_id: "d0000000-0000-0000-0000-000000000004",
      field_id: "c0000000-0000-0000-0000-000000000004",
      name: "Karışık Sebze Ana Bölge",
      soil_type: "loamy",
    },
    {
      zone_id: "d0000000-0000-0000-0000-000000000005",
      field_id: "c0000000-0000-0000-0000-000000000005",
      name: "Domates Serası Ana Bölge",
      soil_type: "loamy",
    },
    {
      zone_id: "d0000000-0000-0000-0000-000000000006",
      field_id: "c0000000-0000-0000-0000-000000000006",
      name: "Biber Bahçesi Ana Bölge",
      soil_type: "clay",
    },
    {
      zone_id: "d0000000-0000-0000-0000-000000000007",
      field_id: "c0000000-0000-0000-0000-000000000007",
      name: "Patates Tarlası Ana Bölge",
      soil_type: "sandy",
    },
  ],
  sensors: [
    // Zone 1 (Domates - Ahmet/Ankara)
    {
      node_id: "e0000000-0000-0000-0000-000000000001",
      zone_id: "d0000000-0000-0000-0000-000000000001",
      hardware_mac: "AA:BB:CC:DD:EE:01",
      x: 18,
      z: 63,
      battery_level: 87,
    },
    {
      node_id: "e0000000-0000-0000-0000-000000000002",
      zone_id: "d0000000-0000-0000-0000-000000000001",
      hardware_mac: "AA:BB:CC:DD:EE:02",
      x: 103,
      z: 57,
      battery_level: 92,
    },
    {
      node_id: "e0000000-0000-0000-0000-000000000003",
      zone_id: "d0000000-0000-0000-0000-000000000001",
      hardware_mac: "AA:BB:CC:DD:EE:03",
      x: 32,
      z: 15,
      battery_level: 78,
    },
    {
      node_id: "e0000000-0000-0000-0000-000000000004",
      zone_id: "d0000000-0000-0000-0000-000000000001",
      hardware_mac: "AA:BB:CC:DD:EE:04",
      x: 87,
      z: 28,
      battery_level: 85,
    },
    // Zone 2 (Biber - Ahmet/Ankara)
    {
      node_id: "e0000000-0000-0000-0000-000000000005",
      zone_id: "d0000000-0000-0000-0000-000000000002",
      hardware_mac: "AA:BB:CC:DD:EE:05",
      x: 22,
      z: 58,
      battery_level: 91,
    },
    {
      node_id: "e0000000-0000-0000-0000-000000000006",
      zone_id: "d0000000-0000-0000-0000-000000000002",
      hardware_mac: "AA:BB:CC:DD:EE:06",
      x: 47,
      z: 18,
      battery_level: 88,
    },
    {
      node_id: "e0000000-0000-0000-0000-000000000007",
      zone_id: "d0000000-0000-0000-0000-000000000002",
      hardware_mac: "AA:BB:CC:DD:EE:07",
      x: 12,
      z: 8,
      battery_level: 95,
    },
    {
      node_id: "e0000000-0000-0000-0000-000000000008",
      zone_id: "d0000000-0000-0000-0000-000000000002",
      hardware_mac: "AA:BB:CC:DD:EE:08",
      x: 68,
      z: 13,
      battery_level: 23,
    },
    // Zone 3 (Patates - Fatma/Antalya)
    {
      node_id: "e0000000-0000-0000-0000-000000000009",
      zone_id: "d0000000-0000-0000-0000-000000000003",
      hardware_mac: "AA:BB:CC:DD:EE:09",
      x: 25,
      z: 73,
      battery_level: 82,
    },
    {
      node_id: "e0000000-0000-0000-0000-000000000010",
      zone_id: "d0000000-0000-0000-0000-000000000003",
      hardware_mac: "AA:BB:CC:DD:EE:0A",
      x: 112,
      z: 86,
      battery_level: 79,
    },
    {
      node_id: "e0000000-0000-0000-0000-000000000011",
      zone_id: "d0000000-0000-0000-0000-000000000003",
      hardware_mac: "AA:BB:CC:DD:EE:0B",
      x: 38,
      z: 27,
      battery_level: 94,
    },
    {
      node_id: "e0000000-0000-0000-0000-000000000012",
      zone_id: "d0000000-0000-0000-0000-000000000003",
      hardware_mac: "AA:BB:CC:DD:EE:0C",
      x: 128,
      z: 14,
      battery_level: 86,
    },
    // Zone 4 (Karışık - Fatma/Antalya)
    {
      node_id: "e0000000-0000-0000-0000-000000000013",
      zone_id: "d0000000-0000-0000-0000-000000000004",
      hardware_mac: "AA:BB:CC:DD:EE:0D",
      x: 55,
      z: 43,
      battery_level: 90,
    },
    {
      node_id: "e0000000-0000-0000-0000-000000000014",
      zone_id: "d0000000-0000-0000-0000-000000000004",
      hardware_mac: "AA:BB:CC:DD:EE:0E",
      x: 73,
      z: 28,
      battery_level: 88,
    },
    {
      node_id: "e0000000-0000-0000-0000-000000000015",
      zone_id: "d0000000-0000-0000-0000-000000000004",
      hardware_mac: "AA:BB:CC:DD:EE:0F",
      x: 42,
      z: 19,
      battery_level: 76,
    },
    {
      node_id: "e0000000-0000-0000-0000-000000000016",
      zone_id: "d0000000-0000-0000-0000-000000000004",
      hardware_mac: "AA:BB:CC:DD:EE:10",
      x: 27,
      z: 38,
      battery_level: 0,
      status: "INACTIVE" as const,
    },
    // Zone 5 (Domates Serası - Tarık/İzmir) - greenhouse layout
    {
      node_id: "e0000000-0000-0000-0000-000000000017",
      zone_id: "d0000000-0000-0000-0000-000000000005",
      hardware_mac: "AA:BB:CC:DD:EE:11",
      x: 13,
      z: 27,
      battery_level: 88,
    },
    {
      node_id: "e0000000-0000-0000-0000-000000000018",
      zone_id: "d0000000-0000-0000-0000-000000000005",
      hardware_mac: "AA:BB:CC:DD:EE:12",
      x: 34,
      z: 18,
      battery_level: 90,
    },
    {
      node_id: "e0000000-0000-0000-0000-000000000019",
      zone_id: "d0000000-0000-0000-0000-000000000005",
      hardware_mac: "AA:BB:CC:DD:EE:13",
      x: 48,
      z: 23,
      battery_level: 85,
    },
    // Zone 6 (Biber Bahçesi - Tarık/İzmir) - L-shaped field
    {
      node_id: "e0000000-0000-0000-0000-00000000001A",
      zone_id: "d0000000-0000-0000-0000-000000000006",
      hardware_mac: "AA:BB:CC:DD:EE:14",
      x: 17,
      z: 33,
      battery_level: 92,
    },
    {
      node_id: "e0000000-0000-0000-0000-00000000001B",
      zone_id: "d0000000-0000-0000-0000-000000000006",
      hardware_mac: "AA:BB:CC:DD:EE:15",
      x: 52,
      z: 19,
      battery_level: 87,
    },
    {
      node_id: "e0000000-0000-0000-0000-00000000001C",
      zone_id: "d0000000-0000-0000-0000-000000000006",
      hardware_mac: "AA:BB:CC:DD:EE:16",
      x: 28,
      z: 47,
      battery_level: 91,
    },
    // Zone 7 (Patates Tarlası - Tarık/İzmir) - irregular field with hole
    {
      node_id: "e0000000-0000-0000-0000-00000000001D",
      zone_id: "d0000000-0000-0000-0000-000000000007",
      hardware_mac: "AA:BB:CC:DD:EE:17",
      x: 35,
      z: 68,
      battery_level: 84,
    },
    {
      node_id: "e0000000-0000-0000-0000-00000000001E",
      zone_id: "d0000000-0000-0000-0000-000000000007",
      hardware_mac: "AA:BB:CC:DD:EE:18",
      x: 95,
      z: 52,
      battery_level: 89,
    },
    {
      node_id: "e0000000-0000-0000-0000-00000000001F",
      zone_id: "d0000000-0000-0000-0000-000000000007",
      hardware_mac: "AA:BB:CC:DD:EE:19",
      x: 118,
      z: 23,
      battery_level: 86,
    },
  ],
};

// İzmir January 2025 weather data (historical)
// Temp: High 19°C, Low -1°C, Avg 11°C
// Humidity: High 100%, Low 42%, Avg 79%
interface WeatherProfile {
  avgTemp: number;
  tempRange: number;
  avgHumidity: number;
  humidityRange: number;
  // Rain events (day of month)
  rainDays: number[];
  // Cold snap periods [startDay, endDay]
  coldSnaps: [number, number][];
  // Warm periods [startDay, endDay]
  warmPeriods: [number, number][];
}

const izmirJanuaryWeather: WeatherProfile = {
  avgTemp: 11,
  tempRange: 20, // -1 to 19
  avgHumidity: 79,
  humidityRange: 58, // 42 to 100
  rainDays: [4, 5, 10, 11, 12, 18, 19, 25, 26, 27],
  coldSnaps: [
    [1, 3],
    [7, 9],
    [21, 23],
  ],
  warmPeriods: [
    [13, 16],
    [28, 31],
  ],
};

// Sensor behavior profiles for Tarık's farm
interface SensorBehavior {
  nodeId: string;
  name: string;
  baseMoisture: number;
  moistureVariation: number;
  tempOffset: number; // offset from outdoor temp (greenhouse effect)
  humidityOffset: number;
  // Special events: [dayStart, dayEnd, moistureChange]
  irrigationEvents: [number, number, number][];
  droughtStress: [number, number][]; // periods of low moisture
  waterlogging: [number, number][]; // periods of high moisture
  malfunctionPeriod?: [number, number]; // sensor malfunction
  weatherSensitivity: number; // 0-1, how much outdoor weather affects readings
}

const tarikSensorBehaviors: SensorBehavior[] = [
  // Zone 5 - Domates Serası (Greenhouse - controlled environment)
  {
    nodeId: "e0000000-0000-0000-0000-000000000017", // Sensor 11
    name: "Greenhouse Center - Stable with mid-month malfunction",
    baseMoisture: 62,
    moistureVariation: 8,
    tempOffset: 8, // warmer inside greenhouse
    humidityOffset: 10,
    irrigationEvents: [
      [3, 3, 15],
      [7, 7, 15],
      [11, 11, 15],
      [17, 17, 15],
      [22, 22, 15],
      [28, 28, 15],
    ],
    droughtStress: [],
    waterlogging: [[14, 16]], // malfunction causes overwatering spike to 88-92%
    malfunctionPeriod: [14, 16],
    weatherSensitivity: 0.2,
  },
  {
    nodeId: "e0000000-0000-0000-0000-000000000018", // Sensor 12
    name: "Greenhouse North - Irrigation leak detection",
    baseMoisture: 58,
    moistureVariation: 10,
    tempOffset: 6,
    humidityOffset: 8,
    irrigationEvents: [
      [2, 2, 12],
      [6, 6, 12],
      [10, 10, 12],
      [15, 15, 12],
      [20, 20, 12],
      [25, 25, 12],
      [30, 30, 12],
    ],
    droughtStress: [[8, 9]], // drops to 25-28% critical low
    waterlogging: [[22, 23]], // leak causes spike to 90%+
    weatherSensitivity: 0.25,
  },
  {
    nodeId: "e0000000-0000-0000-0000-000000000019", // Sensor 13
    name: "Greenhouse Edge - Weather influenced",
    baseMoisture: 55,
    moistureVariation: 14,
    tempOffset: 4, // edge is cooler
    humidityOffset: 5,
    irrigationEvents: [
      [4, 4, 18],
      [9, 9, 18],
      [14, 14, 18],
      [19, 19, 18],
      [24, 24, 18],
      [29, 29, 18],
    ],
    droughtStress: [[6, 7]], // near-critical at 32-35%
    waterlogging: [],
    weatherSensitivity: 0.5, // more affected by outdoor conditions
  },

  // Zone 6 - Biber Bahçesi (Pepper Garden - outdoor, clay soil)
  {
    nodeId: "e0000000-0000-0000-0000-00000000001A", // Sensor 14
    name: "Sunny Spot - Fast evaporation, drought stress",
    baseMoisture: 48,
    moistureVariation: 18,
    tempOffset: 2, // slightly warmer due to sun exposure
    humidityOffset: -5,
    irrigationEvents: [
      [2, 2, 20],
      [5, 5, 20],
      [8, 8, 20],
      [12, 12, 20],
      [16, 16, 20],
      [20, 20, 20],
      [24, 24, 20],
      [28, 28, 20],
    ],
    droughtStress: [
      [9, 11],
      [25, 26],
    ], // drops to 22-28% critical
    waterlogging: [],
    weatherSensitivity: 0.9,
  },
  {
    nodeId: "e0000000-0000-0000-0000-00000000001B", // Sensor 15
    name: "Shaded Area - Good moisture retention",
    baseMoisture: 65,
    moistureVariation: 10,
    tempOffset: -2, // cooler in shade
    humidityOffset: 8,
    irrigationEvents: [
      [4, 4, 12],
      [10, 10, 12],
      [16, 16, 12],
      [22, 22, 12],
      [28, 28, 12],
    ],
    droughtStress: [],
    waterlogging: [
      [5, 6],
      [19, 20],
    ], // clay retains water after rain, hits 85-88%
    weatherSensitivity: 0.6,
  },
  {
    nodeId: "e0000000-0000-0000-0000-00000000001C", // Sensor 16
    name: "Low Drainage Area - Waterlogging prone",
    baseMoisture: 58,
    moistureVariation: 20,
    tempOffset: 0,
    humidityOffset: 5,
    irrigationEvents: [
      [3, 3, 15],
      [8, 8, 15],
      [13, 13, 15],
      [18, 18, 15],
      [23, 23, 15],
      [29, 29, 15],
    ],
    droughtStress: [[15, 16]], // brief dry period at 28-32%
    waterlogging: [
      [4, 5],
      [10, 12],
      [26, 27],
    ], // frequent waterlogging 88-95%
    weatherSensitivity: 0.85,
  },

  // Zone 7 - Patates Tarlası (Potato Field - sandy soil, poor retention)
  {
    nodeId: "e0000000-0000-0000-0000-00000000001D", // Sensor 17
    name: "Sandy Soil Center - Poor retention, frequent low",
    baseMoisture: 42,
    moistureVariation: 16,
    tempOffset: 0,
    humidityOffset: -3,
    irrigationEvents: [
      [1, 1, 22],
      [4, 4, 22],
      [7, 7, 22],
      [10, 10, 22],
      [13, 13, 22],
      [16, 16, 22],
      [19, 19, 22],
      [22, 22, 22],
      [25, 25, 22],
      [28, 28, 22],
      [31, 31, 22],
    ],
    droughtStress: [
      [2, 3],
      [8, 9],
      [14, 15],
      [20, 21],
      [29, 30],
    ], // frequent drops to 20-28%
    waterlogging: [],
    weatherSensitivity: 0.95,
  },
  {
    nodeId: "e0000000-0000-0000-0000-00000000001E", // Sensor 18
    name: "Near Irrigation Line - More stable",
    baseMoisture: 55,
    moistureVariation: 12,
    tempOffset: 0,
    humidityOffset: 0,
    irrigationEvents: [
      [2, 2, 15],
      [6, 6, 15],
      [10, 10, 15],
      [14, 14, 15],
      [18, 18, 15],
      [22, 22, 15],
      [26, 26, 15],
      [30, 30, 15],
    ],
    droughtStress: [[23, 24]], // one drought event at 26-30%
    waterlogging: [[11, 12]], // occasional high at 87-90%
    weatherSensitivity: 0.7,
  },
  {
    nodeId: "e0000000-0000-0000-0000-00000000001F", // Sensor 19
    name: "Far from Irrigation - Drought prone with recovery",
    baseMoisture: 38,
    moistureVariation: 22,
    tempOffset: 1,
    humidityOffset: -5,
    irrigationEvents: [
      [3, 3, 28],
      [7, 7, 28],
      [11, 11, 28],
      [15, 15, 28],
      [19, 19, 28],
      [23, 23, 28],
      [27, 27, 28],
      [31, 31, 28],
    ],
    droughtStress: [
      [4, 6],
      [12, 14],
      [24, 26],
    ], // severe drought 18-25%, crossing critical
    waterlogging: [],
    weatherSensitivity: 1.0,
  },
];

// Generate İzmir weather for a specific timestamp
function getIzmirWeather(
  timestamp: Date,
  weather: WeatherProfile,
): { temp: number; humidity: number; isRaining: boolean } {
  const dayOfMonth = timestamp.getDate();
  const hour = timestamp.getHours();

  // Base daily temperature cycle (coldest at 6am, warmest at 3pm)
  const hourAngle = ((hour - 6) / 24) * 2 * Math.PI;
  let tempCycle = Math.sin(hourAngle) * (weather.tempRange / 2);

  // Check for cold snaps
  const inColdSnap = weather.coldSnaps.some(
    ([start, end]) => dayOfMonth >= start && dayOfMonth <= end,
  );
  if (inColdSnap) {
    tempCycle -= 8; // much colder during cold snap
  }

  // Check for warm periods
  const inWarmPeriod = weather.warmPeriods.some(
    ([start, end]) => dayOfMonth >= start && dayOfMonth <= end,
  );
  if (inWarmPeriod) {
    tempCycle += 5;
  }

  const temp = weather.avgTemp + tempCycle + (Math.random() - 0.5) * 3;

  // Humidity (inverse of temp cycle, higher at night)
  let humidityCycle = -Math.sin(hourAngle) * (weather.humidityRange / 3);

  // Check for rain
  const isRaining =
    weather.rainDays.includes(dayOfMonth) && hour >= 6 && hour <= 18;
  if (isRaining) {
    humidityCycle += 25;
  }

  const humidity = Math.min(
    100,
    Math.max(
      30,
      weather.avgHumidity + humidityCycle + (Math.random() - 0.5) * 10,
    ),
  );

  return { temp, humidity, isRaining };
}

// Calculate ET0 (reference evapotranspiration) using simplified Hargreaves method
function calculateET0(
  temp: number,
  humidity: number,
  dayOfYear: number,
): number {
  // Simplified ET0 calculation
  const Ra = 15 + 5 * Math.sin(((dayOfYear - 80) * 2 * Math.PI) / 365); // extraterrestrial radiation proxy
  const tempFactor = Math.max(0, temp + 17.8);
  const humidityFactor = Math.max(0.3, (100 - humidity) / 100);

  const et0 =
    0.0023 *
    Ra *
    tempFactor *
    humidityFactor *
    Math.sqrt(Math.max(1, temp + 10));
  return Math.max(0, Math.min(8, et0 + (Math.random() - 0.5) * 0.5));
}

// Generate readings for a single Tarık sensor with unique behavior
function generateTarikSensorReadings(
  behavior: SensorBehavior,
  startDate: Date,
  endDate: Date,
  intervalMinutes: number = 15,
): Array<{
  node_id: string;
  sm_percent: number;
  raw_sm_value: number;
  temperature: number;
  humidity: number;
  et0_instant: number;
  created_at: Date;
}> {
  const readings: Array<{
    node_id: string;
    sm_percent: number;
    raw_sm_value: number;
    temperature: number;
    humidity: number;
    et0_instant: number;
    created_at: Date;
  }> = [];

  let currentMoisture = behavior.baseMoisture;
  const current = new Date(startDate);

  while (current <= endDate) {
    const dayOfMonth = current.getDate();
    const hour = current.getHours();
    const dayOfYear = Math.floor(
      (current.getTime() - new Date(current.getFullYear(), 0, 0).getTime()) /
        (1000 * 60 * 60 * 24),
    );

    // Get outdoor weather
    const outdoorWeather = getIzmirWeather(current, izmirJanuaryWeather);

    // Apply weather sensitivity to get sensor's microclimate
    const sensorTemp =
      outdoorWeather.temp +
      behavior.tempOffset +
      (1 - behavior.weatherSensitivity) * (18 - outdoorWeather.temp) * 0.3 + // greenhouse effect
      (Math.random() - 0.5) * 2;

    const sensorHumidity = Math.min(
      100,
      Math.max(
        20,
        outdoorWeather.humidity +
          behavior.humidityOffset +
          (Math.random() - 0.5) * 5,
      ),
    );

    // Calculate ET0 for this reading
    const et0 = calculateET0(sensorTemp, sensorHumidity, dayOfYear);

    // Moisture dynamics
    // Base evaporation loss (higher during day, affected by temp and humidity)
    const evaporationRate = et0 * 0.8 * behavior.weatherSensitivity;
    currentMoisture -= evaporationRate * (intervalMinutes / 60) * 0.5;

    // Check for irrigation events
    const irrigationEvent = behavior.irrigationEvents.find(
      ([start, end]) =>
        dayOfMonth >= start && dayOfMonth <= end && hour >= 6 && hour <= 8,
    );
    if (irrigationEvent && hour === 7) {
      currentMoisture += irrigationEvent[2];
    }

    // Check for rain effect (outdoor sensors)
    if (outdoorWeather.isRaining && behavior.weatherSensitivity > 0.5) {
      currentMoisture += 0.5 * behavior.weatherSensitivity;
    }

    // Check for drought stress periods
    const inDroughtStress = behavior.droughtStress.some(
      ([start, end]) => dayOfMonth >= start && dayOfMonth <= end,
    );
    if (inDroughtStress) {
      // Accelerated moisture loss during drought stress
      currentMoisture -= 1.5;
      // Allow dropping to critical levels (18-28%)
      currentMoisture = Math.max(18, currentMoisture);
    }

    // Check for waterlogging periods
    const inWaterlogging = behavior.waterlogging.some(
      ([start, end]) => dayOfMonth >= start && dayOfMonth <= end,
    );
    if (inWaterlogging) {
      // Elevated moisture during waterlogging
      currentMoisture = Math.max(currentMoisture, 85 + Math.random() * 10);
    }

    // Check for malfunction
    if (behavior.malfunctionPeriod) {
      const [mStart, mEnd] = behavior.malfunctionPeriod;
      if (dayOfMonth >= mStart && dayOfMonth <= mEnd) {
        // Erratic readings during malfunction
        currentMoisture = 88 + Math.random() * 7; // stuck high
      }
    }

    // Add daily cycle variation
    const dailyCycle =
      Math.sin(((hour - 14) * Math.PI) / 12) * (behavior.moistureVariation / 3);

    // Add random noise
    const noise = (Math.random() - 0.5) * 3;

    // Calculate final moisture with bounds
    let finalMoisture = currentMoisture + dailyCycle + noise;

    // Natural bounds (but allow critical thresholds to be crossed)
    finalMoisture = Math.max(15, Math.min(98, finalMoisture));

    // Gradual return to base if not in special period
    if (!inDroughtStress && !inWaterlogging && !behavior.malfunctionPeriod) {
      currentMoisture = currentMoisture * 0.98 + behavior.baseMoisture * 0.02;
    }

    // Calculate raw SM value (inverse relationship, typically 200-800 range)
    const rawSmValue = Math.round(
      800 - (finalMoisture / 100) * 600 + (Math.random() - 0.5) * 20,
    );

    readings.push({
      node_id: behavior.nodeId,
      sm_percent: Math.round(finalMoisture * 100) / 100,
      raw_sm_value: rawSmValue,
      temperature: Math.round(sensorTemp * 100) / 100,
      humidity: Math.round(sensorHumidity * 100) / 100,
      et0_instant: Math.round(et0 * 1000) / 1000,
      created_at: new Date(current),
    });

    // Advance time
    current.setMinutes(current.getMinutes() + intervalMinutes);
  }

  return readings;
}

// Generate basic readings for other farms (Ankara and Antalya weather)
function generateBasicReadings(
  nodeId: string,
  city: "ankara" | "antalya",
  hoursBack: number = 72,
): Array<{
  node_id: string;
  sm_percent: number;
  temperature: number;
  humidity: number;
  created_at: Date;
}> {
  const readings: Array<{
    node_id: string;
    sm_percent: number;
    temperature: number;
    humidity: number;
    created_at: Date;
  }> = [];
  const now = new Date();

  // Weather profiles
  const weatherProfiles = {
    ankara: { avgTemp: 4, tempRange: 21, avgHumidity: 84, humidityRange: 69 }, // -7 to 14
    antalya: { avgTemp: 13, tempRange: 18, avgHumidity: 77, humidityRange: 75 }, // 4 to 22
  };

  const profile = weatherProfiles[city];
  const sensorIndex = parseInt(nodeId.slice(-2), 16) || 1;
  const baseMoisture = 40 + (sensorIndex % 4) * 10;

  for (let i = hoursBack * 4; i >= 0; i--) {
    // 15-minute intervals
    const timestamp = new Date(now.getTime() - i * 15 * 60 * 1000);
    const hour = timestamp.getHours();

    const tempModifier =
      Math.sin(((hour - 6) * Math.PI) / 12) * (profile.tempRange / 2);
    const humidityModifier =
      -Math.sin(((hour - 6) * Math.PI) / 12) * (profile.humidityRange / 3);

    const moistureModifier = -Math.sin(((hour - 6) * Math.PI) / 12) * 10;
    const sm_percent = Math.max(
      25,
      Math.min(85, baseMoisture + moistureModifier + (Math.random() - 0.5) * 8),
    );

    readings.push({
      node_id: nodeId,
      sm_percent: Math.round(sm_percent * 100) / 100,
      temperature:
        Math.round(
          (profile.avgTemp + tempModifier + (Math.random() - 0.5) * 3) * 100,
        ) / 100,
      humidity:
        Math.round(
          Math.max(
            30,
            Math.min(
              100,
              profile.avgHumidity +
                humidityModifier +
                (Math.random() - 0.5) * 10,
            ),
          ) * 100,
        ) / 100,
      created_at: timestamp,
    });
  }

  return readings;
}

async function main() {
  console.log("Starting database seed...");

  const farmerRole = await prisma.role.upsert({
    where: { role_name: "farmer" },
    update: {},
    create: {
      role_name: "farmer",
      description: "Farm owner with full access to their farms",
    },
  });
  console.log("Created role:", farmerRole.role_name);

  for (const userData of demoData.users) {
    const passwordHash = await bcrypt.hash(userData.password, 10);
    const user = await prisma.user.upsert({
      where: { user_id: userData.user_id },
      update: {},
      create: {
        user_id: userData.user_id,
        username: userData.username,
        email: userData.email,
        password_hash: passwordHash,
        role_id: farmerRole.role_id,
        is_active: true,
      },
    });
    console.log("Created user:", user.username);
  }

  for (const farmData of demoData.farms) {
    const farm = await prisma.farm.upsert({
      where: { farm_id: farmData.farm_id },
      update: { location_text: farmData.location_text },
      create: {
        farm_id: farmData.farm_id,
        user_id: farmData.user_id,
        name: farmData.name,
        location_text: farmData.location_text,
      },
    });
    console.log("Created farm:", farm.name);
  }

  for (const fieldData of demoData.fields) {
    const field = await prisma.field.upsert({
      where: { field_id: fieldData.field_id },
      update: {
        name: fieldData.name,
        area: fieldData.area,
        polygon: fieldData.polygon,
      },
      create: {
        field_id: fieldData.field_id,
        farm_id: fieldData.farm_id,
        name: fieldData.name,
        area: fieldData.area,
        polygon: fieldData.polygon,
      },
    });
    console.log("Created field:", field.name);
  }

  for (const zoneData of demoData.zones) {
    const field = demoData.fields.find((f) => f.field_id === zoneData.field_id);

    const zone = await prisma.zone.upsert({
      where: { zone_id: zoneData.zone_id },
      update: {
        name: zoneData.name,
        polygon: field?.polygon,
        soil_type: zoneData.soil_type,
      },
      create: {
        zone_id: zoneData.zone_id,
        field_id: zoneData.field_id,
        name: zoneData.name,
        polygon: field?.polygon,
        soil_type: zoneData.soil_type,
      },
    });
    console.log("Created zone:", zone.name);

    await prisma.zoneDetail.upsert({
      where: { zone_id: zoneData.zone_id },
      update: {},
      create: {
        zone_id: zoneData.zone_id,
        current_kc: 1.0,
        current_irrigation_gain: 0.015,
        target_sm_percent: 60.0,
        critical_sm_percent: 30.0,
      },
    });
  }

  // Delete ALL existing sensor readings
  console.log("\nDeleting all existing sensor readings...");
  await prisma.sensorReading.deleteMany({});
  console.log("All sensor readings deleted.");

  // Create sensors and generate readings
  for (const sensorData of demoData.sensors) {
    const sensor = await prisma.sensorNode.upsert({
      where: { node_id: sensorData.node_id },
      update: {
        battery_level: sensorData.battery_level,
        x: sensorData.x,
        z: sensorData.z,
        status: sensorData.status || "ACTIVE",
      },
      create: {
        node_id: sensorData.node_id,
        zone_id: sensorData.zone_id,
        hardware_mac: sensorData.hardware_mac,
        battery_level: sensorData.battery_level,
        x: sensorData.x,
        z: sensorData.z,
        status: sensorData.status || "ACTIVE",
      },
    });
    console.log("Created sensor:", sensor.hardware_mac);

    // Check if this is a Tarık sensor (zones 5, 6, 7)
    const tarikZones = [
      "d0000000-0000-0000-0000-000000000005",
      "d0000000-0000-0000-0000-000000000006",
      "d0000000-0000-0000-0000-000000000007",
    ];

    let readings: Array<{
      node_id: string;
      sm_percent: number;
      raw_sm_value?: number;
      temperature: number;
      humidity: number;
      et0_instant?: number;
      created_at: Date;
    }>;

    if (tarikZones.includes(sensorData.zone_id)) {
      // Generate 1 month of detailed readings for Tarık's sensors
      const behavior = tarikSensorBehaviors.find(
        (b) => b.nodeId === sensorData.node_id,
      );
      if (behavior) {
        const startDate = new Date("2026-01-01T00:00:00Z");
        const endDate = new Date("2026-02-01T00:00:00Z");
        readings = generateTarikSensorReadings(
          behavior,
          startDate,
          endDate,
          15,
        );
        console.log(
          `  Generating ${readings.length} readings for Tarık sensor ${sensor.hardware_mac} (${behavior.name})`,
        );
      } else {
        readings = [];
      }
    } else {
      // Generate 72 hours of basic readings for other sensors
      const city =
        sensorData.zone_id.includes("000000000001") ||
        sensorData.zone_id.includes("000000000002")
          ? "ankara"
          : "antalya";
      readings = generateBasicReadings(sensorData.node_id, city, 72);
      console.log(
        `  Generating ${readings.length} readings for ${city.toUpperCase()} sensor ${sensor.hardware_mac}`,
      );
    }

    // Batch insert readings
    if (readings.length > 0) {
      const batchSize = 500;
      for (let i = 0; i < readings.length; i += batchSize) {
        const batch = readings.slice(i, i + batchSize);
        await prisma.sensorReading.createMany({
          data: batch.map((r) => ({
            node_id: r.node_id,
            sm_percent: r.sm_percent,
            raw_sm_value: r.raw_sm_value || null,
            temperature: r.temperature,
            humidity: r.humidity,
            et0_instant: r.et0_instant || null,
            created_at: r.created_at,
          })),
        });
      }
      console.log(
        `  Created ${readings.length} readings for sensor ${sensor.hardware_mac}`,
      );
    }
  }

  // Create sample irrigation jobs for Tarık's zones
  const tarikZoneIds = [
    "d0000000-0000-0000-0000-000000000005",
    "d0000000-0000-0000-0000-000000000006",
    "d0000000-0000-0000-0000-000000000007",
  ];

  for (const zoneId of tarikZoneIds) {
    const lowMoistureReading = await prisma.sensorReading.findFirst({
      where: {
        node: { zone_id: zoneId },
        sm_percent: { lt: 35 },
      },
      orderBy: { created_at: "desc" },
    });

    if (lowMoistureReading) {
      await prisma.irrigationJob.create({
        data: {
          zone_id: zoneId,
          trigger_reading_id: lowMoistureReading.id,
          reasoning: `Soil moisture critically low (${lowMoistureReading.sm_percent?.toFixed(1)}% < 30% threshold). Immediate irrigation recommended.`,
          recommended_duration_min: 45,
          recommended_volume_liters: 750,
          status: "PENDING",
        },
      });
      console.log(
        `Created irrigation job for zone ${zoneId} triggered by low moisture reading`,
      );
    }
  }

  // Summary statistics
  console.log("\n=== Seed Summary ===");
  const totalReadings = await prisma.sensorReading.count();
  console.log(`Total sensor readings: ${totalReadings}`);

  const tarikReadings = await prisma.sensorReading.count({
    where: {
      node: {
        zone_id: { in: tarikZoneIds },
      },
    },
  });
  console.log(`Tarık's sensor readings: ${tarikReadings}`);

  const criticalLowReadings = await prisma.sensorReading.count({
    where: {
      sm_percent: { lt: 30 },
      node: { zone_id: { in: tarikZoneIds } },
    },
  });
  console.log(`Critical low moisture readings (<30%): ${criticalLowReadings}`);

  const criticalHighReadings = await prisma.sensorReading.count({
    where: {
      sm_percent: { gt: 85 },
      node: { zone_id: { in: tarikZoneIds } },
    },
  });
  console.log(
    `Critical high moisture readings (>85%): ${criticalHighReadings}`,
  );

  console.log("\nDatabase seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
