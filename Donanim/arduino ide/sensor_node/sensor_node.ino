/*
 * TARAS Sensor Node — ESP32-C6 SuperMini
 * Battery-powered: SHT31 (temp/humidity) + capacitive soil moisture
 * ESP-NOW transport with HMAC signing, deep sleep between readings
 *
 * Sections: INCLUDES + PINS → PROTOCOL → RTC MEMORY → GLOBALS
 *   → UTILITIES (CRC8, HMAC, LED) → SENSORS → NVS
 *   → ESP-NOW → PAIRING MODE → NORMAL MODE HELPERS
 *   → NORMAL MODE → SETUP & LOOP
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

#define SDA_PIN   4
#define SCL_PIN   7
#define SOIL_PIN  0
#define LED_PIN   8
// NOTE: GPIO9 CANNOT be used (phantom ACKs from BOOT circuit)

#define SHT31_ADDR 0x44

// ── Protocol Constants ───────────────────────────────────────────────

#define PKT_PAIR_ACCEPT   0x03
#define PKT_PAIR_COMPLETE 0x04
#define PKT_SENSOR_DATA   0x10
#define PKT_DATA_ACK      0x11
#define PKT_CONFIG_UPDATE 0x20
#define PKT_CONFIG_ACK    0x21
#define PKT_PAIR_REJECTED 0x05
#define PKT_PAIR_BEACON   0x06
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

typedef struct __attribute__((packed)) {
  uint8_t type;
  uint8_t gateway_mac[6];
  uint8_t wifi_channel;
} pair_beacon_packet_t;

#define SENSOR_CAP_SHT31  0x01
#define SENSOR_CAP_SOIL   0x02

#define MAX_READINGS_PER_PKT 33  // (250 - 2 header - 4 HMAC) / 7 = 34, using 33
#define MAX_STORED_READINGS 2000 // ~1 week at 5-min intervals (4 bytes × 2000 = 8KB RTC)
#define SN_FW_VERSION   0x0100

// ── Packet Structures ────────────────────────────────────────────────

typedef struct __attribute__((packed)) {
  uint8_t type;
  uint8_t mac[6];
} pair_accept_packet_t;

typedef struct __attribute__((packed)) {
  uint8_t type;
  uint8_t device_key[16];
  uint8_t encryption_key[16]; // HMAC signing key (random, per-node)
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
  uint32_t counter;       // monotonic, for replay protection
  uint8_t reading_count;
  reading_entry_t readings[MAX_READINGS_PER_PKT]; // 33 × 7 = 231 + 6 header + 4 HMAC = 241 < 250
} sensor_data_packet_t;
// Note: 4-byte HMAC-SHA256 is appended after readings when sending

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

#define RTC_MAGIC  0xC6A70001
#define NEVER_SENT -30000

typedef struct {
  uint32_t magic;
  uint16_t cycle_count;               // up to 2000
  int16_t  last_sent_temp;
  uint16_t last_sent_hum;
  uint16_t last_sent_soil;
  uint16_t consecutive_send_failures;
  uint16_t consecutive_sensor_failures;
  uint32_t hmac_counter;               // monotonic counter for replay protection
  // Cached config — survives deep sleep, avoids NVS flash read every cycle
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
  stored_reading_t buffer[MAX_STORED_READINGS];  // 4 bytes × 2000 = 8KB
} rtc_state_t;

RTC_DATA_ATTR rtc_state_t rtc;

// ── ESP-NOW Callback Globals ─────────────────────────────────────────

static volatile bool espnow_send_done = false;
static volatile bool espnow_send_ok = false;
static volatile bool espnow_recv_flag = false;
static uint8_t espnow_recv_buf[250];
static int espnow_recv_len = 0;
static uint8_t espnow_recv_mac[6];

// ── Config Shortcuts (point into RTC cache) ──────────────────────────

static uint8_t *device_key = rtc.device_key;
static uint8_t *encryption_key = rtc.encryption_key;
static uint8_t *gw_mac = rtc.gw_mac;
static uint8_t &wifi_channel = rtc.wifi_channel;
static uint16_t &sleep_interval_sec = rtc.sleep_interval_sec;
static uint8_t &min_buffer_cycles = rtc.min_buffer_cycles;
static uint16_t &max_buffer_cycles = rtc.max_buffer_cycles;
static uint16_t &temp_threshold = rtc.temp_threshold;
static uint16_t &hum_threshold = rtc.hum_threshold;
static uint16_t &soil_threshold = rtc.soil_threshold;

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

void ledOn() { digitalWrite(LED_PIN, HIGH); }
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

uint16_t readSoilMoisture() {
  return (uint16_t)analogRead(SOIL_PIN);
}

// ── NVS Helpers ──────────────────────────────────────────────────────

bool nvs_is_paired() {
  Preferences prefs;
  prefs.begin("taras", true);
  uint8_t paired = prefs.getUChar("paired", 0);
  prefs.end();
  return (paired == 1);
}

bool nvs_load_pairing() {
  Preferences prefs;
  prefs.begin("taras", true);
  size_t dk_len = prefs.getBytes("device_key", device_key, 16);
  size_t ek_len = prefs.getBytes("enc_key", encryption_key, 16);
  size_t gw_len = prefs.getBytes("gw_mac", gw_mac, 6);
  wifi_channel = prefs.getUChar("channel", 0);
  prefs.end();
  return (dk_len == 16 && ek_len == 16 && gw_len == 6 && wifi_channel != 0);
}

void nvs_save_pairing(const uint8_t *dk, const uint8_t *ek, const uint8_t *mac, uint8_t ch) {
  Preferences prefs;
  prefs.begin("taras", false);
  prefs.putBytes("device_key", dk, 16);
  prefs.putBytes("enc_key", ek, 16);
  prefs.putBytes("gw_mac", mac, 6);
  prefs.putUChar("channel", ch);
  prefs.putUChar("paired", 1);
  prefs.end();
}

void nvs_load_config() {
  Preferences prefs;
  prefs.begin("taras", true);
  sleep_interval_sec = prefs.getUShort("sleep_sec", 300);
  min_buffer_cycles  = prefs.getUChar("min_buf", 2);
  max_buffer_cycles  = prefs.getUShort("max_buf", MAX_STORED_READINGS);
  temp_threshold     = prefs.getUShort("thr_temp", 100);
  hum_threshold      = prefs.getUShort("thr_hum", 500);
  soil_threshold     = prefs.getUShort("thr_soil", 410);
  prefs.end();

#ifdef DEBUG_MODE
  sleep_interval_sec = 10; // Debug: 10s sleep instead of NVS value
#endif
}

void nvs_save_counter() {
  Preferences prefs;
  prefs.begin("taras", false);
  prefs.putULong("hmac_ctr", rtc.hmac_counter);
  prefs.end();
}

uint32_t nvs_load_counter() {
  Preferences prefs;
  prefs.begin("taras", true);
  uint32_t ctr = prefs.getULong("hmac_ctr", 0);
  prefs.end();
  return ctr;
}

void nvs_save_config(uint16_t sleep, uint8_t min_b, uint16_t max_b,
                     uint16_t tt, uint16_t th, uint16_t ts) {
  Preferences prefs;
  prefs.begin("taras", false);
  prefs.putUShort("sleep_sec", sleep);
  prefs.putUChar("min_buf", min_b);
  prefs.putUShort("max_buf", max_b);
  prefs.putUShort("thr_temp", tt);
  prefs.putUShort("thr_hum", th);
  prefs.putUShort("thr_soil", ts);
  prefs.end();
}

void nvs_factory_reset() {
  Preferences prefs;
  prefs.begin("taras", false);
  prefs.clear();
  prefs.end();
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

void run_pairing_mode() {
#ifdef DEBUG_MODE
  Serial.println("[PAIR] Entering pairing mode (ch1 listen)");
#endif

  // Phase 1: Listen on channel 1 for PAIR_BEACON from gateway
  while (true) {
    // Init radio for this listen window (WiFi needs 80MHz PLL)
    setCpuFrequencyMhz(80);
    WiFi.mode(WIFI_STA);
    esp_wifi_start();
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

    ledOn(); // LED on during listen

#ifdef DEBUG_MODE
    Serial.println("[PAIR] Listening on ch1...");
#endif

    // Listen 1.5 seconds for PAIR_BEACON (beacon every 1s, so guaranteed catch)
    if (espnow_wait_for_packet(PKT_PAIR_BEACON, 1500)) {
      pair_beacon_packet_t *beacon = (pair_beacon_packet_t *)espnow_recv_buf;
      uint8_t wifi_ch = beacon->wifi_channel;

#ifdef DEBUG_MODE
      Serial.printf("[PAIR] PAIR_BEACON received! WiFi ch=%d\n", wifi_ch);
#endif

      // Get own MAC
      uint8_t my_mac[6];
      WiFi.macAddress(my_mac);

      // Register gateway as peer
      esp_now_peer_info_t gw_peer = {};
      memcpy(gw_peer.peer_addr, beacon->gateway_mac, 6);
      gw_peer.channel = 0;
      gw_peer.encrypt = false;
      esp_now_add_peer(&gw_peer);

      // Beacon IS the offer — respond with PAIR_ACCEPT directly on ch1
      pair_accept_packet_t accept;
      accept.type = PKT_PAIR_ACCEPT;
      memcpy(accept.mac, my_mac, 6);
      espnow_send_and_wait(beacon->gateway_mac, (uint8_t *)&accept, sizeof(accept), 200);

#ifdef DEBUG_MODE
      Serial.printf("[PAIR] PAIR_ACCEPT sent on ch1, switching to WiFi ch=%d\n", wifi_ch);
#endif

      // Switch to WiFi channel for PAIR_COMPLETE
      esp_wifi_set_channel(wifi_ch, WIFI_SECOND_CHAN_NONE);

      // Update gateway peer to WiFi channel
      esp_now_del_peer(beacon->gateway_mac);
      gw_peer.channel = wifi_ch;
      esp_now_add_peer(&gw_peer);

      {
        // Scope for offer pointer (reuse gateway MAC from beacon)
        const uint8_t *offer_gw_mac = beacon->gateway_mac;

        // Wait for PAIR_COMPLETE or PAIR_REJECTED (60s — gateway needs ~10s to reconnect + user decides)
        uint32_t wait_start = millis();
        uint32_t led_toggle = millis();
        bool led_state = false;
        bool got_complete = false;

        while (millis() - wait_start < 60000) {
          // Slow LED blink while waiting
          if (millis() - led_toggle > 500) {
            led_state = !led_state;
            if (led_state) ledOn(); else ledOff();
            led_toggle = millis();
          }

          if (espnow_recv_flag) {
            if (espnow_recv_buf[0] == PKT_PAIR_COMPLETE && espnow_recv_len >= (int)sizeof(pair_complete_packet_t)) {
              got_complete = true;
              break;
            } else if (espnow_recv_buf[0] == PKT_PAIR_REJECTED) {
#ifdef DEBUG_MODE
              Serial.println("[PAIR] Rejected, restarting scan");
#endif
              ledOn(); delay(500); ledOff(); delay(500);
              esp_now_del_peer(offer_gw_mac);
              espnow_recv_flag = false;
              break; // Back to outer listen loop
            }
            espnow_recv_flag = false;
          }
          delay(1);
        }

        if (got_complete) {
          // PAIR_STORING
          pair_complete_packet_t *complete = (pair_complete_packet_t *)espnow_recv_buf;

#ifdef DEBUG_MODE
          Serial.println("[PAIR] Got PAIR_COMPLETE, storing config...");
#endif

          nvs_save_pairing(complete->device_key, complete->encryption_key, complete->gateway_mac, complete->channel);
          nvs_save_config(complete->sleep_interval_sec,
                          complete->min_buffer_cycles,
                          complete->max_buffer_cycles,
                          complete->temp_threshold,
                          complete->hum_threshold,
                          complete->soil_threshold);

          // Success blink 3 seconds
          for (int i = 0; i < 6; i++) {
            ledOn(); delay(250);
            ledOff(); delay(250);
          }

          ESP.restart();
          // Never returns
        }

        // Timeout or rejected — cleanup and restart listen loop
#ifdef DEBUG_MODE
        Serial.println("[PAIR] PAIR_COMPLETE timeout, restarting listen");
#endif
        esp_now_del_peer(offer_gw_mac);
      } // end scope for offer_gw_mac

      // Cleanup gateway peer
      esp_now_del_peer(beacon->gateway_mac);
    }

    // No beacon received or pairing failed — clean up and wait
    ledOff();
    esp_now_deinit();
    esp_wifi_stop();

#ifdef DEBUG_MODE
    Serial.println("[PAIR] Waiting 4.5s...");
#endif

#ifdef DEBUG_MODE
    delay(4500); // Debug: delay instead of sleep (USB CDC dies on light sleep)
#else
    esp_sleep_enable_timer_wakeup(4500000);
    esp_light_sleep_start();
#endif

    // Loop continues, re-inits WiFi + ESP-NOW at top
  }
}

// ── Normal Mode Helpers ──────────────────────────────────────────────

void read_sensors(int16_t &temp_x100, uint16_t &hum_x100, uint16_t &soil) {
  // Init I2C
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(400000);  // SHT31 supports up to 1MHz; 4x faster = shorter wake time
  Wire.setTimeOut(10);    // 10ms — SHT31 low rep max 4.4ms; catches bus lockup fast

  // No SHT31 soft reset needed — single-shot measurement works from any state.
  // Reset only wastes 40ms (two commands + two 20ms delays) every deep sleep wake.

  // Read sensors — readSHT31 returns integer x100 directly (no float on RISC-V)
  bool sht31_ok = readSHT31(temp_x100, hum_x100);
  soil = readSoilMoisture();
  bool soil_ok = (soil > 0 && soil < 4095); // pegged at 0 or 4095 = disconnected

  // Done with I2C
  Wire.end();

  // Handle sensor failures
  if (!sht31_ok) {
#ifdef DEBUG_MODE
    Serial.println("[NORM] SHT31 read failed");
#endif
    temp_x100 = NEVER_SENT;
    hum_x100 = 0;
    rtc.consecutive_sensor_failures++;
    rtc.diag_sensor_fail++;
  } else {
    rtc.consecutive_sensor_failures = 0;
  }

  if (!soil_ok) {
#ifdef DEBUG_MODE
    Serial.printf("[NORM] Soil sensor suspect: %d\n", soil);
#endif
    soil = 0xFFFF;
    rtc.diag_soil_fail++;
  }

#ifdef DEBUG_MODE
  if (sht31_ok || soil_ok)
    Serial.printf("[NORM] T=%d.%02dC H=%d.%02d%% Soil=%d\n",
      temp_x100 / 100, abs(temp_x100 % 100), hum_x100 / 100, hum_x100 % 100, soil_ok ? (int)soil : -1);
#endif
}

bool should_send_data(int16_t temp_x100, uint16_t hum_x100, uint16_t soil) {
  bool force_send = (rtc.cycle_count >= max_buffer_cycles);
  bool first_send = (rtc.last_sent_temp == NEVER_SENT);
  bool threshold_send = false;

  if (rtc.cycle_count >= min_buffer_cycles) {
    // Only check thresholds for valid readings (ignore failure sentinels)
    if (temp_x100 != NEVER_SENT && abs(temp_x100 - rtc.last_sent_temp) > (int16_t)temp_threshold)
      threshold_send = true;
    if (hum_x100 != 0 && abs((int16_t)hum_x100 - (int16_t)rtc.last_sent_hum) > (int16_t)hum_threshold)
      threshold_send = true;
    if (soil != 0xFFFF && abs((int16_t)soil - (int16_t)rtc.last_sent_soil) > (int16_t)soil_threshold)
      threshold_send = true;
  }

  bool should_send = force_send || first_send || threshold_send;

#ifdef DEBUG_MODE
  Serial.printf("[NORM] Send decision: force=%d first=%d threshold=%d -> %s\n",
    force_send, first_send, threshold_send, should_send ? "SEND" : "SLEEP");
#endif

  return should_send;
}

bool send_data() {
  while (rtc.cycle_count > 0) {
    // Build packet batch
    sensor_data_packet_t pkt;
    pkt.type = PKT_SENSOR_DATA;
    pkt.counter = ++rtc.hmac_counter;

    uint8_t batch = min((uint16_t)MAX_READINGS_PER_PKT, rtc.cycle_count);
    pkt.reading_count = batch;

    for (uint8_t i = 0; i < batch; i++) {
      pkt.readings[i].temperature = rtc.buffer[i].temperature;
      pkt.readings[i].humidity = (rtc.buffer[i].humidity == 0xFF)
        ? 0xFFFF : (uint16_t)rtc.buffer[i].humidity * 50;
      pkt.readings[i].soil_raw = (rtc.buffer[i].soil == 0xFF)
        ? 0xFFFF : (uint16_t)rtc.buffer[i].soil * 16;
      uint16_t mins = (uint32_t)(rtc.cycle_count - 1 - i) * sleep_interval_sec / 60;
      pkt.readings[i].minutes_ago = (mins > 255) ? 255 : (uint8_t)mins;
    }

    // Append HMAC
    size_t payload_size = 6 + (batch * sizeof(reading_entry_t));
    uint8_t send_buf[250];
    memcpy(send_buf, &pkt, payload_size);
    compute_hmac_4(encryption_key, send_buf, payload_size, send_buf + payload_size);
    size_t pkt_size = payload_size + 4;

    // Single send, no retry — DATA_ACK is the success signal
    // If ACK missing, keep readings in buffer for next cycle (new counter avoids replay)
    bool batch_ack = false;
#ifdef DEBUG_MODE
    Serial.printf("[NORM] Sending %d readings, ctr=%lu\n", batch, (unsigned long)pkt.counter);
#endif
    if (espnow_send_and_wait(gw_mac, send_buf, pkt_size, 200)) {
      if (espnow_wait_for_packet(PKT_DATA_ACK, 200)) {
        size_t ack_payload = sizeof(data_ack_packet_t);
        if (espnow_recv_len >= (int)(ack_payload + 4) &&
            verify_hmac_4(encryption_key, espnow_recv_buf, ack_payload, espnow_recv_buf + ack_payload)) {
          batch_ack = true;  // Only clear buffer on confirmed ACK
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
    memmove(&rtc.buffer[0], &rtc.buffer[batch],
            (rtc.cycle_count - batch) * sizeof(stored_reading_t));
    rtc.cycle_count -= batch;
  }

  // Persist counter to NVS every 10 increments — survives power cycle
  if (rtc.hmac_counter > 0 && rtc.hmac_counter % 10 == 0) {
    nvs_save_counter();
  }

  return (rtc.cycle_count == 0);
}

bool channel_recovery() {
#ifdef DEBUG_MODE
  Serial.println("[NORM] Stored channel failed, scanning all channels...");
#endif
  // Build a zero-reading probe packet for channel scanning (no duplicate data)
  sensor_data_packet_t probe;
  probe.type = PKT_SENSOR_DATA;
  probe.counter = ++rtc.hmac_counter;
  probe.reading_count = 0; // probe only, no data
  size_t probe_payload = 6; // type(1)+counter(4)+count(1), no readings
  uint8_t probe_buf[16];
  memcpy(probe_buf, &probe, probe_payload);
  compute_hmac_4(encryption_key, probe_buf, probe_payload, probe_buf + probe_payload);
  size_t probe_size = probe_payload + 4;

  static const uint8_t scan_ch[] = { 1, 6, 11, 2, 3, 4, 5, 7, 8, 9, 10, 12, 13 };
  for (uint8_t ci = 0; ci < 13; ci++) {
    uint8_t ch = scan_ch[ci];
    if (ch == wifi_channel) continue;
    esp_wifi_set_channel(ch, WIFI_SECOND_CHAN_NONE);
    if (espnow_send_and_wait(gw_mac, probe_buf, probe_size, 200)) {
      if (espnow_wait_for_packet(PKT_DATA_ACK, 200)) {
        size_t ack_pl = sizeof(data_ack_packet_t);
        if (espnow_recv_len >= (int)(ack_pl + 4) &&
            verify_hmac_4(encryption_key, espnow_recv_buf, ack_pl, espnow_recv_buf + ack_pl)) {
          wifi_channel = ch;
          Preferences p; p.begin("taras", false);
          p.putUChar("channel", ch); p.end();
          rtc.diag_ch_recovery++;
#ifdef DEBUG_MODE
          Serial.printf("[NORM] Gateway found on ch=%d, NVS updated\n", ch);
#endif
          return true;
        }
      }
    }
  }
  return false;
}

void send_diagnostics() {
  // Load NVS cumulative counters
  Preferences prefs;
  prefs.begin("taras", true);
  uint16_t boot_cnt    = prefs.getUShort("dg_boots", 0);
  uint16_t uptime_cyc  = prefs.getUShort("dg_uptime", 0);
  uint16_t nv_send     = prefs.getUShort("dg_send", 0);
  uint16_t nv_ack      = prefs.getUShort("dg_ack", 0);
  uint16_t nv_sensor   = prefs.getUShort("dg_sensor", 0);
  uint8_t  nv_soil     = prefs.getUChar("dg_soil", 0);
  uint8_t  nv_nvs      = prefs.getUChar("dg_nvs", 0);
  uint8_t  nv_wifi     = prefs.getUChar("dg_wifi", 0);
  uint8_t  nv_i2c      = prefs.getUChar("dg_i2c", 0);
  uint8_t  nv_chrec    = prefs.getUChar("dg_chrec", 0);
  uint8_t  nv_bufovf   = prefs.getUChar("dg_bufovf", 0);
  prefs.end();

  // Merge RTC deltas into NVS totals
  nv_send   += rtc.diag_send_fail;
  nv_ack    += rtc.diag_ack_miss;
  nv_sensor += rtc.diag_sensor_fail;
  nv_soil   += rtc.diag_soil_fail;
  nv_nvs    += rtc.diag_nvs_fail;
  nv_wifi   += rtc.diag_wifi_fail;
  nv_i2c    += rtc.diag_i2c_fail;
  nv_chrec  += rtc.diag_ch_recovery;
  nv_bufovf += rtc.diag_buf_overflow;

  // Build variable-length diagnostic packet
  uint8_t pkt[64];  // max 16 header + 10×3 entries + 4 HMAC = 50
  pkt[0] = PKT_DIAGNOSTIC;
  uint32_t ctr = ++rtc.hmac_counter;
  memcpy(pkt + 1, &ctr, 4);
  pkt[5] = 1;  // version
  pkt[6] = rtc.last_reset_reason;
  memcpy(pkt + 7, &boot_cnt, 2);
  memcpy(pkt + 9, &uptime_cyc, 2);

  // Pack only non-zero failure entries
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
  compute_hmac_4(encryption_key, pkt, payload, pkt + payload);
  espnow_send_and_wait(gw_mac, pkt, payload + 4, 200);

#ifdef DEBUG_MODE
  Serial.printf("[DIAG] Sent: rst=%d boots=%d entries=%d\n", rtc.last_reset_reason, boot_cnt, n);
#endif

  // Persist updated NVS counters + increment uptime
  prefs.begin("taras", false);
  prefs.putUShort("dg_send",   nv_send);
  prefs.putUShort("dg_ack",    nv_ack);
  prefs.putUShort("dg_sensor", nv_sensor);
  prefs.putUChar("dg_soil",    nv_soil);
  prefs.putUChar("dg_nvs",     nv_nvs);
  prefs.putUChar("dg_wifi",    nv_wifi);
  prefs.putUChar("dg_i2c",     nv_i2c);
  prefs.putUChar("dg_chrec",   nv_chrec);
  prefs.putUChar("dg_bufovf",  nv_bufovf);
  prefs.putUShort("dg_uptime", uptime_cyc + 1);
  prefs.end();

  // Reset RTC deltas
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

void process_ack(bool ack_received, int16_t temp_x100, uint16_t hum_x100, uint16_t soil) {
  if (ack_received) {
#ifdef DEBUG_MODE
    Serial.println("[NORM] ACK received");
#endif
    rtc.cycle_count = 0;
    rtc.last_sent_temp = temp_x100;
    rtc.last_sent_hum = hum_x100;
    rtc.last_sent_soil = soil;
    rtc.consecutive_send_failures = 0;

    // Check for CONFIG_UPDATE (gateway sends it right after ACK, no delay needed)
    if (espnow_recv_flag && espnow_recv_buf[0] == PKT_CONFIG_UPDATE) {
      size_t cfg_payload = sizeof(config_update_packet_t);
      if (espnow_recv_len >= (int)(cfg_payload + 4) &&
          verify_hmac_4(encryption_key, espnow_recv_buf, cfg_payload, espnow_recv_buf + cfg_payload)) {
        config_update_packet_t *cfg = (config_update_packet_t *)espnow_recv_buf;
#ifdef DEBUG_MODE
        Serial.printf("[NORM] Config update (HMAC OK): sleep=%d\n", cfg->sleep_interval_sec);
#endif
        nvs_save_config(cfg->sleep_interval_sec, cfg->min_buffer_cycles,
                        cfg->max_buffer_cycles, cfg->temp_threshold,
                        cfg->hum_threshold, cfg->soil_threshold);
        sleep_interval_sec = cfg->sleep_interval_sec;
        min_buffer_cycles  = cfg->min_buffer_cycles;
        max_buffer_cycles  = cfg->max_buffer_cycles;
        temp_threshold     = cfg->temp_threshold;
        hum_threshold      = cfg->hum_threshold;
        soil_threshold     = cfg->soil_threshold;
        config_ack_packet_t ack;
        ack.type = PKT_CONFIG_ACK;
        espnow_send_and_wait(gw_mac, (uint8_t *)&ack, sizeof(ack), 200);
      }
#ifdef DEBUG_MODE
      else Serial.println("[SEC] CONFIG_UPDATE HMAC failed, ignoring");
#endif
    }
  } else {
#ifdef DEBUG_MODE
    Serial.println("[NORM] No ACK received");
#endif
    rtc.consecutive_send_failures++;
#ifdef DEBUG_MODE
    Serial.printf("[NORM] Consecutive failures: %d\n", rtc.consecutive_send_failures);
#endif
  }
}

// ── Normal Mode ──────────────────────────────────────────────────────

void run_normal_mode() {
  // LED pin not configured in normal mode (saves GPIO register write on every wake)

#ifdef DEBUG_MODE
  Serial.println("[NORM] Entering normal mode");
#endif

  // Cold boot: load config from NVS into RTC cache
  // Warm wake (deep sleep): RTC cache is valid, skip flash read (~3ms saved)
  if (rtc.wifi_channel == 0) {
    if (!nvs_load_pairing()) {
#ifdef DEBUG_MODE
      Serial.println("[NORM] Pairing data invalid, factory reset");
#endif
      nvs_factory_reset();
      ESP.restart();
    }
    nvs_load_config();
  }

#ifdef DEBUG_MODE
  Serial.printf("[NORM] GW: %02X:%02X:%02X:%02X:%02X:%02X ch=%d sleep=%ds\n",
    gw_mac[0], gw_mac[1], gw_mac[2], gw_mac[3], gw_mac[4], gw_mac[5],
    wifi_channel, sleep_interval_sec);
  Serial.printf("[NORM] Cycle %d/%d\n", rtc.cycle_count, max_buffer_cycles);
#endif

  // Read sensors
  int16_t temp_x100; uint16_t hum_x100; uint16_t soil;
  read_sensors(temp_x100, hum_x100, soil);

  // Store in compact buffer
  rtc.buffer[rtc.cycle_count].temperature = temp_x100;
  rtc.buffer[rtc.cycle_count].humidity = (temp_x100 != NEVER_SENT) ? (uint8_t)(hum_x100 / 50) : 0xFF;
  rtc.buffer[rtc.cycle_count].soil = (soil != 0xFFFF) ? min((uint8_t)(soil / 16), (uint8_t)254) : 0xFF;
  rtc.cycle_count++;

  // Send decision
  bool should_send = should_send_data(temp_x100, hum_x100, soil);

  // Backoff: after 6+ consecutive failures, only attempt every 6th cycle (saves battery)
  if (should_send && rtc.consecutive_send_failures >= 6) {
    if (rtc.cycle_count % 6 != 0) {
#ifdef DEBUG_MODE
      Serial.printf("[NORM] Backoff: skipping send (failures=%d, next at cycle %d)\n",
        rtc.consecutive_send_failures, rtc.cycle_count + (6 - rtc.cycle_count % 6));
#endif
      should_send = false;
    }
  }

  // Send data if needed
  if (should_send && rtc.cycle_count > 0) {
    // WiFi requires PLL at 80MHz
    setCpuFrequencyMhz(80);
    WiFi.mode(WIFI_STA);
    esp_wifi_start(); // explicit start — WiFi.mode may skip after esp_wifi_stop()
    esp_wifi_set_protocol(WIFI_IF_STA, WIFI_PROTOCOL_11B | WIFI_PROTOCOL_11G | WIFI_PROTOCOL_11N);
    esp_wifi_set_ps(WIFI_PS_NONE);
    esp_wifi_set_max_tx_power(78); // 20dBm max — needed for through-wall range
    esp_wifi_set_channel(wifi_channel, WIFI_SECOND_CHAN_NONE);
    esp_now_init();
    esp_now_register_send_cb(onEspNowSend);
    esp_now_register_recv_cb(onEspNowRecv);

    esp_now_peer_info_t gw_peer = {};
    memcpy(gw_peer.peer_addr, gw_mac, 6);
    gw_peer.channel = wifi_channel;
    gw_peer.encrypt = false;
    esp_now_add_peer(&gw_peer);

    bool ack_received = send_data();

    // Channel recovery: scan all channels every 6th failure (~1 hour at 10-min cycles)
    if (!ack_received && rtc.consecutive_send_failures > 0 &&
        rtc.consecutive_send_failures % 6 == 0) {
      ack_received = channel_recovery();
    }

    process_ack(ack_received, temp_x100, hum_x100, soil);
    send_diagnostics();  // Piggyback on radio-on window

    esp_now_deinit();
    esp_wifi_stop();
  }

  // Handle buffer overflow (drop oldest if full)
  if (rtc.cycle_count >= MAX_STORED_READINGS) {
#ifdef DEBUG_MODE
    Serial.println("[NORM] Buffer full, dropping oldest reading");
#endif
    rtc.diag_buf_overflow++;
    memmove(&rtc.buffer[0], &rtc.buffer[1],
            (MAX_STORED_READINGS - 1) * sizeof(stored_reading_t));
    rtc.cycle_count--;
  }

  // Sleep
#ifdef DEBUG_MODE
  Serial.printf("[NORM] Waiting %d seconds (debug delay)\n", sleep_interval_sec);
  delay((uint32_t)sleep_interval_sec * 1000UL);
  // Returns to loop() which re-calls run_normal_mode()
#else
  // Isolate GPIOs to prevent current leakage through floating pins
  gpio_reset_pin((gpio_num_t)SDA_PIN);
  gpio_reset_pin((gpio_num_t)SCL_PIN);
  gpio_reset_pin((gpio_num_t)SOIL_PIN);
  gpio_reset_pin((gpio_num_t)LED_PIN);

  // Power down unused RTC domains (only timer wakeup needed)
  esp_sleep_pd_config(ESP_PD_DOMAIN_RTC_PERIPH, ESP_PD_OPTION_OFF);
  esp_sleep_pd_config(ESP_PD_DOMAIN_VDDSDIO, ESP_PD_OPTION_OFF);

  esp_sleep_enable_timer_wakeup((uint64_t)sleep_interval_sec * 1000000ULL);
  esp_deep_sleep_start();
  // Never returns
#endif
}

// ── Setup & Loop ─────────────────────────────────────────────────────

static bool is_paired = false;

void setup() {
  // 40MHz from XTAL (no PLL) — lowest for I2C, ADC; WiFi bumps to 80MHz when needed
  setCpuFrequencyMhz(40);

#ifndef DEBUG_MODE
  // Suppress all IDF log formatting — saves ~1-2ms CPU time per boot
  // WiFi/NVS subsystems format log strings even without Serial
  esp_log_level_set("*", ESP_LOG_NONE);
#endif

#ifdef DEBUG_MODE
  Serial.begin(115200);
  delay(3000);
  Serial.println("[BOOT] TARAS Sensor Node starting");
#endif

  // Cold boot flash window — 2s delay so USB CDC is catchable for reflash
  if (rtc.magic != RTC_MAGIC) {
    delay(2000);
  }

  // Init RTC on cold boot
  if (rtc.magic != RTC_MAGIC) {
    uint8_t rst = (uint8_t)esp_reset_reason();
    memset(&rtc, 0, sizeof(rtc));
    rtc.magic = RTC_MAGIC;
    rtc.last_sent_temp = NEVER_SENT;
    rtc.hmac_counter = nvs_load_counter();
    rtc.last_reset_reason = rst;
    // Increment persistent boot counter
    Preferences dg; dg.begin("taras", false);
    dg.putUShort("dg_boots", dg.getUShort("dg_boots", 0) + 1);
    dg.end();
  }

  // Warm wake: RTC valid + config cached → skip NVS flash read (~2ms saved)
  is_paired = (rtc.magic == RTC_MAGIC && rtc.wifi_channel != 0);
  if (!is_paired) {
    is_paired = nvs_is_paired();
  }

  if (!is_paired) {
    pinMode(LED_PIN, OUTPUT);  // LED only needed for pairing blinks
    ledOff();
    run_pairing_mode(); // never returns (loops internally)
  }
  // If paired, fall through to loop() — no LED pin setup needed
}

void loop() {
  if (is_paired) {
    run_normal_mode(); // in debug: returns after delay; in production: never returns (deep sleep)
  }
}
