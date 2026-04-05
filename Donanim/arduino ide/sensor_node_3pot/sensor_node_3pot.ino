/*
 * TARAS 3-Pot Sensor Node — ESP32-C6 SuperMini (TEMPORARY TEST SKETCH)
 *
 * One physical ESP32-C6 acts as 3 virtual sensor nodes — one per plant pot.
 * Reads 1 shared SHT31 (temp/humidity) + 3 separate soil moisture sensors,
 * and sends 3 separate ESP-NOW packets (one per pot) using virtual MACs.
 * The gateway sees 3 normal independent nodes. Zero backend/app changes.
 *
 * Virtual MACs: base_mac[5]+0, base_mac[5]+1, base_mac[5]+2
 * NVS namespaces: "slot0", "slot1", "slot2" (each stores own pairing/config)
 * Pairing: boots → pairs slot 0 → reboots → pairs slot 1 → reboots → pairs slot 2 → normal mode
 *
 * Sections: INCLUDES + PINS → PROTOCOL → RTC MEMORY → GLOBALS
 *   → UTILITIES (CRC8, HMAC, LED) → SENSORS → NVS
 *   → ESP-NOW → VIRTUAL MAC → PAIRING MODE → NORMAL MODE → SETUP & LOOP
 */

// #define DEBUG_MODE

#include <Wire.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <Preferences.h>
#include <esp_sleep.h>
#include <driver/gpio.h>
#include <esp_mac.h>
#include <esp_log.h>
#include <mbedtls/md.h>

// ── Pin Definitions ──────────────────────────────────────────────────

#define NUM_NODES   3

#define SOIL_PIN_0  0   // Pot 1
#define SOIL_PIN_1  1   // Pot 2
#define SOIL_PIN_2  2   // Pot 3
#define SDA_PIN     4
#define SCL_PIN     7
#define LED_PIN     8
// NOTE: GPIO9 CANNOT be used (phantom ACKs from BOOT circuit)

#define SHT31_ADDR  0x44

// ── Protocol Constants ───────────────────────────────────────────────

#define PKT_PAIR_ACCEPT   0x03
#define PKT_PAIR_COMPLETE 0x04
#define PKT_PAIR_REJECTED 0x05
#define PKT_PAIR_BEACON   0x06
#define PKT_SENSOR_DATA   0x10
#define PKT_DATA_ACK      0x11
#define PKT_CONFIG_UPDATE 0x20
#define PKT_CONFIG_ACK    0x21
#define PKT_DIAGNOSTIC    0x12

// Diagnostic failure type enum
#define DIAG_SEND_FAIL       0x01
#define DIAG_ACK_MISS        0x02
#define DIAG_SENSOR_FAIL     0x03
#define DIAG_SOIL_FAIL       0x04
#define DIAG_NVS_FAIL        0x05
#define DIAG_WIFI_FAIL       0x06
#define DIAG_I2C_FAIL        0x07
#define DIAG_CH_RECOVERY     0x08
#define DIAG_BUF_OVERFLOW    0x09
#define DIAG_ABNORMAL_RESET  0x0A

#define SENSOR_CAP_SHT31  0x01
#define SENSOR_CAP_SOIL   0x02

#define MAX_READINGS_PER_PKT  33   // (250 - 2 header - 4 HMAC) / 7 = 34, using 33
#define MAX_READINGS_PER_NODE 600  // 600 × 4 = 2.4KB per node, 7.2KB total (fits 16KB RTC)
#define SN_FW_VERSION  0x0100

// ── Packet Structures ────────────────────────────────────────────────

typedef struct __attribute__((packed)) {
  uint8_t type;
  uint8_t gateway_mac[6];
  uint8_t wifi_channel;
} pair_beacon_packet_t;

typedef struct __attribute__((packed)) {
  uint8_t type;
  uint8_t mac[6];
} pair_accept_packet_t;

typedef struct __attribute__((packed)) {
  uint8_t type;
  uint8_t device_key[16];
  uint8_t encryption_key[16];
  uint8_t gateway_mac[6];
  uint8_t channel;
  uint16_t sleep_interval_sec;
  uint8_t min_buffer_cycles;
  uint16_t max_buffer_cycles;
  uint16_t temp_threshold;
  uint16_t hum_threshold;
  uint16_t soil_threshold;
} pair_complete_packet_t;

typedef struct __attribute__((packed)) {
  uint8_t minutes_ago;
  int16_t temperature;
  uint16_t humidity;
  uint16_t soil_raw;
} reading_entry_t;

typedef struct __attribute__((packed)) {
  uint8_t type;
  uint32_t counter;
  uint8_t reading_count;
  reading_entry_t readings[MAX_READINGS_PER_PKT];
} sensor_data_packet_t;

// Compact storage for RTC buffer (4 bytes vs 7 in packet)
typedef struct __attribute__((packed)) {
  int16_t temperature;   // x100, full precision
  uint8_t humidity;      // 0-200 (x50 = 0-10000), ±0.5% precision
  uint8_t soil;          // 0-255 (x16 = 0-4080), ±0.4% precision
} stored_reading_t;

typedef struct __attribute__((packed)) {
  uint8_t type;
  uint8_t ack_count;
} data_ack_packet_t;

typedef struct __attribute__((packed)) {
  uint8_t type;
  uint16_t sleep_interval_sec;
  uint8_t min_buffer_cycles;
  uint16_t max_buffer_cycles;
  uint16_t temp_threshold;
  uint16_t hum_threshold;
  uint16_t soil_threshold;
} config_update_packet_t;

typedef struct __attribute__((packed)) {
  uint8_t type;
} config_ack_packet_t;

// ── RTC Memory ───────────────────────────────────────────────────────

#define RTC_MAGIC_3POT  0xC6A70003  // Different from production to avoid conflicts
#define NEVER_SENT      -30000

typedef struct {
  uint32_t magic;
  struct {
    uint16_t cycle_count;
    int16_t  last_sent_temp;
    uint16_t last_sent_hum;
    uint16_t last_sent_soil;
    uint16_t consecutive_send_failures;
    uint32_t hmac_counter;
    stored_reading_t buffer[MAX_READINGS_PER_NODE];
  } node[NUM_NODES];
  uint16_t consecutive_sensor_failures;
  // Diagnostic delta counters (per-cycle, flushed to NVS on send)
  uint8_t  last_reset_reason;
  uint16_t diag_send_fail;
  uint16_t diag_ack_miss;
  uint16_t diag_sensor_fail;
  uint8_t  diag_soil_fail;
  uint8_t  diag_nvs_fail;
  uint8_t  diag_wifi_fail;
  uint8_t  diag_i2c_fail;
  uint8_t  diag_ch_recovery;
  uint8_t  diag_buf_overflow;
} rtc_state_t;

RTC_DATA_ATTR rtc_state_t rtc;

// ── ESP-NOW Callback Globals ─────────────────────────────────────────

static volatile bool espnow_send_done = false;
static volatile bool espnow_send_ok = false;
static volatile bool espnow_recv_flag = false;
static uint8_t espnow_recv_buf[250];
static int espnow_recv_len = 0;
static uint8_t espnow_recv_mac[6];

// ── Per-Node Config (loaded from NVS) ────────────────────────────────

struct NodeConfig {
  uint8_t device_key[16];
  uint8_t encryption_key[16];
  uint8_t gw_mac[6];
  uint8_t wifi_channel;
  uint16_t sleep_interval_sec;
  uint8_t min_buffer_cycles;
  uint16_t max_buffer_cycles;
  uint16_t temp_threshold;
  uint16_t hum_threshold;
  uint16_t soil_threshold;
};

RTC_DATA_ATTR NodeConfig node_cfg[NUM_NODES];  // Survives deep sleep — skip NVS reload

// ── Virtual MAC ──────────────────────────────────────────────────────

RTC_DATA_ATTR uint8_t base_mac[6];  // Cached in RTC — eFuse read only on cold boot

static const uint8_t soil_pins[NUM_NODES] = { SOIL_PIN_0, SOIL_PIN_1, SOIL_PIN_2 };

void set_virtual_mac(uint8_t slot) {
  uint8_t mac[6];
  memcpy(mac, base_mac, 6);
  mac[5] += slot * 2;  // +0, +2, +4 (skip +1 which is the AP MAC)
  esp_wifi_stop();
  esp_err_t err = esp_wifi_set_mac(WIFI_IF_STA, mac);
  esp_wifi_start();
#ifdef DEBUG_MODE
  uint8_t actual[6];
  esp_wifi_get_mac(WIFI_IF_STA, actual);
  Serial.printf("[MAC] slot=%d err=%d set=%02X:%02X:%02X:%02X:%02X:%02X got=%02X:%02X:%02X:%02X:%02X:%02X\n",
    slot, err, mac[0], mac[1], mac[2], mac[3], mac[4], mac[5],
    actual[0], actual[1], actual[2], actual[3], actual[4], actual[5]);
#endif
}

void get_virtual_mac(uint8_t slot, uint8_t *out) {
  memcpy(out, base_mac, 6);
  out[5] += slot * 2;  // Must match set_virtual_mac: +0, +2, +4
}

// ── CRC8 ─────────────────────────────────────────────────────────────

uint8_t crc8(const uint8_t *data, int len) {
  uint8_t crc = 0xFF;
  for (int j = 0; j < len; j++) {
    crc ^= data[j];
    for (int i = 0; i < 8; i++) {
      if (crc & 0x80) crc = (crc << 1) ^ 0x31;
      else crc <<= 1;
    }
  }
  return crc;
}

// ── HMAC-SHA256 (4-byte truncated) ───────────────────────────────────

void compute_hmac_4(const uint8_t *key, const uint8_t *data, size_t len, uint8_t *out4) {
  uint8_t full[32];
  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 1);
  mbedtls_md_hmac_starts(&ctx, key, 16);
  mbedtls_md_hmac_update(&ctx, data, len);
  mbedtls_md_hmac_finish(&ctx, full);
  mbedtls_md_free(&ctx);
  memcpy(out4, full, 4);
}

bool verify_hmac_4(const uint8_t *key, const uint8_t *data, size_t data_len, const uint8_t *expected4) {
  uint8_t computed[4];
  compute_hmac_4(key, data, data_len, computed);
  return memcmp(computed, expected4, 4) == 0;
}

// ── LED Helpers ──────────────────────────────────────────────────────

void ledOn()  { digitalWrite(LED_PIN, HIGH); }
void ledOff() { digitalWrite(LED_PIN, LOW); }

// ── SHT31 ────────────────────────────────────────────────────────────

bool writeCommand(uint16_t cmd) {
  Wire.beginTransmission(SHT31_ADDR);
  Wire.write(cmd >> 8);
  Wire.write(cmd & 0xFF);
  return (Wire.endTransmission() == 0);
}

bool readSHT31(int16_t &temp_x100, uint16_t &hum_x100) {
  // Low repeatability + clock stretching (0x2C10): ±0.25°C, ~2.5ms typical
  // Clock stretching: I2C bus blocks exactly until data ready — no wasted delay()
  if (!writeCommand(0x2C10)) return false;
  // No delay needed — requestFrom blocks via clock stretch for exact measurement time
  if (Wire.requestFrom(SHT31_ADDR, 6) != 6) return false;
  uint8_t data[6];
  for (int i = 0; i < 6; i++) data[i] = Wire.read();
  if (crc8(data, 2) != data[2]) return false;
  if (crc8(data + 3, 2) != data[5]) return false;
  uint16_t rawT = ((uint16_t)data[0] << 8) | data[1];
  uint16_t rawH = ((uint16_t)data[3] << 8) | data[4];
  // Integer math — ESP32-C6 RISC-V has no FPU, float is software-emulated
  temp_x100 = (int16_t)(-4500 + ((int32_t)17500 * rawT + 32767) / 65535);
  hum_x100 = (uint16_t)((uint32_t)10000 * rawH / 65535);
  return true;
}

// ── Soil Moisture ────────────────────────────────────────────────────

uint16_t readSoilMoisture(uint8_t pin) {
  return (uint16_t)analogRead(pin);
}

// ── NVS Helpers ──────────────────────────────────────────────────────

uint8_t count_paired_slots() {
  uint8_t count = 0;
  for (int i = 0; i < NUM_NODES; i++) {
    char ns[8];
    sprintf(ns, "slot%d", i);
    Preferences prefs;
    prefs.begin(ns, true);
    if (prefs.getUChar("paired", 0) == 1) count++;
    prefs.end();
  }
  return count;
}

bool nvs_load_slot(uint8_t slot) {
  char ns[8];
  sprintf(ns, "slot%d", slot);
  Preferences prefs;
  prefs.begin(ns, true);

  size_t dk = prefs.getBytes("device_key", node_cfg[slot].device_key, 16);
  size_t ek = prefs.getBytes("enc_key", node_cfg[slot].encryption_key, 16);
  size_t gw = prefs.getBytes("gw_mac", node_cfg[slot].gw_mac, 6);
  node_cfg[slot].wifi_channel       = prefs.getUChar("channel", 0);
  node_cfg[slot].sleep_interval_sec = prefs.getUShort("sleep_sec", 300);
  node_cfg[slot].min_buffer_cycles  = prefs.getUChar("min_buf", 2);
  node_cfg[slot].max_buffer_cycles  = prefs.getUShort("max_buf", MAX_READINGS_PER_NODE);
  node_cfg[slot].temp_threshold     = prefs.getUShort("thr_temp", 100);
  node_cfg[slot].hum_threshold      = prefs.getUShort("thr_hum", 500);
  node_cfg[slot].soil_threshold     = prefs.getUShort("thr_soil", 410);
  prefs.end();

#ifdef DEBUG_MODE
  node_cfg[slot].sleep_interval_sec = 10; // Debug: 10s sleep instead of NVS value
#endif

  return (dk == 16 && ek == 16 && gw == 6 && node_cfg[slot].wifi_channel != 0);
}

void nvs_save_slot_config(uint8_t slot, uint16_t sleep_sec, uint8_t min_b, uint16_t max_b,
                          uint16_t tt, uint16_t th, uint16_t ts) {
  char ns[8];
  sprintf(ns, "slot%d", slot);
  Preferences prefs;
  prefs.begin(ns, false);
  prefs.putUShort("sleep_sec", sleep_sec);
  prefs.putUChar("min_buf", min_b);
  prefs.putUShort("max_buf", max_b);
  prefs.putUShort("thr_temp", tt);
  prefs.putUShort("thr_hum", th);
  prefs.putUShort("thr_soil", ts);
  prefs.end();
}

void nvs_save_counter(uint8_t slot, uint32_t counter) {
  char ns[8]; sprintf(ns, "slot%d", slot);
  Preferences prefs; prefs.begin(ns, false);
  prefs.putULong("hmac_ctr", counter);
  prefs.end();
}

uint32_t nvs_load_counter(uint8_t slot) {
  char ns[8]; sprintf(ns, "slot%d", slot);
  Preferences prefs; prefs.begin(ns, true);
  uint32_t ctr = prefs.getULong("hmac_ctr", 0);
  prefs.end();
  return ctr;
}

void nvs_factory_reset_all() {
  for (int i = 0; i < NUM_NODES; i++) {
    char ns[8];
    sprintf(ns, "slot%d", i);
    Preferences prefs;
    prefs.begin(ns, false);
    prefs.clear();
    prefs.end();
  }
}

// ── ESP-NOW Callbacks ────────────────────────────────────────────────

void onEspNowSend(const wifi_tx_info_t *info, esp_now_send_status_t status) {
  espnow_send_done = true;
  espnow_send_ok = (status == ESP_NOW_SEND_SUCCESS);
}

void onEspNowRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  if (len > 0 && len <= (int)sizeof(espnow_recv_buf)) {
    memcpy(espnow_recv_buf, data, len);
    espnow_recv_len = len;
    memcpy(espnow_recv_mac, info->src_addr, 6);
    espnow_recv_flag = true;
  }
}

// ── ESP-NOW Helpers ──────────────────────────────────────────────────

bool espnow_send_and_wait(const uint8_t *peer_mac, const uint8_t *data,
                          size_t len, uint32_t timeout_ms) {
  espnow_send_done = false;
  espnow_send_ok = false;

  if (esp_now_send(peer_mac, data, len) != ESP_OK) {
    return false;
  }

  uint32_t start = millis();
  while (!espnow_send_done) {
    if (millis() - start > timeout_ms) return false;
    delay(1);
  }
  return espnow_send_ok;
}

bool espnow_wait_for_packet(uint8_t expected_type, uint32_t timeout_ms) {
  espnow_recv_flag = false;
  uint32_t start = millis();
  while (true) {
    if (espnow_recv_flag) {
      if (espnow_recv_buf[0] == expected_type) return true;
      espnow_recv_flag = false;
    }
    if (millis() - start > timeout_ms) return false;
    delay(1);
  }
}

// ── Pairing Mode ─────────────────────────────────────────────────────

void run_pairing_mode(uint8_t slot) {
#ifdef DEBUG_MODE
  Serial.printf("[PAIR] Pairing slot %d (MAC +%d)\n", slot, slot);
#endif

  while (true) {
    // Init radio for this listen window (WiFi needs 80MHz PLL)
    setCpuFrequencyMhz(80);
    WiFi.mode(WIFI_STA);
    set_virtual_mac(slot);  // stop→set MAC→start internally
    esp_wifi_set_protocol(WIFI_IF_STA, WIFI_PROTOCOL_11B | WIFI_PROTOCOL_11G | WIFI_PROTOCOL_11N);
    esp_wifi_set_ps(WIFI_PS_NONE);
    esp_wifi_set_channel(1, WIFI_SECOND_CHAN_NONE);
    esp_now_init();
    esp_now_register_send_cb(onEspNowSend);
    esp_now_register_recv_cb(onEspNowRecv);

    // Add broadcast peer
    esp_now_peer_info_t bcast_peer = {};
    memset(bcast_peer.peer_addr, 0xFF, 6);
    bcast_peer.channel = 0;
    bcast_peer.encrypt = false;
    esp_now_add_peer(&bcast_peer);

    ledOn();

#ifdef DEBUG_MODE
    Serial.printf("[PAIR] Slot %d listening on ch1...\n", slot);
#endif

    // Listen 1.5 seconds for PAIR_BEACON (beacon every 1s, so guaranteed catch)
    if (espnow_wait_for_packet(PKT_PAIR_BEACON, 1500)) {
      pair_beacon_packet_t *beacon = (pair_beacon_packet_t *)espnow_recv_buf;
      uint8_t wifi_ch = beacon->wifi_channel;

#ifdef DEBUG_MODE
      Serial.printf("[PAIR] PAIR_BEACON received! WiFi ch=%d\n", wifi_ch);
#endif

      // Get virtual MAC for this slot
      uint8_t my_mac[6];
      get_virtual_mac(slot, my_mac);

      // Register gateway as peer
      esp_now_peer_info_t gw_peer = {};
      memcpy(gw_peer.peer_addr, beacon->gateway_mac, 6);
      gw_peer.channel = 0;
      gw_peer.encrypt = false;
      esp_now_add_peer(&gw_peer);

      // Send PAIR_ACCEPT with virtual MAC
      pair_accept_packet_t accept;
      accept.type = PKT_PAIR_ACCEPT;
      memcpy(accept.mac, my_mac, 6);
      espnow_send_and_wait(beacon->gateway_mac, (uint8_t *)&accept, sizeof(accept), 200);

#ifdef DEBUG_MODE
      Serial.printf("[PAIR] PAIR_ACCEPT sent (slot %d), switching to ch%d\n", slot, wifi_ch);
#endif

      // Switch to WiFi channel for PAIR_COMPLETE
      esp_wifi_set_channel(wifi_ch, WIFI_SECOND_CHAN_NONE);
      esp_now_del_peer(beacon->gateway_mac);
      gw_peer.channel = wifi_ch;
      esp_now_add_peer(&gw_peer);

      // Wait for PAIR_COMPLETE or PAIR_REJECTED (60s)
      uint32_t wait_start = millis();
      bool got_complete = false;

      while (millis() - wait_start < 60000) {
        // LED slow blink while waiting
        digitalWrite(LED_PIN, ((millis() / 500) % 2) ? HIGH : LOW);

        if (espnow_recv_flag) {
          if (espnow_recv_buf[0] == PKT_PAIR_COMPLETE && espnow_recv_len >= (int)sizeof(pair_complete_packet_t)) {
            got_complete = true;
            break;
          } else if (espnow_recv_buf[0] == PKT_PAIR_REJECTED) {
#ifdef DEBUG_MODE
            Serial.printf("[PAIR] Slot %d rejected, restarting scan\n", slot);
#endif
            ledOn(); delay(500); ledOff(); delay(500);
            espnow_recv_flag = false;
            break;
          }
          espnow_recv_flag = false;
        }
        delay(1);
      }

      if (got_complete) {
        pair_complete_packet_t *complete = (pair_complete_packet_t *)espnow_recv_buf;

#ifdef DEBUG_MODE
        Serial.printf("[PAIR] Slot %d got PAIR_COMPLETE, storing config...\n", slot);
#endif

        // Save pairing to this slot's NVS namespace
        char ns[8];
        sprintf(ns, "slot%d", slot);
        Preferences prefs;
        prefs.begin(ns, false);
        prefs.putBytes("device_key", complete->device_key, 16);
        prefs.putBytes("enc_key", complete->encryption_key, 16);
        prefs.putBytes("gw_mac", complete->gateway_mac, 6);
        prefs.putUChar("channel", complete->channel);
        prefs.putUChar("paired", 1);
        // Save config
        prefs.putUShort("sleep_sec", complete->sleep_interval_sec);
        prefs.putUChar("min_buf", complete->min_buffer_cycles);
        prefs.putUShort("max_buf", complete->max_buffer_cycles);
        prefs.putUShort("thr_temp", complete->temp_threshold);
        prefs.putUShort("thr_hum", complete->hum_threshold);
        prefs.putUShort("thr_soil", complete->soil_threshold);
        prefs.end();

#ifdef DEBUG_MODE
        Serial.printf("[PAIR] Slot %d paired! Rebooting...\n", slot);
#endif

        // Success LED blink
        for (int i = 0; i < 6; i++) {
          ledOn(); delay(250);
          ledOff(); delay(250);
        }

        ESP.restart();
        // Never returns — next boot pairs next slot (or enters normal mode)
      }

      // Timeout or rejected — cleanup gateway peer
      esp_now_del_peer(beacon->gateway_mac);
    }

    // No beacon received or pairing failed — clean up and wait
    ledOff();
    esp_now_deinit();
    esp_wifi_stop();

#ifdef DEBUG_MODE
    Serial.println("[PAIR] Waiting 4.5s...");
    delay(4500);
#else
    esp_sleep_enable_timer_wakeup(4500000);
    esp_light_sleep_start();
#endif
  }
}

// ── Channel Recovery ─────────────────────────────────────────────────

bool channel_recovery(uint8_t node_idx) {
#ifdef DEBUG_MODE
  Serial.printf("[NORM] Node %d: stored channel failed, scanning all channels...\n", node_idx);
#endif

  // Build a zero-reading probe packet for channel scanning
  sensor_data_packet_t probe;
  probe.type = PKT_SENSOR_DATA;
  probe.counter = rtc.node[node_idx].hmac_counter += 1;
  probe.reading_count = 0;
  size_t probe_payload = 6;
  uint8_t probe_buf[16];
  memcpy(probe_buf, &probe, probe_payload);
  compute_hmac_4(node_cfg[node_idx].encryption_key, probe_buf, probe_payload, probe_buf + probe_payload);
  size_t probe_size = probe_payload + 4;

  static const uint8_t scan_ch[] = { 1, 6, 11, 2, 3, 4, 5, 7, 8, 9, 10, 12, 13 };
  for (uint8_t ci = 0; ci < 13; ci++) {
    uint8_t ch = scan_ch[ci];
    if (ch == node_cfg[node_idx].wifi_channel) continue;
    esp_wifi_set_channel(ch, WIFI_SECOND_CHAN_NONE);
    if (espnow_send_and_wait(node_cfg[node_idx].gw_mac, probe_buf, probe_size, 200)) {
      if (espnow_wait_for_packet(PKT_DATA_ACK, 200)) {
        size_t ack_pl = sizeof(data_ack_packet_t);
        if (espnow_recv_len >= (int)(ack_pl + 4) &&
            verify_hmac_4(node_cfg[node_idx].encryption_key, espnow_recv_buf, ack_pl, espnow_recv_buf + ack_pl)) {
#ifdef DEBUG_MODE
          Serial.printf("[NORM] Gateway found on ch=%d, updating all nodes\n", ch);
#endif
          rtc.diag_ch_recovery++;
          // Update all nodes' channels (they all share the same gateway)
          for (int i = 0; i < NUM_NODES; i++) {
            node_cfg[i].wifi_channel = ch;
            char ns[8];
            sprintf(ns, "slot%d", i);
            Preferences p;
            p.begin(ns, false);
            p.putUChar("channel", ch);
            p.end();
          }
          return true;
        }
      }
    }
  }
  return false;
}

// ── Diagnostics ─────────────────────────────────────────────────────

void send_diagnostics_3pot() {
  // Shared "diag" NVS namespace (not per-slot — diagnostics are per-physical-device)
  Preferences prefs;
  prefs.begin("diag", true);
  uint16_t boot_cnt   = prefs.getUShort("boots", 0);
  uint16_t uptime_cyc = prefs.getUShort("uptime", 0);
  uint16_t nv_send    = prefs.getUShort("send", 0);
  uint16_t nv_ack     = prefs.getUShort("ack", 0);
  uint16_t nv_sensor  = prefs.getUShort("sensor", 0);
  uint8_t  nv_soil    = prefs.getUChar("soil", 0);
  uint8_t  nv_nvs     = prefs.getUChar("nvs", 0);
  uint8_t  nv_wifi    = prefs.getUChar("wifi", 0);
  uint8_t  nv_i2c     = prefs.getUChar("i2c", 0);
  uint8_t  nv_chrec   = prefs.getUChar("chrec", 0);
  uint8_t  nv_bufovf  = prefs.getUChar("bufovf", 0);
  prefs.end();

  nv_send   += rtc.diag_send_fail;
  nv_ack    += rtc.diag_ack_miss;
  nv_sensor += rtc.diag_sensor_fail;
  nv_soil   += rtc.diag_soil_fail;
  nv_nvs    += rtc.diag_nvs_fail;
  nv_wifi   += rtc.diag_wifi_fail;
  nv_i2c    += rtc.diag_i2c_fail;
  nv_chrec  += rtc.diag_ch_recovery;
  nv_bufovf += rtc.diag_buf_overflow;

  uint8_t pkt[64];
  pkt[0] = PKT_DIAGNOSTIC;
  uint32_t ctr = ++rtc.node[0].hmac_counter;  // Use slot 0's counter
  memcpy(pkt + 1, &ctr, 4);
  pkt[5] = 1;
  pkt[6] = rtc.last_reset_reason;
  memcpy(pkt + 7, &boot_cnt, 2);
  memcpy(pkt + 9, &uptime_cyc, 2);

  uint8_t n = 0;
  uint8_t *entries = pkt + 12;
  #define DIAG_ENTRY(type, val) do { uint16_t v = (val); if (v > 0) { entries[n*3] = (type); memcpy(entries+n*3+1, &v, 2); n++; } } while(0)
  DIAG_ENTRY(DIAG_SEND_FAIL,      nv_send);
  DIAG_ENTRY(DIAG_ACK_MISS,       nv_ack);
  DIAG_ENTRY(DIAG_SENSOR_FAIL,    nv_sensor);
  DIAG_ENTRY(DIAG_SOIL_FAIL,      nv_soil);
  DIAG_ENTRY(DIAG_NVS_FAIL,       nv_nvs);
  DIAG_ENTRY(DIAG_WIFI_FAIL,      nv_wifi);
  DIAG_ENTRY(DIAG_I2C_FAIL,       nv_i2c);
  DIAG_ENTRY(DIAG_CH_RECOVERY,    nv_chrec);
  DIAG_ENTRY(DIAG_BUF_OVERFLOW,   nv_bufovf);
  #undef DIAG_ENTRY
  pkt[11] = n;

  size_t payload = 12 + n * 3;
  compute_hmac_4(node_cfg[0].encryption_key, pkt, payload, pkt + payload);
  espnow_send_and_wait(node_cfg[0].gw_mac, pkt, payload + 4, 200);

#ifdef DEBUG_MODE
  Serial.printf("[DIAG] Sent: rst=%d boots=%d entries=%d\n", rtc.last_reset_reason, boot_cnt, n);
#endif

  prefs.begin("diag", false);
  prefs.putUShort("send",   nv_send);
  prefs.putUShort("ack",    nv_ack);
  prefs.putUShort("sensor", nv_sensor);
  prefs.putUChar("soil",    nv_soil);
  prefs.putUChar("nvs",     nv_nvs);
  prefs.putUChar("wifi",    nv_wifi);
  prefs.putUChar("i2c",     nv_i2c);
  prefs.putUChar("chrec",   nv_chrec);
  prefs.putUChar("bufovf",  nv_bufovf);
  prefs.putUShort("uptime", uptime_cyc + 1);
  prefs.end();

  rtc.diag_send_fail = 0;
  rtc.diag_ack_miss = 0;
  rtc.diag_sensor_fail = 0;
  rtc.diag_soil_fail = 0;
  rtc.diag_nvs_fail = 0;
  rtc.diag_wifi_fail = 0;
  rtc.diag_i2c_fail = 0;
  rtc.diag_ch_recovery = 0;
  rtc.diag_buf_overflow = 0;
}

// ── Normal Mode (3-pot) ──────────────────────────────────────────────

void run_normal_mode_3pot() {
#ifdef DEBUG_MODE
  Serial.println("[NORM] 3-pot normal mode");
#endif

  // ── Read sensors once (shared SHT31 + 3 soil pins) ──
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(400000);  // SHT31 supports up to 1MHz; 4x faster = shorter wake time
  Wire.setTimeOut(10);    // 10ms — SHT31 low rep max 4.4ms; catches bus lockup fast

  // No SHT31 soft reset needed — single-shot measurement works from any state.
  // Reset only wastes 40ms (two commands + two 20ms delays) every deep sleep wake.

  // Read sensors — readSHT31 returns integer x100 directly (no float on RISC-V)
  int16_t temp_x100;
  uint16_t hum_x100;
  bool sht31_ok = readSHT31(temp_x100, hum_x100);

  uint16_t soil[NUM_NODES];
  soil[0] = readSoilMoisture(SOIL_PIN_0);
  soil[1] = readSoilMoisture(SOIL_PIN_1);
  soil[2] = readSoilMoisture(SOIL_PIN_2);

  Wire.end();

  if (!sht31_ok) {
    temp_x100 = NEVER_SENT;
    hum_x100 = 0;
    rtc.consecutive_sensor_failures++;
    rtc.diag_sensor_fail++;
#ifdef DEBUG_MODE
    Serial.println("[NORM] SHT31 read failed");
#endif
  } else {
    rtc.consecutive_sensor_failures = 0;
  }

#ifdef DEBUG_MODE
  Serial.printf("[NORM] T=%d.%02dC H=%d.%02d%% Soil=[%d, %d, %d]\n",
    temp_x100 / 100, abs(temp_x100 % 100), hum_x100 / 100, hum_x100 % 100,
    soil[0], soil[1], soil[2]);
#endif

  // ── Store in each node's buffer ──
  for (int i = 0; i < NUM_NODES; i++) {
    auto &n = rtc.node[i];
    bool soil_ok = (soil[i] > 0 && soil[i] < 4095);

    n.buffer[n.cycle_count].temperature = temp_x100;
    n.buffer[n.cycle_count].humidity = sht31_ok ? (uint8_t)(hum_x100 / 50) : 0xFF;
    n.buffer[n.cycle_count].soil = soil_ok ? min((uint8_t)(soil[i] / 16), (uint8_t)254) : 0xFF;
    if (!soil_ok) rtc.diag_soil_fail++;
    n.cycle_count++;

    if (n.cycle_count >= MAX_READINGS_PER_NODE) {
#ifdef DEBUG_MODE
      Serial.printf("[NORM] Node %d buffer full, dropping oldest\n", i);
#endif
      rtc.diag_buf_overflow++;
      memmove(&n.buffer[0], &n.buffer[1], (MAX_READINGS_PER_NODE - 1) * sizeof(stored_reading_t));
      n.cycle_count--;
    }
  }

  // ── Determine which nodes need to send ──
  bool any_send = false;
  bool node_should_send[NUM_NODES];

  for (int i = 0; i < NUM_NODES; i++) {
    auto &n = rtc.node[i];
    auto &cfg = node_cfg[i];

    bool force = (n.cycle_count >= cfg.max_buffer_cycles);
    bool first = (n.last_sent_temp == NEVER_SENT);
    bool threshold = false;

    if (n.cycle_count >= cfg.min_buffer_cycles) {
      if (temp_x100 != NEVER_SENT && abs(temp_x100 - n.last_sent_temp) > (int16_t)cfg.temp_threshold)
        threshold = true;
      if (hum_x100 != 0 && abs((int16_t)hum_x100 - (int16_t)n.last_sent_hum) > (int16_t)cfg.hum_threshold)
        threshold = true;
      uint16_t s = soil[i];
      if (s != 0xFFFF && s > 0 && s < 4095 && abs((int16_t)s - (int16_t)n.last_sent_soil) > (int16_t)cfg.soil_threshold)
        threshold = true;
    }

    node_should_send[i] = force || first || threshold;

    // Backoff: after 6+ consecutive failures, only attempt every 6th cycle
    if (node_should_send[i] && n.consecutive_send_failures >= 6) {
      if (n.cycle_count % 6 != 0) {
#ifdef DEBUG_MODE
        Serial.printf("[NORM] Node %d: backoff (failures=%d)\n", i, n.consecutive_send_failures);
#endif
        node_should_send[i] = false;
      }
    }

    if (node_should_send[i]) any_send = true;

#ifdef DEBUG_MODE
    Serial.printf("[NORM] Node %d: cycle=%d/%d force=%d first=%d thr=%d -> %s\n",
      i, n.cycle_count, cfg.max_buffer_cycles, force, first, threshold,
      node_should_send[i] ? "SEND" : "SKIP");
#endif
  }

  // ── Send data for nodes that need it ──
  if (any_send) {
    // WiFi requires PLL at 80MHz
    setCpuFrequencyMhz(80);
    WiFi.mode(WIFI_STA);
    esp_wifi_start();  // Explicit start — WiFi.mode may skip on ESP32-C6
    esp_wifi_set_max_tx_power(78); // 20dBm max — needed for through-wall range

    for (int i = 0; i < NUM_NODES; i++) {
      if (!node_should_send[i] || rtc.node[i].cycle_count == 0) continue;

      // Switch to this node's virtual MAC (requires WiFi stop→start)
      esp_now_deinit();
      set_virtual_mac(i);
      esp_wifi_set_protocol(WIFI_IF_STA, WIFI_PROTOCOL_11B | WIFI_PROTOCOL_11G | WIFI_PROTOCOL_11N);
      esp_wifi_set_ps(WIFI_PS_NONE);
      esp_wifi_set_channel(node_cfg[i].wifi_channel, WIFI_SECOND_CHAN_NONE);
      esp_now_init();
      esp_now_register_send_cb(onEspNowSend);
      esp_now_register_recv_cb(onEspNowRecv);

      // Add gateway as peer
      esp_now_peer_info_t gw_peer = {};
      memcpy(gw_peer.peer_addr, node_cfg[i].gw_mac, 6);
      gw_peer.channel = node_cfg[i].wifi_channel;
      gw_peer.encrypt = false;
      esp_now_add_peer(&gw_peer);

      // Send batches for this node
      auto &n = rtc.node[i];
      bool ack_received = false;

      while (n.cycle_count > 0) {
        sensor_data_packet_t pkt;
        pkt.type = PKT_SENSOR_DATA;
        pkt.counter = n.hmac_counter += 1;

        uint8_t batch = min((uint16_t)MAX_READINGS_PER_PKT, n.cycle_count);
        pkt.reading_count = batch;

        for (uint8_t j = 0; j < batch; j++) {
          pkt.readings[j].temperature = n.buffer[j].temperature;
          pkt.readings[j].humidity = (n.buffer[j].humidity == 0xFF)
            ? 0xFFFF : (uint16_t)n.buffer[j].humidity * 50;
          pkt.readings[j].soil_raw = (n.buffer[j].soil == 0xFF)
            ? 0xFFFF : (uint16_t)n.buffer[j].soil * 16;
          uint16_t mins = (uint32_t)(n.cycle_count - 1 - j) * node_cfg[i].sleep_interval_sec / 60;
          pkt.readings[j].minutes_ago = (mins > 255) ? 255 : (uint8_t)mins;
        }

        // Append HMAC
        size_t payload_size = 6 + (batch * sizeof(reading_entry_t));
        uint8_t send_buf[250];
        memcpy(send_buf, &pkt, payload_size);
        compute_hmac_4(node_cfg[i].encryption_key, send_buf, payload_size, send_buf + payload_size);
        size_t pkt_size = payload_size + 4;

        // Single send, no retry — DATA_ACK is the success signal
        bool batch_ack = false;
#ifdef DEBUG_MODE
        Serial.printf("[NORM] Node %d: sending %d readings, ctr=%lu\n",
          i, batch, (unsigned long)pkt.counter);
#endif
        if (espnow_send_and_wait(node_cfg[i].gw_mac, send_buf, pkt_size, 200)) {
          if (espnow_wait_for_packet(PKT_DATA_ACK, 200)) {
            size_t ack_payload = sizeof(data_ack_packet_t);
            if (espnow_recv_len >= (int)(ack_payload + 4) &&
                verify_hmac_4(node_cfg[i].encryption_key, espnow_recv_buf, ack_payload, espnow_recv_buf + ack_payload)) {
              batch_ack = true;
            } else {
              espnow_recv_flag = false;
              rtc.diag_ack_miss++;
            }
          } else {
            rtc.diag_ack_miss++;
          }
        } else {
          rtc.diag_send_fail++;
        }

        if (!batch_ack) break;

        // Shift buffer: remove sent readings
        memmove(&n.buffer[0], &n.buffer[batch],
                (n.cycle_count - batch) * sizeof(stored_reading_t));
        n.cycle_count -= batch;
      }

      ack_received = (n.cycle_count == 0);

      if (ack_received) {
        n.last_sent_temp = temp_x100;
        n.last_sent_hum = hum_x100;
        n.last_sent_soil = soil[i];
        n.consecutive_send_failures = 0;
#ifdef DEBUG_MODE
        Serial.printf("[NORM] Node %d: ACK received, buffer clear\n", i);
#endif

        // Check for CONFIG_UPDATE (gateway sends it right after ACK)
        if (espnow_recv_flag && espnow_recv_buf[0] == PKT_CONFIG_UPDATE) {
          size_t cfg_payload = sizeof(config_update_packet_t);
          if (espnow_recv_len >= (int)(cfg_payload + 4) &&
              verify_hmac_4(node_cfg[i].encryption_key, espnow_recv_buf, cfg_payload, espnow_recv_buf + cfg_payload)) {
            config_update_packet_t *cfg_pkt = (config_update_packet_t *)espnow_recv_buf;
#ifdef DEBUG_MODE
            Serial.printf("[NORM] Node %d: config update (HMAC OK): sleep=%d\n", i, cfg_pkt->sleep_interval_sec);
#endif
            nvs_save_slot_config(i, cfg_pkt->sleep_interval_sec, cfg_pkt->min_buffer_cycles,
                                 cfg_pkt->max_buffer_cycles, cfg_pkt->temp_threshold,
                                 cfg_pkt->hum_threshold, cfg_pkt->soil_threshold);
            node_cfg[i].sleep_interval_sec = cfg_pkt->sleep_interval_sec;
            node_cfg[i].min_buffer_cycles  = cfg_pkt->min_buffer_cycles;
            node_cfg[i].max_buffer_cycles  = cfg_pkt->max_buffer_cycles;
            node_cfg[i].temp_threshold     = cfg_pkt->temp_threshold;
            node_cfg[i].hum_threshold      = cfg_pkt->hum_threshold;
            node_cfg[i].soil_threshold     = cfg_pkt->soil_threshold;

            config_ack_packet_t cfg_ack;
            cfg_ack.type = PKT_CONFIG_ACK;
            espnow_send_and_wait(node_cfg[i].gw_mac, (uint8_t *)&cfg_ack, sizeof(cfg_ack), 200);
          }
#ifdef DEBUG_MODE
          else Serial.printf("[SEC] Node %d: CONFIG_UPDATE HMAC failed, ignoring\n", i);
#endif
          espnow_recv_flag = false;
        }
      } else {
        n.consecutive_send_failures++;
#ifdef DEBUG_MODE
        Serial.printf("[NORM] Node %d: no ACK, failures=%d\n", i, n.consecutive_send_failures);
#endif
      }

      // Persist counter to NVS every 10 increments
      if (n.hmac_counter > 0 && n.hmac_counter % 10 == 0) {
        nvs_save_counter(i, n.hmac_counter);
      }

      // Remove gateway peer before switching MAC for next node
      esp_now_del_peer(node_cfg[i].gw_mac);

      // Small delay between nodes to avoid ESP-NOW queue flooding
      delay(50);
    }

    // Channel recovery: if any node has 6+ consecutive failures, scan channels (~1 hour at 10-min cycles)
    for (int i = 0; i < NUM_NODES; i++) {
      if (rtc.node[i].consecutive_send_failures > 0 &&
          rtc.node[i].consecutive_send_failures % 6 == 0) {
        esp_now_deinit();
        set_virtual_mac(i);
        esp_wifi_set_protocol(WIFI_IF_STA, WIFI_PROTOCOL_11B | WIFI_PROTOCOL_11G | WIFI_PROTOCOL_11N);
        esp_wifi_set_ps(WIFI_PS_NONE);
        esp_now_init();
        esp_now_register_send_cb(onEspNowSend);
        esp_now_register_recv_cb(onEspNowRecv);
        esp_now_peer_info_t gw = {};
        memcpy(gw.peer_addr, node_cfg[i].gw_mac, 6); gw.encrypt = false;
        esp_now_add_peer(&gw);
        if (channel_recovery(i)) {
          // All nodes' channels updated, will take effect next cycle
          break; // One successful recovery is enough
        }
      }
    }

    // Send diagnostics once using slot 0's MAC (physical device identity)
    esp_now_deinit();
    set_virtual_mac(0);
    esp_wifi_set_protocol(WIFI_IF_STA, WIFI_PROTOCOL_11B | WIFI_PROTOCOL_11G | WIFI_PROTOCOL_11N);
    esp_wifi_set_ps(WIFI_PS_NONE);
    esp_wifi_set_channel(node_cfg[0].wifi_channel, WIFI_SECOND_CHAN_NONE);
    esp_now_init();
    esp_now_register_send_cb(onEspNowSend);
    esp_now_peer_info_t dg_peer = {};
    memcpy(dg_peer.peer_addr, node_cfg[0].gw_mac, 6);
    dg_peer.channel = node_cfg[0].wifi_channel;
    dg_peer.encrypt = false;
    esp_now_add_peer(&dg_peer);
    send_diagnostics_3pot();

    esp_now_deinit();
    esp_wifi_stop();
  }

  // ── Sleep ──
#ifdef DEBUG_MODE
  Serial.printf("[NORM] Waiting %d seconds (debug delay)\n", node_cfg[0].sleep_interval_sec);
  delay((uint32_t)node_cfg[0].sleep_interval_sec * 1000UL);
  // Returns to loop() which re-calls run_normal_mode_3pot()
#else
  // Isolate GPIOs to prevent current leakage through floating pins
  gpio_reset_pin((gpio_num_t)SDA_PIN);
  gpio_reset_pin((gpio_num_t)SCL_PIN);
  gpio_reset_pin((gpio_num_t)SOIL_PIN_0);
  gpio_reset_pin((gpio_num_t)SOIL_PIN_1);
  gpio_reset_pin((gpio_num_t)SOIL_PIN_2);
  gpio_reset_pin((gpio_num_t)LED_PIN);

  // Power down unused RTC domains (only timer wakeup needed)
  esp_sleep_pd_config(ESP_PD_DOMAIN_RTC_PERIPH, ESP_PD_OPTION_OFF);
  esp_sleep_pd_config(ESP_PD_DOMAIN_VDDSDIO, ESP_PD_OPTION_OFF);

  esp_sleep_enable_timer_wakeup((uint64_t)node_cfg[0].sleep_interval_sec * 1000000ULL);
  esp_deep_sleep_start();
  // Never returns
#endif
}

// ── Setup & Loop ─────────────────────────────────────────────────────

void setup() {
  // 40MHz from XTAL (no PLL) — lowest for I2C, ADC; WiFi bumps to 80MHz when needed
  setCpuFrequencyMhz(40);

#ifndef DEBUG_MODE
  esp_log_level_set("*", ESP_LOG_NONE);  // Suppress IDF log formatting
#endif

#ifdef DEBUG_MODE
  Serial.begin(115200);
  delay(3000);
  Serial.println("[BOOT] TARAS 3-Pot Sensor Node starting");
#endif

  // Cold boot flash window — 2s delay so USB CDC is catchable for reflash
  if (rtc.magic != RTC_MAGIC_3POT) {
    delay(2000);
  }

  // Init RTC + read base MAC on cold boot only
  if (rtc.magic != RTC_MAGIC_3POT) {
    uint8_t rst = (uint8_t)esp_reset_reason();
    memset(&rtc, 0, sizeof(rtc));
    rtc.magic = RTC_MAGIC_3POT;
    rtc.last_reset_reason = rst;
    for (int i = 0; i < NUM_NODES; i++) {
      rtc.node[i].last_sent_temp = NEVER_SENT;
      rtc.node[i].hmac_counter = nvs_load_counter(i);
    }
    esp_read_mac(base_mac, ESP_MAC_WIFI_STA);
    // Increment persistent boot counter
    Preferences dg; dg.begin("diag", false);
    dg.putUShort("boots", dg.getUShort("boots", 0) + 1);
    dg.end();
#ifdef DEBUG_MODE
    Serial.println("[BOOT] Cold boot: RTC initialized");
    Serial.printf("[BOOT] Base MAC: %02X:%02X:%02X:%02X:%02X:%02X\n",
      base_mac[0], base_mac[1], base_mac[2], base_mac[3], base_mac[4], base_mac[5]);
#endif
  }

  // Warm wake: RTC valid + config cached → skip NVS flash reads (~6ms saved, 3 slots)
  bool all_paired = (rtc.magic == RTC_MAGIC_3POT && node_cfg[0].wifi_channel != 0);
  if (all_paired) {
    // Config already in RTC-surviving node_cfg (loaded on first boot)
    // Skip count_paired_slots() + nvs_load_slot() — go straight to normal mode
#ifdef DEBUG_MODE
    Serial.println("[BOOT] Warm wake: using RTC-cached config");
#endif
    return;  // Fall through to loop() → run_normal_mode_3pot()
  }

  uint8_t paired = count_paired_slots();

#ifdef DEBUG_MODE
  Serial.printf("[BOOT] Paired slots: %d/%d\n", paired, NUM_NODES);
#endif

  if (paired < NUM_NODES) {
    pinMode(LED_PIN, OUTPUT);  // LED only needed for pairing blinks
    ledOff();
    // Find the first unpaired slot
    uint8_t next_slot = 0;
    for (int i = 0; i < NUM_NODES; i++) {
      char ns[8]; sprintf(ns, "slot%d", i);
      Preferences p; p.begin(ns, true);
      bool is_paired = (p.getUChar("paired", 0) == 1);
      p.end();
      if (!is_paired) { next_slot = i; break; }
    }
    run_pairing_mode(next_slot);
    // Never returns (reboots after PAIR_COMPLETE)
  }

  // All 3 paired — load all configs
  for (int i = 0; i < NUM_NODES; i++) {
    if (!nvs_load_slot(i)) {
#ifdef DEBUG_MODE
      Serial.printf("[BOOT] Slot %d config invalid, factory reset\n", i);
#endif
      nvs_factory_reset_all();
      ESP.restart();
    }
#ifdef DEBUG_MODE
    uint8_t vmac[6];
    get_virtual_mac(i, vmac);
    Serial.printf("[BOOT] Slot %d: MAC=%02X:%02X:%02X:%02X:%02X:%02X GW=%02X:%02X:%02X:%02X:%02X:%02X ch=%d sleep=%ds\n",
      i, vmac[0], vmac[1], vmac[2], vmac[3], vmac[4], vmac[5],
      node_cfg[i].gw_mac[0], node_cfg[i].gw_mac[1], node_cfg[i].gw_mac[2],
      node_cfg[i].gw_mac[3], node_cfg[i].gw_mac[4], node_cfg[i].gw_mac[5],
      node_cfg[i].wifi_channel, node_cfg[i].sleep_interval_sec);
#endif
  }

  // Fall through to loop()
}

void loop() {
  run_normal_mode_3pot();
}
