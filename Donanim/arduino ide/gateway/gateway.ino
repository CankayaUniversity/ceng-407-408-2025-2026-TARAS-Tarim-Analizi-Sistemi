/*
 * TARAS Gateway — ESP32 WROOM-32
 * Radio bridge: ESP-NOW sensor nodes → WiFi HTTP + Socket.IO → Backend
 * BLE provisioning on first boot, OTA firmware updates
 *
 * Sections: INCLUDES → CONFIG → PROTOCOL → STATE
 *   → UTILITIES → NVS → HTTP → SPIFFS BUFFER → ESP-NOW
 *   → CONFIG HELPERS → PACKET HANDLERS → OTA → SOCKET.IO
 *   → BLE PROVISIONING → SETUP & LOOP
 */

// ── Includes ─────────────────────────────────────────────────────────
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include "isrg_root_x1.h"
#include "gateway_config.h"  // Local: BACKEND_HOST tanimi (gitignored)
#include <SPIFFS.h>
#include <Preferences.h>
#include <WebSocketsClient.h>
#include <SocketIOclient.h>
#include <ArduinoJson.h>
#include <Update.h>
#include <NimBLEDevice.h>
#include <esp_mac.h>
#include <driver/gpio.h>
#include <mbedtls/md.h>

// ── Configuration ────────────────────────────────────────────────────
// BACKEND_HOST gateway_config.h dosyasinda tanimli (gitignored).
// HTTPS uses port 443 with WiFiClientSecure validating against ISRG Root X1
// (Let's Encrypt root CA, bundled in isrg_root_x1.h).
#define GW_FW_VERSION      "1.0.3"
#define BACKEND_PORT       443
#define BACKEND_DATA_PATH  "/api/sensors/device/data"
#define SOCKETIO_PATH      "/socket.io/?EIO=3"

#define LED_PIN            2
#define MAX_PAIRED_NODES   20
#define HEARTBEAT_INTERVAL 60000
#define FLUSH_INTERVAL     30000
#define REG_DEFAULT_TIMEOUT 120000
#define BUFFER_FILE        "/buffer.dat"
#define BUFFER_MAX_SIZE    65536

// BLE UUIDs
#define BLE_SERVICE_UUID   "4e5f6a7b-1234-5678-9abc-def012345678"
#define BLE_CHAR_SSID_UUID "4e5f6a7b-1234-5678-9abc-def012345601"
#define BLE_CHAR_PASS_UUID "4e5f6a7b-1234-5678-9abc-def012345602"
#define BLE_CHAR_KEY_UUID  "4e5f6a7b-1234-5678-9abc-def012345603"
#define BLE_CHAR_STAT_UUID "4e5f6a7b-1234-5678-9abc-def012345604"

// ── Protocol (must match sensor_node.ino) ────────────────────────────
#define PKT_PAIR_ACCEPT   0x03
#define PKT_PAIR_COMPLETE 0x04
#define PKT_SENSOR_DATA   0x10
#define PKT_DATA_ACK      0x11
#define PKT_CONFIG_UPDATE 0x20
#define PKT_CONFIG_ACK    0x21
#define PKT_PAIR_REJECTED 0x05
#define PKT_PAIR_BEACON   0x06
#define PKT_DIAGNOSTIC    0x12

// Diagnostic failure type enum → JSON key mapping
static const char *DIAG_NAMES[] = {
  NULL,              // 0x00 unused
  "send_fail",       // 0x01
  "ack_miss",        // 0x02
  "sensor_fail",     // 0x03
  "soil_fail",       // 0x04
  "nvs_fail",        // 0x05
  "wifi_fail",       // 0x06
  "i2c_fail",        // 0x07
  "ch_recovery",     // 0x08
  "buf_overflow",    // 0x09
  "abnormal_reset",  // 0x0A
};
#define DIAG_NAME_COUNT 11

#define SENSOR_CAP_SHT31  0x01
#define SENSOR_CAP_SOIL   0x02
#define MAX_READINGS      33  // (250 - 2 header - 4 HMAC) / 7 = 34, using 33

typedef struct __attribute__((packed)) {
  uint8_t type; uint8_t mac[6];
} pair_accept_packet_t;

typedef struct __attribute__((packed)) {
  uint8_t type; uint8_t device_key[16]; uint8_t encryption_key[16]; // HMAC signing key
  uint8_t gateway_mac[6]; uint8_t channel;
  uint16_t sleep_interval_sec; uint8_t min_buffer_cycles; uint16_t max_buffer_cycles;
  uint16_t temp_threshold; uint16_t hum_threshold; uint16_t soil_threshold;
} pair_complete_packet_t;

typedef struct __attribute__((packed)) {
  uint8_t minutes_ago; int16_t temperature; uint16_t humidity; uint16_t soil_raw;
} reading_entry_t;

typedef struct __attribute__((packed)) {
  uint8_t type; uint32_t counter; uint8_t reading_count;
  reading_entry_t readings[MAX_READINGS];
} sensor_data_packet_t;
// Note: 4-byte HMAC-SHA256 appended after readings by sender

typedef struct __attribute__((packed)) { uint8_t type; uint8_t ack_count; } data_ack_packet_t;

typedef struct __attribute__((packed)) {
  uint8_t type; uint16_t sleep_interval_sec; uint8_t min_buffer_cycles;
  uint16_t max_buffer_cycles; uint16_t temp_threshold; uint16_t hum_threshold;
  uint16_t soil_threshold;
} config_update_packet_t;

typedef struct __attribute__((packed)) { uint8_t type; } config_ack_packet_t;

typedef struct __attribute__((packed)) {
  uint8_t type;           // PKT_PAIR_BEACON
  uint8_t gateway_mac[6];
  uint8_t wifi_channel;
} pair_beacon_packet_t;

// ── State & Globals ──────────────────────────────────────────────────
enum GatewayMode { MODE_INIT, MODE_NORMAL, MODE_REGISTRATION };
static GatewayMode currentMode = MODE_INIT;

struct PairedNode {
  uint8_t mac[6]; char device_key[37]; uint8_t encryption_key[16];
  uint32_t last_counter; // replay protection — tracks last seen counter per node
  bool has_pending_config; config_update_packet_t pending_config;
};
static PairedNode paired_nodes[MAX_PAIRED_NODES];
static int paired_node_count = 0;

// Telemetry counters (reported in heartbeat for remote debugging)
static uint32_t packets_accepted = 0;
static uint32_t packets_rejected = 0;
static uint32_t packets_received = 0;

// Pending HTTP POST queue — ACKs sent immediately, POSTs deferred
#define MAX_PENDING_POSTS 10
struct PendingPost {
  char device_key[37];
  uint8_t mac[6];
  reading_entry_t readings[MAX_READINGS];
  uint8_t count;
  bool active;
};
static PendingPost pendingPosts[MAX_PENDING_POSTS];
static int pendingPostCount = 0;

static char gw_api_key[128] = {0};
static char gw_id[64] = {0};
static char wifi_ssid[64] = {0};
static char wifi_pass[64] = {0};

#define ESPNOW_QUEUE_SIZE 32
struct EspNowMessage { uint8_t mac[6]; uint8_t data[250]; int data_len; };
static QueueHandle_t espNowQueue;

// Subclass to expose CA-validated Socket.IO SSL on ESP32.
// links2004 WebSockets gates SocketIOclient::beginSSLWithCA behind SSL_BARESSL,
// which is only defined on ESP8266+BearSSL. ESP32 path defines SSL_AXTLS instead,
// so the public CA method is not compiled. The parent WebSocketsClient::
// beginSocketIOSSLWithCA IS compiled on ESP32 but hidden by `protected` inheritance.
// This wrapper re-exposes it via a public method that mirrors what the library's
// own beginSSL does (call into parent + enable heartbeat + initClient).
class SocketIOclientCA : public SocketIOclient {
public:
  void beginSSLWithCA(const char *host, uint16_t port, const char *url,
                      const char *CA_cert, const char *protocol = "arduino") {
    WebSocketsClient::beginSocketIOSSLWithCA(host, port, url, CA_cert, protocol);
    WebSocketsClient::enableHeartbeat(60 * 1000, 90 * 1000, 5);
    initClient();
  }
};

SocketIOclientCA socketIO;
static bool socketIO_connected = false;
static bool socketIO_initialized = false;
static bool socketIO_authed = false; // true after auth_result received

static unsigned long lastHeartbeat = 0, lastFlush = 0;
static unsigned long registrationStart = 0, registrationTimeout = REG_DEFAULT_TIMEOUT;
static unsigned long lastWifiCheck = 0;

static uint8_t last_discovered_mac[6] = {0};
static uint8_t stored_wifi_channel = 0;
static uint8_t last_discovered_caps = 0;
static bool pending_node_discovered = false; // emit node_discovered once Socket.IO is ready
static bool beacon_active = false;

// Compact buffer record: 12-byte header + N×7 raw readings (vs ~3.7KB JSON)
#define BUFFER_MAGIC_V2    0xBEEF0002
struct BufferRecordV2 {
  uint8_t mac[6]; uint8_t count; size_t flag_pos;
};

// ── Utilities ────────────────────────────────────────────────────────

// ── LED Pattern Engine ───────────────────────────────────────────────
struct LedStep { uint16_t ms; bool on; };
static const LedStep PAT_FAST[]   = { {100,true}, {100,false}, {0,false} };
static const LedStep PAT_SLOW[]   = { {1000,true}, {2000,false}, {0,false} };
static const LedStep PAT_DOUBLE[] = { {150,true}, {150,false}, {150,true}, {2000,false}, {0,false} };
static const LedStep PAT_TRIPLE[] = { {100,true}, {100,false}, {100,true}, {100,false}, {100,true}, {1000,false}, {0,false} };

static const LedStep *ledPattern = PAT_FAST;
static uint8_t ledStep = 0;
static unsigned long ledLastToggle = 0;

void setLedPattern(const LedStep *pat) {
  if (ledPattern != pat) { ledPattern = pat; ledStep = 0; ledLastToggle = millis(); }
}

void updateLED() {
  if (!ledPattern) return;
  if (millis() - ledLastToggle >= ledPattern[ledStep].ms) {
    ledStep++;
    if (ledPattern[ledStep].ms == 0) ledStep = 0; // wrap at sentinel
    digitalWrite(LED_PIN, ledPattern[ledStep].on ? HIGH : LOW);
    ledLastToggle = millis();
  }
}

void selectLedForMode() {
  switch (currentMode) {
    case MODE_INIT:         setLedPattern(PAT_FAST); break;
    case MODE_REGISTRATION: setLedPattern(PAT_TRIPLE); break;
    case MODE_NORMAL:
      setLedPattern(WiFi.status() == WL_CONNECTED ? PAT_SLOW : PAT_DOUBLE);
      break;
  }
}

// ── UUID Helpers ─────────────────────────────────────────────────────
void uuidBytesToString(const uint8_t *b, char *s) {
  sprintf(s, "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
    b[0],b[1],b[2],b[3],b[4],b[5],b[6],b[7],b[8],b[9],b[10],b[11],b[12],b[13],b[14],b[15]);
}

void uuidStringToBytes(const char *s, uint8_t *b) {
  int bi = 0;
  for (int i = 0; s[i] && bi < 16; i++) {
    if (s[i] == '-') continue;
    auto hex = [](char c) -> uint8_t {
      return (c >= '0' && c <= '9') ? c - '0' : (c >= 'a' && c <= 'f') ? 10 + c - 'a' : 10 + c - 'A';
    };
    b[bi++] = (hex(s[i]) << 4) | hex(s[++i]);
  }
}

bool isValidUUID(const char *s) {
  return strlen(s) == 36 && s[8] == '-' && s[13] == '-' && s[18] == '-' && s[23] == '-';
}

// ── MAC Helpers ──────────────────────────────────────────────────────
void macToStr(const uint8_t *m, char *buf) {
  sprintf(buf, "%02X:%02X:%02X:%02X:%02X:%02X", m[0],m[1],m[2],m[3],m[4],m[5]);
}

bool stringToMac(const char *s, uint8_t *m) {
  return sscanf(s, "%hhx:%hhx:%hhx:%hhx:%hhx:%hhx", &m[0],&m[1],&m[2],&m[3],&m[4],&m[5]) == 6;
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

// ── Hex Helpers ──────────────────────────────────────────────────────
void bytesToHex(const uint8_t *b, int len, char *hex) {
  for (int i = 0; i < len; i++) sprintf(hex + i * 2, "%02x", b[i]);
  hex[len * 2] = '\0';
}

void hexToBytes(const char *hex, uint8_t *b, int len) {
  for (int i = 0; i < len; i++) sscanf(hex + i * 2, "%02hhx", &b[i]);
}

// ── NVS ──────────────────────────────────────────────────────────────
void loadGatewayConfig() {
  Preferences p; p.begin("gw_config", true);
  p.getString("api_key", gw_api_key, sizeof(gw_api_key));
  p.getString("gw_id", gw_id, sizeof(gw_id));
  p.getString("wifi_ssid", wifi_ssid, sizeof(wifi_ssid));
  p.getString("wifi_pass", wifi_pass, sizeof(wifi_pass));
  paired_node_count = min((int)p.getUChar("node_count", 0), MAX_PAIRED_NODES);
  p.end();
}

void saveGatewayConfig() {
  Preferences p; p.begin("gw_config", false);
  p.putString("api_key", gw_api_key);
  p.putString("gw_id", gw_id);
  p.putString("wifi_ssid", wifi_ssid);
  p.putString("wifi_pass", wifi_pass);
  p.putUChar("node_count", (uint8_t)paired_node_count);
  p.end();
}

void loadNodeRegistry() {
  Preferences p; p.begin("gw_nodes", true);
  for (int i = 0; i < paired_node_count; i++) {
    char key[8]; sprintf(key, "n%d", i);
    String json = p.getString(key, "");
    if (json.length() == 0) continue;
    JsonDocument doc;
    if (deserializeJson(doc, json) != DeserializationError::Ok) continue;
    const char *macStr = doc["mac"], *dkStr = doc["dk"], *ekStr = doc["ek"];
    if (!macStr || !dkStr) continue;
    stringToMac(macStr, paired_nodes[i].mac);
    strncpy(paired_nodes[i].device_key, dkStr, 36);
    paired_nodes[i].device_key[36] = '\0';
    if (ekStr && strlen(ekStr) == 32) {
      hexToBytes(ekStr, paired_nodes[i].encryption_key, 16);
    } else {
      memset(paired_nodes[i].encryption_key, 0, 16);
    }
    paired_nodes[i].last_counter = doc["lc"] | 0; // persisted counter survives reboots
    paired_nodes[i].has_pending_config = false;
    esp_now_peer_info_t peer = {};
    memcpy(peer.peer_addr, paired_nodes[i].mac, 6);
    peer.encrypt = false;
    esp_now_add_peer(&peer);
    Serial.printf("[NVS] Loaded node %d: %s key=%s ek=%s\n", i, macStr, paired_nodes[i].device_key,
      ekStr ? "yes" : "MISSING");
  }
  p.end();
}

void saveNode(const uint8_t *mac, const char *dk, const uint8_t *ek) {
  if (paired_node_count >= MAX_PAIRED_NODES) return;
  int idx = paired_node_count;
  memcpy(paired_nodes[idx].mac, mac, 6);
  strncpy(paired_nodes[idx].device_key, dk, 36);
  paired_nodes[idx].device_key[36] = '\0';
  memcpy(paired_nodes[idx].encryption_key, ek, 16);
  paired_nodes[idx].last_counter = 0;
  paired_nodes[idx].has_pending_config = false;
  paired_node_count++;

  Preferences p; p.begin("gw_nodes", false);
  char key[8]; sprintf(key, "n%d", idx);
  char macBuf[18]; macToStr(mac, macBuf);
  char ekHex[33]; bytesToHex(ek, 16, ekHex);
  JsonDocument doc; doc["mac"] = macBuf; doc["dk"] = dk; doc["ek"] = ekHex; doc["lc"] = 0;
  String json; serializeJson(doc, json);
  p.putString(key, json); p.end();
  saveGatewayConfig();

  if (!esp_now_is_peer_exist(mac)) {
    esp_now_peer_info_t peer = {};
    memcpy(peer.peer_addr, mac, 6); peer.encrypt = false;
    esp_now_add_peer(&peer);
  }
  Serial.printf("[NVS] Saved node %d: %s key=%s ek=yes\n", idx, macBuf, dk);
}

int findNodeByMac(const uint8_t *mac) {
  for (int i = 0; i < paired_node_count; i++)
    if (memcmp(paired_nodes[i].mac, mac, 6) == 0) return i;
  return -1;
}

int findNodeByKey(const char *dk) {
  for (int i = 0; i < paired_node_count; i++)
    if (strcmp(paired_nodes[i].device_key, dk) == 0) return i;
  return -1;
}

// ── HTTP ─────────────────────────────────────────────────────────────
// Build JSON array from raw readings (shared by live send + flush)
String buildReadingsJson(const reading_entry_t *readings, uint8_t count) {
  JsonDocument doc; JsonArray arr = doc.to<JsonArray>();
  for (uint8_t i = 0; i < count; i++) {
    JsonObject r = arr.add<JsonObject>();
    r["minutes_ago"] = readings[i].minutes_ago;
    uint8_t err = 0;
    if (readings[i].temperature == -30000) err |= 1;
    if (readings[i].soil_raw == 0xFFFF) err |= 2;
    if (err) r["sensor_error"] = err;
    if (!(err & 1)) {
      r["temperature"] = readings[i].temperature / 100.0;
      r["humidity"] = readings[i].humidity / 100.0;
      r["raw_temperature"] = readings[i].temperature;
      r["raw_humidity"] = readings[i].humidity;
    }
    if (!(err & 2)) r["raw_sm_value"] = readings[i].soil_raw;
  }
  String json; serializeJson(arr, json);
  return json;
}

bool postReadingsToBackend(const char *dk, const String &json) {
  if (WiFi.status() != WL_CONNECTED) return false;
  WiFiClientSecure client;
  client.setCACert(ISRG_ROOT_X1_PEM);  // Let's Encrypt zincirini dogrula
  HTTPClient http;
  String url = String("https://") + BACKEND_HOST + BACKEND_DATA_PATH;
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", dk);
  http.setTimeout(10000);
  int code = http.POST(String("{\"readings\":") + json + "}");
  http.end();
  Serial.printf("[HTTPS] %s %d\n", dk, code);
  return code == 200;
}

// ── SPIFFS Buffer ────────────────────────────────────────────────────
static size_t bufferSizeCache = 0;    // Avoids SPIFFS open just to check size
static int cachedUnsentCount = 0;     // Avoids full file scan every heartbeat

void initBuffer() {
  SPIFFS.begin(true);
  // Read initial buffer size + unsent count once at boot (only full scan)
  File f = SPIFFS.open(BUFFER_FILE, FILE_READ);
  if (f) {
    bufferSizeCache = f.size();
    // Count unsent records for cache initialization
    BufferRecordV2 rec;
    while (f.available() >= 12) {
      uint32_t magic; f.read((uint8_t *)&magic, 4);
      if (magic != BUFFER_MAGIC_V2) break;
      f.read(rec.mac, 6);
      f.read(&rec.count, 1);
      if (rec.count > MAX_READINGS || rec.count == 0) break;
      uint8_t sent; f.read(&sent, 1);
      f.seek(f.position() + rec.count * sizeof(reading_entry_t));
      if (sent == 0x00) cachedUnsentCount++;
    }
    f.close();
  }
}

bool readBufferRecordV2(File &f, BufferRecordV2 &rec) {
  if (f.available() < 12) return false;
  uint32_t magic; f.read((uint8_t *)&magic, 4);
  if (magic != BUFFER_MAGIC_V2) return false;
  f.read(rec.mac, 6);
  f.read(&rec.count, 1);
  if (rec.count > MAX_READINGS || rec.count == 0) {
    Serial.println("[BUF] Corrupt record, compaction needed");
    return false;
  }
  rec.flag_pos = f.position(); // position of sent_flag byte
  return true;
}

void bufferWriteCompact(const uint8_t *mac, const reading_entry_t *readings, uint8_t count) {
  // Check cached size — no SPIFFS open needed
  if (bufferSizeCache > BUFFER_MAX_SIZE) { Serial.println("[BUF] Buffer full, dropping"); return; }

  File f = SPIFFS.open(BUFFER_FILE, FILE_APPEND);
  if (!f) return;
  uint32_t magic = BUFFER_MAGIC_V2;
  uint8_t flag = 0x00;
  f.write((uint8_t *)&magic, 4);
  f.write(mac, 6);
  f.write(&count, 1);
  f.write(&flag, 1); // sent_flag
  f.write((uint8_t *)readings, count * sizeof(reading_entry_t));
  f.close();
  size_t recordSize = 12 + count * sizeof(reading_entry_t);
  bufferSizeCache += recordSize;
  cachedUnsentCount++;
  Serial.printf("[BUF] Buffered %d readings compact (%d bytes)\n", count, recordSize);
}

void bufferFlush() {
  if (!SPIFFS.exists(BUFFER_FILE)) return;
  File src = SPIFFS.open(BUFFER_FILE, FILE_READ);
  if (!src) return;
  File dst = SPIFFS.open("/buf_tmp.dat", FILE_WRITE);
  if (!dst) { src.close(); return; }
  int flushed = 0, kept = 0;
  size_t keptBytes = 0;
  BufferRecordV2 rec;
  while (readBufferRecordV2(src, rec)) {
    uint8_t sent; src.read(&sent, 1);
    reading_entry_t readings[MAX_READINGS];
    src.read((uint8_t *)readings, rec.count * sizeof(reading_entry_t));
    if (sent == 0x00) {
      int idx = findNodeByMac(rec.mac);
      bool posted = false;
      if (idx >= 0) {
        String json = buildReadingsJson(readings, rec.count);
        posted = postReadingsToBackend(paired_nodes[idx].device_key, json);
      }
      if (posted) {
        flushed++;
      } else {
        uint32_t magic = BUFFER_MAGIC_V2;
        uint8_t flag = 0x00;
        dst.write((uint8_t *)&magic, 4); dst.write(rec.mac, 6);
        dst.write(&rec.count, 1); dst.write(&flag, 1);
        dst.write((uint8_t *)readings, rec.count * sizeof(reading_entry_t));
        kept++;
        keptBytes += 12 + rec.count * sizeof(reading_entry_t);
      }
    }
  }
  src.close(); dst.close();
  SPIFFS.remove(BUFFER_FILE);
  SPIFFS.rename("/buf_tmp.dat", BUFFER_FILE);
  cachedUnsentCount = kept;
  bufferSizeCache = keptBytes;
  if (flushed > 0 || kept > 0) Serial.printf("[BUF] Flushed %d, kept %d\n", flushed, kept);
}


int bufferGetUnsentCount() {
  return cachedUnsentCount;  // Updated by bufferWriteCompact/bufferFlush — no SPIFFS scan
}

// ── ESP-NOW ──────────────────────────────────────────────────────────
void onEspNowRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  if (len <= 0 || len > 250) return;
  EspNowMessage msg;
  memcpy(msg.mac, info->src_addr, 6);
  memcpy(msg.data, data, len);
  msg.data_len = len;
  BaseType_t w = pdFALSE;
  xQueueSendFromISR(espNowQueue, &msg, &w);
  if (w) portYIELD_FROM_ISR();
}

void onEspNowSend(const wifi_tx_info_t *, esp_now_send_status_t) {}

bool espnowSend(const uint8_t *peer, const uint8_t *data, size_t len) {
  if (!esp_now_is_peer_exist(peer)) {
    esp_now_peer_info_t p = {}; memcpy(p.peer_addr, peer, 6); p.encrypt = false;
    esp_now_add_peer(&p);
  }
  return esp_now_send(peer, data, len) == ESP_OK;
}

// ── Config Helpers ───────────────────────────────────────────────────
void fillConfigFromJson(JsonObject &cfg, pair_complete_packet_t &c) {
  c.sleep_interval_sec = cfg["sleep_interval_sec"] | 300;
  c.min_buffer_cycles  = cfg["min_buffer_cycles"] | 2;
  c.max_buffer_cycles  = cfg["max_buffer_cycles"] | 6;
  c.temp_threshold     = (uint16_t)(cfg["temp_threshold"].as<float>() * 100);
  c.hum_threshold      = (uint16_t)(cfg["hum_threshold"].as<float>() * 100);
  c.soil_threshold     = (uint16_t)(cfg["soil_threshold"].as<float>());
  if (c.temp_threshold == 0) c.temp_threshold = 100;
  if (c.hum_threshold == 0) c.hum_threshold = 500;
  if (c.soil_threshold == 0) c.soil_threshold = 410;
}

void fillConfigDefaults(pair_complete_packet_t &c) {
  c.sleep_interval_sec = 300; c.min_buffer_cycles = 2; c.max_buffer_cycles = 6;
  c.temp_threshold = 100; c.hum_threshold = 500; c.soil_threshold = 410;
}

void sendPairComplete(const uint8_t *mac, const char *dk, pair_complete_packet_t &tpl) {
  tpl.type = PKT_PAIR_COMPLETE;
  uuidStringToBytes(dk, tpl.device_key);
  esp_efuse_mac_get_default(tpl.gateway_mac);
  tpl.channel = (uint8_t)WiFi.channel();
  espnowSend(mac, (uint8_t *)&tpl, sizeof(tpl));
}

void exitRegistrationMode() {
  currentMode = MODE_NORMAL;
  beacon_active = false;
  selectLedForMode();

  // Stop AP if still running (e.g. timeout before PAIR_ACCEPT)
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);

  // Reconnect WiFi if needed
  if (WiFi.status() != WL_CONNECTED && strlen(wifi_ssid) > 0) {
    Serial.println("[WIFI] Reconnecting...");
    WiFi.begin(wifi_ssid, wifi_pass);
    unsigned long ws = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - ws < 15000) { delay(100); updateLED(); }
  }

  // Reinit ESP-NOW on WiFi channel
  esp_now_deinit();
  esp_now_init();
  esp_now_register_recv_cb(onEspNowRecv);
  esp_now_register_send_cb(onEspNowSend);
  esp_now_peer_info_t bcast = {};
  memset(bcast.peer_addr, 0xFF, 6); bcast.encrypt = false;
  esp_now_add_peer(&bcast);
  loadNodeRegistry();

  // Let loop() reconnect Socket.IO cleanly (no double begin())
  socketIO_initialized = false;
  socketIO_connected = false;
  socketIO_authed = false;

  Serial.printf("[REG] Normal mode (ch=%d)\n", WiFi.channel());
}

// ── ESP-NOW Packet Handlers ─────────────────────────────────────────
void handleSensorData(const uint8_t *mac, const uint8_t *data, int len) {
  packets_received++;
  int idx = findNodeByMac(mac);
  if (idx < 0) {
    char m[18]; macToStr(mac, m);
    Serial.printf("[SEC] Data from unknown MAC %s, dropped\n", m);
    return;
  }

  sensor_data_packet_t *pkt = (sensor_data_packet_t *)data;

  // Validate reading_count — corrupt/malicious packets could have 255
  if (pkt->reading_count > MAX_READINGS) {
    Serial.printf("[SEC] Invalid reading_count=%d, dropped\n", pkt->reading_count);
    return;
  }

  uint8_t count = pkt->reading_count;
  size_t payload_size = 6 + count * sizeof(reading_entry_t); // type(1)+counter(4)+count(1)+readings

  // Verify HMAC-SHA256 (4-byte truncated)
  if (len < (int)(payload_size + 4)) {
    Serial.println("[SEC] Packet too short for HMAC, dropped");
    return;
  }
  if (!verify_hmac_4(paired_nodes[idx].encryption_key, data, payload_size, data + payload_size)) {
    Serial.println("[SEC] HMAC verification FAILED, dropping packet!");
    return;
  }

  // Dedup: reject exact same counter (retry of identical packet)
  // HMAC is the real security gate — counter sync issues must never block valid data
  if (pkt->counter == paired_nodes[idx].last_counter) {
    Serial.printf("[SEC] Duplicate ctr=%lu, dropped\n", (unsigned long)pkt->counter);
    packets_rejected++;
    return;
  }
  if (pkt->counter < paired_nodes[idx].last_counter) {
    Serial.printf("[SEC] Counter jump: %lu < last %lu (reboot?), accepted\n",
      (unsigned long)pkt->counter, (unsigned long)paired_nodes[idx].last_counter);
  }
  paired_nodes[idx].last_counter = pkt->counter;
  packets_accepted++;

  // Persist counter to NVS every 10 packets to survive reboots
  if (pkt->counter % 10 == 0) {
    Preferences p; p.begin("gw_nodes", false);
    char key[8]; sprintf(key, "n%d", idx);
    String json = p.getString(key, "");
    if (json.length() > 0) {
      JsonDocument doc;
      if (deserializeJson(doc, json) == DeserializationError::Ok) {
        doc["lc"] = pkt->counter;
        String updated; serializeJson(doc, updated);
        p.putString(key, updated);
      }
    }
    p.end();
  }

  // Signed ACK — append HMAC so sensor can verify
  data_ack_packet_t ack = { PKT_DATA_ACK, pkt->reading_count };
  uint8_t ack_buf[8]; // 2 + 4 HMAC
  memcpy(ack_buf, &ack, sizeof(ack));
  compute_hmac_4(paired_nodes[idx].encryption_key, ack_buf, sizeof(ack), ack_buf + sizeof(ack));
  espnowSend(mac, ack_buf, sizeof(ack) + 4);

  // Send pending config if queued (signed) — delay so sensor can process ACK first
  if (paired_nodes[idx].has_pending_config) {
    delay(50);
    size_t cfg_size = sizeof(config_update_packet_t);
    uint8_t cfg_buf[20]; // 11 + 4 HMAC
    memcpy(cfg_buf, &paired_nodes[idx].pending_config, cfg_size);
    compute_hmac_4(paired_nodes[idx].encryption_key, cfg_buf, cfg_size, cfg_buf + cfg_size);
    espnowSend(mac, cfg_buf, cfg_size + 4);
  }

  // Queue for deferred HTTP POST — don't block the ACK pipeline
  const char *dk = paired_nodes[idx].device_key;
  if (count == 0) return;
  Serial.printf("[DATA] %d readings from %s (HMAC OK, ctr=%lu)\n", count, dk, (unsigned long)pkt->counter);
  if (pendingPostCount < MAX_PENDING_POSTS) {
    PendingPost &pp = pendingPosts[pendingPostCount++];
    strncpy(pp.device_key, dk, 36); pp.device_key[36] = '\0';
    memcpy(pp.mac, mac, 6);
    memcpy(pp.readings, pkt->readings, count * sizeof(reading_entry_t));
    pp.count = count;
    pp.active = true;
  } else {
    // Queue full — buffer to SPIFFS immediately
    bufferWriteCompact(mac, pkt->readings, count);
  }
}

void handleDiagnostic(const uint8_t *mac, const uint8_t *data, int len) {
  int idx = findNodeByMac(mac);
  if (idx < 0) return;

  if (len < 16) return;  // minimum: 12 header + 4 HMAC (0 entries)
  uint8_t entry_count = data[11];
  size_t payload = 12 + entry_count * 3;
  if (len < (int)(payload + 4)) return;
  if (!verify_hmac_4(paired_nodes[idx].encryption_key, data, payload, data + payload)) return;

  // Replay check (shares counter space with data packets)
  uint32_t ctr; memcpy(&ctr, data + 1, 4);
  if (ctr <= paired_nodes[idx].last_counter) return;
  paired_nodes[idx].last_counter = ctr;

  // Parse header
  uint8_t reset_reason = data[6];
  uint16_t boot_count; memcpy(&boot_count, data + 7, 2);
  uint16_t uptime_cycles; memcpy(&uptime_cycles, data + 9, 2);

  // Build JSON with enum-based failure entries
  JsonDocument doc;
  doc["reset_reason"] = reset_reason;
  doc["boot_count"] = boot_count;
  doc["uptime_cycles"] = uptime_cycles;
  JsonObject failures = doc["failures"].to<JsonObject>();
  for (uint8_t i = 0; i < entry_count; i++) {
    uint8_t type = data[12 + i * 3];
    uint16_t count; memcpy(&count, data + 12 + i * 3 + 1, 2);
    const char *name = (type < DIAG_NAME_COUNT) ? DIAG_NAMES[type] : NULL;
    if (name) failures[name] = count;
  }

  String json; serializeJson(doc, json);
  const char *dk = paired_nodes[idx].device_key;

  WiFiClientSecure client;
  client.setCACert(ISRG_ROOT_X1_PEM);
  HTTPClient http;
  String url = String("https://") + BACKEND_HOST + "/api/sensors/device/diagnostic";
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", dk);
  http.setTimeout(10000);
  int code = http.POST(json);
  http.end();
  Serial.printf("[DIAG] %s rst=%d boots=%d entries=%d -> HTTP %d\n", dk, reset_reason, boot_count, entry_count, code);
}

void handlePairAccept(const uint8_t *mac, const uint8_t *data, int len) {
  if (pending_node_discovered) return; // already processing a discovery
  char macBuf[18]; macToStr(mac, macBuf);
  beacon_active = false; // stop broadcasting

  // Save discovered sensor info
  memcpy(last_discovered_mac, mac, 6);
  if (last_discovered_caps == 0) last_discovered_caps = SENSOR_CAP_SHT31 | SENSOR_CAP_SOIL;

  // Transition: AP_STA ch1 → STA WiFi channel
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  esp_now_deinit();
  WiFi.begin(wifi_ssid, wifi_pass);
  unsigned long ws = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - ws < 15000) {
    delay(100); updateLED();
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[REG] WiFi reconnect failed after PAIR_ACCEPT");
    exitRegistrationMode();
    return;
  }

  Serial.printf("[REG] PAIR_ACCEPT from %s, WiFi ch=%d\n", macBuf, WiFi.channel());

  int idx = findNodeByMac(mac);
  if (idx >= 0) {
    // Re-pair: reinit ESP-NOW to send PAIR_COMPLETE, then exit
    esp_now_init();
    esp_now_register_recv_cb(onEspNowRecv);
    esp_now_register_send_cb(onEspNowSend);
    esp_now_peer_info_t bcast = {};
    memset(bcast.peer_addr, 0xFF, 6); bcast.encrypt = false;
    esp_now_add_peer(&bcast);
    pair_complete_packet_t c; fillConfigDefaults(c);
    memcpy(c.encryption_key, paired_nodes[idx].encryption_key, 16);
    sendPairComplete(mac, paired_nodes[idx].device_key, c);
    Serial.printf("[REG] Re-pair PAIR_COMPLETE to %s\n", macBuf);
    exitRegistrationMode();
    return;
  }

  // New node: exitRegistrationMode handles ESP-NOW reinit (ONE time only)
  pending_node_discovered = true;
  Serial.printf("[REG] Pending discovery for %s, waiting for Socket.IO\n", macBuf);
  exitRegistrationMode();
}

void handleConfigAck(const uint8_t *mac, const uint8_t *data, int len) {
  int idx = findNodeByMac(mac);
  if (idx >= 0) { paired_nodes[idx].has_pending_config = false; Serial.printf("[CFG] ACK from node %d\n", idx); }
}

void flushPendingPosts() {
  for (int i = 0; i < pendingPostCount; i++) {
    PendingPost &pp = pendingPosts[i];
    if (!pp.active) continue;
    String json = buildReadingsJson(pp.readings, pp.count);
    if (!postReadingsToBackend(pp.device_key, json)) {
      bufferWriteCompact(pp.mac, pp.readings, pp.count);
    }
    pp.active = false;
  }
  pendingPostCount = 0;
}

void processEspNowQueue() {
  EspNowMessage msg;
  while (xQueueReceive(espNowQueue, &msg, 0) == pdTRUE) {
    if (msg.data_len < 1) continue;
    switch (msg.data[0]) {
      case PKT_SENSOR_DATA: handleSensorData(msg.mac, msg.data, msg.data_len); break;
      case PKT_DIAGNOSTIC:  handleDiagnostic(msg.mac, msg.data, msg.data_len); break;
      case PKT_PAIR_ACCEPT: handlePairAccept(msg.mac, msg.data, msg.data_len); break;
      case PKT_CONFIG_ACK:  handleConfigAck(msg.mac, msg.data, msg.data_len); break;
      default: break;
    }
  }
  // All ACKs sent — now do the slow HTTP POSTs without blocking the pipeline
  if (pendingPostCount > 0) flushPendingPosts();
}

// ── OTA Update ───────────────────────────────────────────────────────
void handleOtaUpdate(const char *url, const char *version) {
  Serial.printf("[OTA] Downloading v%s from %s\n", version ? version : "?", url);

  WiFiClientSecure client;
  client.setCACert(ISRG_ROOT_X1_PEM);
  HTTPClient http;
  // HTTPS URL ise secure client kullan, HTTP ise dogrudan
  if (String(url).startsWith("https://")) {
    http.begin(client, url);
  } else {
    http.begin(url);
  }
  http.setTimeout(30000);
  int httpCode = http.GET();

  if (httpCode != 200) {
    Serial.printf("[OTA] Download failed: HTTP %d\n", httpCode);
    http.end();
    return;
  }

  int contentLength = http.getSize();
  if (contentLength <= 0) {
    Serial.println("[OTA] Invalid content length");
    http.end();
    return;
  }

  Serial.printf("[OTA] Firmware size: %d bytes\n", contentLength);

  if (!Update.begin(contentLength)) {
    Serial.printf("[OTA] Not enough space: %s\n", Update.errorString());
    http.end();
    return;
  }

  WiFiClient *stream = http.getStreamPtr();
  size_t written = Update.writeStream(*stream);
  http.end();

  if (written != (size_t)contentLength) {
    Serial.printf("[OTA] Write incomplete: %d/%d\n", written, contentLength);
    Update.abort();
    return;
  }

  if (!Update.end(true)) {
    Serial.printf("[OTA] Finalize failed: %s\n", Update.errorString());
    return;
  }

  Serial.printf("[OTA] Success! v%s written. Rebooting...\n", version ? version : "?");

  // Notify and reboot
  if (socketIO_connected) {
    JsonDocument doc; JsonArray a = doc.to<JsonArray>();
    a.add("gateway:heartbeat");
    JsonObject hb = a.add<JsonObject>();
    hb["gateway_id"] = gw_id;
    hb["fw_version"] = version;
    hb["ota_complete"] = true;
    String out; serializeJson(a, out);
    socketIO.sendEVENT(out);
  }

  delay(1000);
  ESP.restart();
}

// ── Heartbeat ────────────────────────────────────────────────────────
void sendHeartbeat() {
  if (!socketIO_connected) return;
  JsonDocument doc; JsonArray a = doc.to<JsonArray>();
  a.add("gateway:heartbeat");
  JsonObject hb = a.add<JsonObject>();
  hb["gateway_id"] = gw_id;
  hb["uptime_sec"] = (unsigned long)(millis() / 1000);
  hb["free_heap"] = ESP.getFreeHeap();
  hb["wifi_rssi"] = WiFi.RSSI();
  hb["paired_nodes"] = paired_node_count;
  hb["buffered_unsent"] = bufferGetUnsentCount();
  hb["fw_version"] = GW_FW_VERSION;
  hb["pkt_recv"] = packets_received;
  hb["pkt_ok"] = packets_accepted;
  hb["pkt_drop"] = packets_rejected;
  String out; serializeJson(a, out);
  socketIO.sendEVENT(out);
  Serial.printf("[HB] heap=%d rssi=%d nodes=%d recv=%lu ok=%lu drop=%lu\n",
    ESP.getFreeHeap(), WiFi.RSSI(), paired_node_count,
    (unsigned long)packets_received, (unsigned long)packets_accepted, (unsigned long)packets_rejected);
}

// ── Socket.IO Handlers ───────────────────────────────────────────────
void handleAuthResult(JsonObject &p) {
  const char *id = p["gateway_id"];
  if (id) {
    strncpy(gw_id, id, sizeof(gw_id) - 1);
    saveGatewayConfig();
    socketIO_authed = true;
    Serial.printf("[SIO] Auth OK, id=%s\n", gw_id);
  } else {
    Serial.printf("[SIO] Auth failed: %s\n", p["error"].as<const char *>());
  }
}

void handleEnterRegistration(JsonObject &p) {
  stored_wifi_channel = WiFi.channel();

  // Switch to AP_STA: AP pins ch1 for beacons, STA receives PAIR_ACCEPT on its MAC
  esp_now_deinit();
  WiFi.disconnect(true);
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP("", "", 1, true); // hidden AP, ch1
  delay(200);

  esp_now_init();
  esp_now_register_recv_cb(onEspNowRecv);
  esp_now_register_send_cb(onEspNowSend);
  esp_now_peer_info_t bcast = {};
  memset(bcast.peer_addr, 0xFF, 6);
  bcast.ifidx = WIFI_IF_AP;
  bcast.encrypt = false;
  esp_now_add_peer(&bcast);

  socketIO_initialized = false;
  socketIO_connected = false;
  socketIO_authed = false;
  beacon_active = true;

  registrationStart = millis();
  registrationTimeout = (unsigned long)(p["timeout_sec"] | 30) * 1000;
  currentMode = MODE_REGISTRATION;
  selectLedForMode();
  Serial.printf("[REG] Registration on ch1, timeout=%lus, wifi_ch=%d\n",
    registrationTimeout / 1000, stored_wifi_channel);
}

void handlePairApproved(JsonObject &p) {
  const char *macStr = p["mac"], *dk = p["device_key"];
  if (!macStr || !dk) return;
  uint8_t mac[6];
  if (!stringToMac(macStr, mac)) return;

  // Generate per-node encryption key for HMAC signing
  uint8_t ek[16];
  esp_fill_random(ek, 16);

  saveNode(mac, dk, ek);
  pair_complete_packet_t c;
  memcpy(c.encryption_key, ek, 16);
  JsonObject cfg = p["config"];
  fillConfigFromJson(cfg, c);
  sendPairComplete(mac, dk, c);
  Serial.printf("[SIO] Approved %s -> %s\n", macStr, dk);

  if (socketIO_connected) {
    JsonDocument evt; JsonArray a = evt.to<JsonArray>();
    a.add("gateway:pair_complete");
    JsonObject o = a.add<JsonObject>(); o["mac"] = macStr; o["device_key"] = dk; o["success"] = true;
    String out; serializeJson(a, out);
    socketIO.sendEVENT(out);
  }

  // Success blink
  for (int i = 0; i < 6; i++) {
    digitalWrite(LED_PIN, HIGH); delay(250);
    digitalWrite(LED_PIN, LOW); delay(250);
  }
  // NOTE: exitRegistrationMode already called by handlePairAccept — do NOT call again
  // (double deinit+reinit of ESP-NOW corrupts radio state)
}

void handlePushConfig(JsonObject &p) {
  const char *dk = p["device_key"];
  if (!dk) return;
  int idx = findNodeByKey(dk);
  if (idx < 0) return;

  config_update_packet_t cfg;
  cfg.type = PKT_CONFIG_UPDATE;
  // Reuse fillConfigFromJson via a temp pair_complete_packet_t
  pair_complete_packet_t tmp;
  JsonObject cfgObj = p["config"];
  fillConfigFromJson(cfgObj, tmp);
  cfg.sleep_interval_sec = tmp.sleep_interval_sec;
  cfg.min_buffer_cycles = tmp.min_buffer_cycles;
  cfg.max_buffer_cycles = tmp.max_buffer_cycles;
  cfg.temp_threshold = tmp.temp_threshold;
  cfg.hum_threshold = tmp.hum_threshold;
  cfg.soil_threshold = tmp.soil_threshold;

  paired_nodes[idx].pending_config = cfg;
  paired_nodes[idx].has_pending_config = true;
  Serial.printf("[SIO] Config queued for %s\n", dk);
}

void handlePairRejected(JsonObject &payload) {
  const char *macStr = payload["mac"];
  Serial.printf("[SIO] Pair rejected: %s\n", macStr ? macStr : "?");

  // Determine target MAC
  uint8_t target[6];
  bool hasTarget = false;
  if (macStr && stringToMac(macStr, target)) {
    hasTarget = true;
  } else if (memcmp(last_discovered_mac, "\0\0\0\0\0\0", 6) != 0) {
    memcpy(target, last_discovered_mac, 6);
    hasTarget = true;
  }

  if (hasTarget) {
    // Register sensor MAC as peer (send fails otherwise)
    if (!esp_now_is_peer_exist(target)) {
      esp_now_peer_info_t p = {};
      memcpy(p.peer_addr, target, 6);
      p.encrypt = false;
      esp_now_add_peer(&p);
    }
    uint8_t pkt = PKT_PAIR_REJECTED;
    espnowSend(target, &pkt, 1);
    esp_now_del_peer(target); // cleanup
    Serial.println("[REG] Sent PKT_PAIR_REJECTED");
  }
  // NOTE: exitRegistrationMode already called by handlePairAccept — do NOT call again
}

void socketIOEventHandler(socketIOmessageType_t type, uint8_t *payload, size_t length) {
  switch (type) {
    case sIOtype_CONNECT: {
      socketIO_connected = true;
      Serial.println("[SIO] Connected");
      JsonDocument doc; JsonArray a = doc.to<JsonArray>();
      a.add("gateway:auth");
      JsonObject auth = a.add<JsonObject>(); auth["api_key"] = gw_api_key;
      if (strlen(gw_id) > 0) auth["gateway_id"] = gw_id;
      String out; serializeJson(a, out);
      socketIO.sendEVENT(out);
      Serial.println("[SIO] Sent gateway:auth");
      break;
    }
    case sIOtype_EVENT: {
      JsonDocument doc;
      if (deserializeJson(doc, payload, length)) break;
      JsonArray a = doc.as<JsonArray>();
      if (a.size() < 2) break;
      const char *event = a[0]; JsonObject data = a[1];
      if (!event) break;
      if      (strcmp(event, "gateway:auth_result") == 0)        handleAuthResult(data);
      else if (strcmp(event, "gateway:enter_registration") == 0) handleEnterRegistration(data);
      else if (strcmp(event, "gateway:exit_registration") == 0)  { memset(last_discovered_mac, 0, 6); exitRegistrationMode(); }
      else if (strcmp(event, "gateway:pair_approved") == 0)      handlePairApproved(data);
      else if (strcmp(event, "gateway:pair_rejected") == 0)      handlePairRejected(data);
      else if (strcmp(event, "gateway:push_config") == 0)        handlePushConfig(data);
      else if (strcmp(event, "gateway:ota_update") == 0) {
        const char *url = data["url"]; const char *ver = data["version"];
        if (url) handleOtaUpdate(url, ver);
      }
      break;
    }
    case sIOtype_DISCONNECT:
      socketIO_connected = false;
      socketIO_initialized = false;
      socketIO_authed = false;
      Serial.println("[SIO] Disconnected");
      break;
    default: break;
  }
}

// ── BLE Provisioning ─────────────────────────────────────────────────
static String ble_ssid, ble_pass, ble_key;
static volatile bool ble_config_ready = false;
static volatile bool ble_client_disconnected = false;
static NimBLECharacteristic *bleStatusChar = nullptr;

class BLEProvServerCallbacks : public NimBLEServerCallbacks {
  void onDisconnect(NimBLEServer *s, NimBLEConnInfo &connInfo, int reason) {
    // Mobile app disconnects after receiving status=0x02
    if (ble_config_ready) {
      ble_client_disconnected = true;
      Serial.println("[BLE] Client disconnected after provisioning");
    }
  }
};

// Calling indicate() from onWrite callback doesn't work in NimBLE
// Just set a flag, process in main loop
static volatile bool ble_all_received = false;
static volatile bool ble_key_invalid = false;

void bleCheckComplete() {
  if (ble_ssid.length() > 0 && ble_pass.length() > 0 && ble_key.length() > 0) {
    if (!isValidUUID(ble_key.c_str())) {
      ble_key_invalid = true;
      ble_key = "";
      return;
    }
    ble_all_received = true;
  }
}

class BLEProvCallbacks : public NimBLECharacteristicCallbacks {
  String *target;
  const char *label;
public:
  BLEProvCallbacks(String *t, const char *l) : target(t), label(l) {}
  void onWrite(NimBLECharacteristic *c, NimBLEConnInfo &connInfo) {
    *target = c->getValue().c_str();
    target->trim();
    Serial.printf("[BLE] Received %s: %s\n", label, label[0] == 'P' ? "****" : target->c_str());
    bleCheckComplete();
  }
};

void bleTestAndSave() {
  ble_all_received = false;

  uint8_t saving = 0x01;
  bleStatusChar->setValue(&saving, 1);
  bleStatusChar->indicate();
  Serial.printf("[BLE] Testing WiFi '%s'...\n", ble_ssid.c_str());

  // BLE stays connected — test WiFi connection
  WiFi.mode(WIFI_STA);
  WiFi.begin(ble_ssid.c_str(), ble_pass.c_str());

  unsigned long wifiStart = millis();
  bool wifiOk = false;
  while (millis() - wifiStart < 15000) {
    if (WiFi.status() == WL_CONNECTED) { wifiOk = true; break; }
    delay(100);
    updateLED();
  }
  if (!wifiOk) {
    WiFi.disconnect(true);
    WiFi.mode(WIFI_STA);
    Serial.println("[BLE] WiFi connection failed!");
    uint8_t err = 0xFE; // WiFi error (distinct from 0xFF=invalid key)
    bleStatusChar->setValue(&err, 1);
    bleStatusChar->indicate();
    // Reset for retry — user can re-enter credentials
    ble_ssid = ""; ble_pass = ""; ble_key = "";
    return;
  }

  // Backend health check
  Serial.println("[BLE] WiFi OK! Testing backend...");
  WiFiClientSecure healthClient;
  healthClient.setCACert(ISRG_ROOT_X1_PEM);
  HTTPClient http;
  String healthUrl = String("https://") + BACKEND_HOST + "/api/health";
  http.begin(healthClient, healthUrl); http.setTimeout(10000);
  int healthCode = http.GET();
  http.end();

  if (healthCode != 200) {
    Serial.printf("[BLE] Backend unreachable (HTTP %d)\n", healthCode);
    uint8_t err = 0xFD;
    bleStatusChar->setValue(&err, 1);
    bleStatusChar->indicate();
    WiFi.disconnect(true); WiFi.mode(WIFI_STA);
    ble_ssid = ""; ble_pass = ""; ble_key = "";
    return;
  }

  Serial.println("[BLE] Backend OK! Saving config...");
  strncpy(wifi_ssid, ble_ssid.c_str(), sizeof(wifi_ssid) - 1);
  strncpy(wifi_pass, ble_pass.c_str(), sizeof(wifi_pass) - 1);
  strncpy(gw_api_key, ble_key.c_str(), sizeof(gw_api_key) - 1);
  saveGatewayConfig();

  Serial.printf("[BLE] Config saved: SSID=%s Key=%s\n", wifi_ssid, gw_api_key);
  uint8_t done = 0x02;
  bleStatusChar->setValue(&done, 1);
  bleStatusChar->indicate();
  Serial.println("[BLE] Indication sent (0x02 done)");
  ble_config_ready = true;
}

void bleSerialFallback() {
  BLEDevice::deinit(true);
  // Minimal serial provisioning
  Serial.println("\n--- Serial Provisioning ---");
  auto readLine = [](const char *prompt, bool hide) -> String {
    Serial.print(prompt);
    String in = "";
    while (true) {
      if (Serial.available()) {
        char c = Serial.read();
        if (c == '\n' || c == '\r') { if (in.length() > 0) { Serial.println(); return in; } }
        else { in += c; Serial.print(hide ? '*' : c); }
      }
      delay(10);
    }
  };
  String s = readLine("WiFi SSID: ", false); s.trim();
  String p = readLine("WiFi Pass: ", true); p.trim();
  String k;
  do { k = readLine("API Key: ", false); k.trim(); } while (!isValidUUID(k.c_str()));
  strncpy(wifi_ssid, s.c_str(), sizeof(wifi_ssid) - 1);
  strncpy(wifi_pass, p.c_str(), sizeof(wifi_pass) - 1);
  strncpy(gw_api_key, k.c_str(), sizeof(gw_api_key) - 1);
  saveGatewayConfig();
  Serial.println("Saved! Rebooting...");
  delay(1000); ESP.restart();
}

void runBLEProvisioning() {
  // Build device name from MAC
  uint8_t mac[6]; esp_efuse_mac_get_default(mac);
  char bleName[16]; sprintf(bleName, "TARAS-GW-%02X%02X", mac[4], mac[5]);

  Serial.printf("[BLE] Advertising as '%s' — connect via app or nRF Connect\n", bleName);
  Serial.println("[BLE] Write WiFi SSID, Password, and API Key to pair");
  Serial.println("[BLE] Or type 'SERIAL' in Serial Monitor for serial fallback");

  // Enable BLE encryption — "Just Works" with Secure Connections (ECDH)
  // Encrypts the link so WiFi password and API key can't be sniffed
  BLEDevice::setSecurityAuth(true, false, true); // bonding=true, MITM=false, SC=true
  BLEDevice::setSecurityIOCap(BLE_HS_IO_NO_INPUT_OUTPUT); // Just Works (no display/keyboard)

  BLEDevice::init(bleName);
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new BLEProvServerCallbacks());
  BLEService *svc = server->createService(BLE_SERVICE_UUID);

  // WRITE + WRITE_ENC: advertises write property AND requires encrypted link
  auto *ssidChar = svc->createCharacteristic(BLE_CHAR_SSID_UUID, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_ENC);
  auto *passChar = svc->createCharacteristic(BLE_CHAR_PASS_UUID, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_ENC);
  auto *keyChar  = svc->createCharacteristic(BLE_CHAR_KEY_UUID,  NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_ENC);
  bleStatusChar  = svc->createCharacteristic(BLE_CHAR_STAT_UUID,
    NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::READ_ENC | NIMBLE_PROPERTY::INDICATE);
  ssidChar->setCallbacks(new BLEProvCallbacks(&ble_ssid, "SSID"));
  passChar->setCallbacks(new BLEProvCallbacks(&ble_pass, "Password"));
  keyChar->setCallbacks(new BLEProvCallbacks(&ble_key, "API Key"));

  uint8_t waiting = 0x00;
  bleStatusChar->setValue(&waiting, 1);

  svc->start();
  BLEAdvertising *adv = BLEDevice::getAdvertising();
  adv->setName(bleName);
  adv->addServiceUUID(BLE_SERVICE_UUID);
  adv->enableScanResponse(true);
  adv->start();

  // Wait for BLE config or serial fallback
  unsigned long bleStart = millis();
  while (!ble_config_ready) {
    if (millis() - bleStart > 300000) { // 5 min timeout
      Serial.println("[BLE] Provisioning timeout, restarting...");
      BLEDevice::deinit(true);
      ESP.restart();
    }
    updateLED();

    // Invalid key flag — indicate error from main loop
    if (ble_key_invalid) {
      ble_key_invalid = false;
      uint8_t err = 0xFF;
      bleStatusChar->setValue(&err, 1);
      bleStatusChar->indicate();
      Serial.println("[BLE] Invalid API key format");
    }

    // All received — test WiFi before saving
    if (ble_all_received) {
      bleTestAndSave();
      continue;
    }

    // Serial fallback: type "SERIAL" to switch
    if (Serial.available()) {
      String cmd = Serial.readStringUntil('\n');
      cmd.trim(); cmd.toUpperCase();
      if (cmd == "SERIAL") {
        bleSerialFallback();
      }
    }
    delay(50);
  }

  // Config saved — wait for mobile app to disconnect
  Serial.println("[BLE] Waiting for app to disconnect...");
  unsigned long waitStart = millis();
  while (!ble_client_disconnected && millis() - waitStart < 10000) {
    updateLED();
    delay(50);
  }

  BLEDevice::deinit(true);
  digitalWrite(LED_PIN, HIGH);
  delay(1000);
  Serial.println("[BLE] Rebooting...");
  ESP.restart();
}

// ── Setup & Loop ─────────────────────────────────────────────────────
void setup() {
  setCpuFrequencyMhz(80);  // 80MHz sufficient — ESP-NOW is interrupt-driven, HTTP is WiFi-bound

  Serial.begin(115200);
  delay(1000);
  Serial.println("\n[BOOT] TARAS Gateway starting (80MHz)...");

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // Pull down all unused GPIOs — prevent floating state current leakage and short circuit risk
  // Skip: GPIO 0,5 (boot strapping), GPIO 2 (LED), GPIO 1,3 (UART), GPIO 6-11 (internal flash SPI)
  const uint8_t pulldown_pins[] = {4, 12, 13, 14, 15, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33};
  for (uint8_t pin : pulldown_pins) pinMode(pin, INPUT_PULLDOWN);
  // Input-only pins (GPIOs 34-39 have no internal pull resistor on ESP32)
  const uint8_t input_only_pins[] = {34, 35, 36, 39};
  for (uint8_t pin : input_only_pins) gpio_set_direction((gpio_num_t)pin, GPIO_MODE_INPUT);

  currentMode = MODE_INIT;
  selectLedForMode();

  initBuffer();
  loadGatewayConfig();

  // BLE provisioning if not configured
  if (strlen(gw_api_key) == 0 || strlen(wifi_ssid) == 0) {
    runBLEProvisioning(); // Never returns (reboots)
  }

  // WiFi (30s timeout, continue without if fails)
  WiFi.mode(WIFI_STA);
  WiFi.begin(wifi_ssid, wifi_pass);
  Serial.printf("[WIFI] Connecting to %s", wifi_ssid);
  unsigned long ws = millis();
  bool wifiOk = false;
  while (millis() - ws < 30000) {
    if (WiFi.status() == WL_CONNECTED) { wifiOk = true; break; }
    updateLED(); delay(100); Serial.print(".");
  }

  // ESP-NOW always starts (works with or without WiFi)
  espNowQueue = xQueueCreate(ESPNOW_QUEUE_SIZE, sizeof(EspNowMessage));
  if (!espNowQueue) ESP.restart();
  if (esp_now_init() != ESP_OK) ESP.restart();
  esp_now_register_recv_cb(onEspNowRecv);
  esp_now_register_send_cb(onEspNowSend);
  esp_now_peer_info_t bcast = {};
  memset(bcast.peer_addr, 0xFF, 6); bcast.encrypt = false;
  esp_now_add_peer(&bcast);

  loadNodeRegistry();

  if (wifiOk) {
    Serial.printf("\n[WIFI] Connected IP=%s CH=%d RSSI=%d\n",
      WiFi.localIP().toString().c_str(), WiFi.channel(), WiFi.RSSI());
    esp_wifi_set_ps(WIFI_PS_NONE);  // No power save — Socket.IO needs always-on radio
    socketIO.beginSSLWithCA(BACKEND_HOST, BACKEND_PORT, SOCKETIO_PATH, ISRG_ROOT_X1_PEM);
    socketIO.onEvent(socketIOEventHandler);
    socketIO_initialized = true;
  } else {
    Serial.println("\n[WIFI] No connection — ESP-NOW only mode, data buffered to SPIFFS");
  }

  currentMode = MODE_NORMAL;
  selectLedForMode();
  lastHeartbeat = lastFlush = millis();
  Serial.printf("[BOOT] Ready. MAC=%s Nodes=%d WiFi=%s\n",
    WiFi.macAddress().c_str(), paired_node_count, wifiOk ? "OK" : "OFFLINE");
}

void loopWifiReconnect() {
  if (currentMode != MODE_REGISTRATION) {
    if (WiFi.status() != WL_CONNECTED && millis() - lastWifiCheck > 30000) {
      lastWifiCheck = millis();
      Serial.println("[WIFI] Reconnecting...");
      WiFi.disconnect(); WiFi.begin(wifi_ssid, wifi_pass);
    }
    // WiFi just reconnected — init Socket.IO if not already
    if (WiFi.status() == WL_CONNECTED && !socketIO_connected && millis() - lastWifiCheck > 5000) {
      if (!socketIO_initialized) {
        socketIO.beginSSLWithCA(BACKEND_HOST, BACKEND_PORT, SOCKETIO_PATH, ISRG_ROOT_X1_PEM);
        socketIO.onEvent(socketIOEventHandler);
        socketIO_initialized = true;
        Serial.println("[WIFI] Reconnected, starting Socket.IO (SSL)");
      }
      lastWifiCheck = millis();
    }
  }
}

void loopEmitPendingDiscovery() {
  if (pending_node_discovered && socketIO_authed) {
    pending_node_discovered = false;
    char macBuf[18]; macToStr(last_discovered_mac, macBuf);
    JsonDocument evt; JsonArray a = evt.to<JsonArray>();
    a.add("gateway:node_discovered");
    JsonObject p = a.add<JsonObject>();
    p["mac"] = macBuf;
    p["sensor_caps"] = last_discovered_caps;
    String out; serializeJson(a, out);
    socketIO.sendEVENT(out);
    Serial.printf("[REG] node_discovered emitted for %s\n", macBuf);
  }
}

void loopRegistrationBeacon() {
  static unsigned long lastBeacon = 0;
  unsigned long now = millis();
  if (beacon_active && now - lastBeacon >= 1000) {
    lastBeacon = now;
    pair_beacon_packet_t beacon;
    beacon.type = PKT_PAIR_BEACON;
    esp_efuse_mac_get_default(beacon.gateway_mac);
    beacon.wifi_channel = stored_wifi_channel;
    uint8_t bcast_addr[6] = {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF};
    esp_now_send(bcast_addr, (uint8_t *)&beacon, sizeof(beacon));
  }

  if (currentMode == MODE_REGISTRATION && now - registrationStart >= registrationTimeout) {
    Serial.println("[REG] Timeout");
    exitRegistrationMode();
  }
}

void loopSerialCommands() {
  // Serial commands: RESYNC (change WiFi) or RESET (factory reset)
  static unsigned long lastSerialCmd = 0;
  if (Serial.available() && millis() - lastSerialCmd > 5000) {
    lastSerialCmd = millis();
    String cmd = Serial.readStringUntil('\n');
    cmd.trim(); cmd.toUpperCase();
    if (cmd == "RESYNC") {
      Preferences p; p.begin("gw_config", false);
      p.putString("wifi_ssid", ""); p.putString("wifi_pass", "");
      p.end();
      Serial.println("[SYS] WiFi cleared, rebooting for BLE resync...");
      delay(1000); ESP.restart();
    } else if (cmd == "RESET") {
      Preferences p; p.begin("gw_config", false); p.clear(); p.end();
      Preferences n; n.begin("gw_nodes", false); n.clear(); n.end();
      Serial.println("[SYS] Factory reset, rebooting...");
      delay(1000); ESP.restart();
    }
  }
}

void loop() {
  if (socketIO_initialized) socketIO.loop();
  loopWifiReconnect();
  processEspNowQueue();
  loopEmitPendingDiscovery();
  unsigned long now = millis();
  if (now - lastHeartbeat >= HEARTBEAT_INTERVAL) { lastHeartbeat = now; if (socketIO_connected) sendHeartbeat(); }
  if (now - lastFlush >= FLUSH_INTERVAL && WiFi.status() == WL_CONNECTED) { lastFlush = now; bufferFlush(); }
  loopRegistrationBeacon();
  loopSerialCommands();
  // Only update LED pattern when mode actually changes (not every loop iteration)
  static GatewayMode lastLedMode = MODE_INIT;
  if (currentMode != lastLedMode) { selectLedForMode(); lastLedMode = currentMode; }
  updateLED();
}
