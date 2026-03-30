#include <stdio.h>
#include <string.h>
#include <math.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"
#include "driver/i2c_master.h"
#include "driver/gpio.h"
#include "esp_log.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_http_client.h"
#include "esp_mac.h"
#include "esp_sleep.h"
#include "nvs_flash.h"
#include "sdkconfig.h"

static const char *TAG = "aht25";

/* ---- Config ---- */
#define I2C_SDA             CONFIG_AHT25_I2C_SDA
#define I2C_SCL             CONFIG_AHT25_I2C_SCL
#define AHT25_ADDR          0x38
#define AHT25_TIMEOUT       100

#define SLEEP_TIME_US       (5 * 60 * 1000000ULL)  /* 5 minutes in microseconds */
#define MAX_CYCLES          6                        /* 6 × 5 min = 30 min max */
#define MIN_CYCLES_BEFORE_CHECK 3                    /* 3 × 5 min = 15 min before threshold check */
#define NUM_SAMPLES         10                       /* samples per cycle to average */
#define TEMP_THRESHOLD      1.0f                     /* °C change to trigger POST */
#define HUM_THRESHOLD       5.0f                     /* %RH change to trigger POST */

#define RTC_MAGIC           0xA2500001

/* ---- RTC-surviving state ---- */
typedef struct {
    float temperature;
    float humidity;
    uint32_t raw_temperature;
    uint32_t raw_humidity;
} sensor_reading_t;

typedef struct {
    uint32_t magic;
    uint8_t cycle_count;
    uint8_t _pad[3];
    float last_sent_temp;
    float last_sent_hum;
    sensor_reading_t buffer[MAX_CYCLES];
} rtc_state_t;

static RTC_DATA_ATTR rtc_state_t state;

/* ---- I2C handles ---- */
static i2c_master_bus_handle_t bus_handle;
static i2c_master_dev_handle_t dev_handle;

/* ---- WiFi ---- */
static EventGroupHandle_t wifi_event_group;
#define WIFI_CONNECTED_BIT BIT0
#define WIFI_FAIL_BIT      BIT1

static char device_mac[18];

/* ======== CRC8 ======== */
static uint8_t crc8(const uint8_t *data, int len)
{
    uint8_t crc = 0xFF;
    for (int i = 0; i < len; i++) {
        crc ^= data[i];
        for (int b = 0; b < 8; b++) {
            if (crc & 0x80) crc = (crc << 1) ^ 0x31;
            else crc <<= 1;
        }
    }
    return crc;
}

/* ======== AHT25 ======== */
static esp_err_t aht25_init(void)
{
    vTaskDelay(pdMS_TO_TICKS(40));
    uint8_t status = 0;
    esp_err_t ret = i2c_master_receive(dev_handle, &status, 1, AHT25_TIMEOUT);
    if (ret != ESP_OK) return ret;

    if (!((status >> 3) & 1)) {
        uint8_t cmd[3] = {0xB1, 0x08, 0x00};
        ret = i2c_master_transmit(dev_handle, cmd, 3, AHT25_TIMEOUT);
        if (ret != ESP_OK) return ret;
        vTaskDelay(pdMS_TO_TICKS(10));
    }
    return ESP_OK;
}

static esp_err_t aht25_read_raw(float *temperature, float *humidity,
                                 uint32_t *raw_temp, uint32_t *raw_hum)
{
    uint8_t cmd[3] = {0xAC, 0x33, 0x00};
    esp_err_t ret = i2c_master_transmit(dev_handle, cmd, 3, AHT25_TIMEOUT);
    if (ret != ESP_OK) return ret;

    vTaskDelay(pdMS_TO_TICKS(100));

    uint8_t data[7] = {0};
    ret = i2c_master_receive(dev_handle, data, 7, AHT25_TIMEOUT);
    if (ret != ESP_OK) return ret;

    if (data[0] & 0x80) {
        vTaskDelay(pdMS_TO_TICKS(80));
        ret = i2c_master_receive(dev_handle, data, 7, AHT25_TIMEOUT);
        if (ret != ESP_OK) return ret;
        if (data[0] & 0x80) return ESP_ERR_TIMEOUT;
    }

    /* CRC check */
    uint8_t calc = crc8(data, 6);
    if (calc != data[6]) {
        printf("  CRC err\n");
    }

    *raw_hum = ((uint32_t)data[1] << 12) | ((uint32_t)data[2] << 4) | ((uint32_t)data[3] >> 4);
    *raw_temp = (((uint32_t)data[3] & 0x0F) << 16) | ((uint32_t)data[4] << 8) | (uint32_t)data[5];

    *humidity = ((float)*raw_hum / 1048576.0f) * 100.0f;
    *temperature = ((float)*raw_temp / 1048576.0f) * 200.0f - 50.0f;
    return ESP_OK;
}

/* ======== WiFi ======== */
static void wifi_event_handler(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        xEventGroupSetBits(wifi_event_group, WIFI_FAIL_BIT);
    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        xEventGroupSetBits(wifi_event_group, WIFI_CONNECTED_BIT);
    }
}

static bool wifi_connect(void)
{
    wifi_event_group = xEventGroupCreate();

    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    ESP_ERROR_CHECK(esp_event_handler_instance_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL, NULL));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, NULL, NULL));

    wifi_config_t wifi_cfg = {
        .sta = {
            .ssid = CONFIG_WIFI_SSID,
            .password = CONFIG_WIFI_PASSWORD,
        },
    };
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_cfg));
    ESP_ERROR_CHECK(esp_wifi_start());

    printf("  WiFi connecting...\n");
    EventBits_t bits = xEventGroupWaitBits(wifi_event_group,
        WIFI_CONNECTED_BIT | WIFI_FAIL_BIT, pdFALSE, pdFALSE, pdMS_TO_TICKS(15000));

    if (bits & WIFI_CONNECTED_BIT) {
        printf("  WiFi OK\n");
        return true;
    }
    printf("  WiFi FAILED\n");
    return false;
}

static void wifi_disconnect(void)
{
    esp_wifi_stop();
    esp_wifi_deinit();
}

/* ======== HTTP POST ======== */
static void http_post_readings(void)
{
    /* Build JSON: {"readings":[{...},{...},...]} */
    /* device_key in header identifies the device — no MAC needed in body */
    char json[1200];
    int pos = 0;

    pos += snprintf(json + pos, sizeof(json) - pos, "{\"readings\":[");

    for (int i = 0; i < state.cycle_count; i++) {
        int minutes_ago = (state.cycle_count - 1 - i) * 5;
        sensor_reading_t *r = &state.buffer[i];

        if (i > 0) pos += snprintf(json + pos, sizeof(json) - pos, ",");
        pos += snprintf(json + pos, sizeof(json) - pos,
            "{\"minutes_ago\":%d,\"temperature\":%.2f,\"humidity\":%.2f,"
            "\"raw_temperature\":%lu,\"raw_humidity\":%lu}",
            minutes_ago, r->temperature, r->humidity,
            (unsigned long)r->raw_temperature, (unsigned long)r->raw_humidity);
    }

    pos += snprintf(json + pos, sizeof(json) - pos, "]}");

    /* POST */
    esp_http_client_config_t config = {
        .url = CONFIG_BACKEND_URL,
        .method = HTTP_METHOD_POST,
        .timeout_ms = 10000,
    };
    esp_http_client_handle_t client = esp_http_client_init(&config);
    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_header(client, "X-Device-Key", CONFIG_DEVICE_API_KEY);
    esp_http_client_set_post_field(client, json, strlen(json));

    esp_err_t err = esp_http_client_perform(client);
    if (err == ESP_OK) {
        int status = esp_http_client_get_status_code(client);
        printf("  POST OK (%d) — %d readings sent\n", status, state.cycle_count);
    } else {
        printf("  POST FAILED: %s\n", esp_err_to_name(err));
    }

    esp_http_client_cleanup(client);
}

/* ======== Deep Sleep ======== */
static void enter_deep_sleep(void)
{
    printf("  Deep sleep %llu min...\n\n", SLEEP_TIME_US / 60000000ULL);
    esp_sleep_enable_timer_wakeup(SLEEP_TIME_US);
    esp_deep_sleep_start();
}

/* ======== Main ======== */
void app_main(void)
{
    /* Turn off LED */
    gpio_set_direction(8, GPIO_MODE_OUTPUT);
    gpio_set_level(8, 0);

    /* Get MAC */
    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_WIFI_STA);
    snprintf(device_mac, sizeof(device_mac), "%02X:%02X:%02X:%02X:%02X:%02X",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);

    /* Check first boot */
    bool first_boot = (state.magic != RTC_MAGIC);
    if (first_boot) {
        memset(&state, 0, sizeof(state));
        state.magic = RTC_MAGIC;
        state.last_sent_temp = -999.0f;
        state.last_sent_hum = -999.0f;
        printf("\n  === AHT25 Deep Sleep Mode ===\n");
        printf("  MAC: %s\n", device_mac);
        printf("  POST to: %s\n", CONFIG_BACKEND_URL);
        printf("  Cycle: 5 min | Min POST: 15 min | Max: 30 min\n");
        printf("  Threshold: %.1f C / %.1f%% RH\n", TEMP_THRESHOLD, HUM_THRESHOLD);
        printf("  --------------------------------\n");
    }

    printf("  Cycle %d/%d | ", state.cycle_count + 1, MAX_CYCLES);

    /* Init I2C + AHT25 */
    i2c_master_bus_config_t bus_cfg = {
        .clk_source = I2C_CLK_SRC_DEFAULT,
        .i2c_port = I2C_NUM_0,
        .scl_io_num = I2C_SCL,
        .sda_io_num = I2C_SDA,
        .glitch_ignore_cnt = 7,
        .flags.enable_internal_pullup = true,
    };
    ESP_ERROR_CHECK(i2c_new_master_bus(&bus_cfg, &bus_handle));

    i2c_device_config_t dev_cfg = {
        .dev_addr_length = I2C_ADDR_BIT_LEN_7,
        .device_address = AHT25_ADDR,
        .scl_speed_hz = 100000,
    };
    ESP_ERROR_CHECK(i2c_master_bus_add_device(bus_handle, &dev_cfg, &dev_handle));

    if (aht25_init() != ESP_OK) {
        printf("AHT25 init failed!\n");
        enter_deep_sleep();
        return;
    }

    /* Take NUM_SAMPLES readings and average */
    float sum_temp = 0, sum_hum = 0;
    uint64_t sum_raw_temp = 0, sum_raw_hum = 0;
    int good_samples = 0;

    for (int i = 0; i < NUM_SAMPLES; i++) {
        float t, h;
        uint32_t rt, rh;
        if (aht25_read_raw(&t, &h, &rt, &rh) == ESP_OK) {
            sum_temp += t;
            sum_hum += h;
            sum_raw_temp += rt;
            sum_raw_hum += rh;
            good_samples++;
        }
        if (i < NUM_SAMPLES - 1) {
            vTaskDelay(pdMS_TO_TICKS(200));
        }
    }

    if (good_samples == 0) {
        printf("All samples failed!\n");
        enter_deep_sleep();
        return;
    }

    /* Store averaged reading */
    sensor_reading_t *reading = &state.buffer[state.cycle_count];
    reading->temperature = sum_temp / good_samples;
    reading->humidity = sum_hum / good_samples;
    reading->raw_temperature = (uint32_t)(sum_raw_temp / good_samples);
    reading->raw_humidity = (uint32_t)(sum_raw_hum / good_samples);
    state.cycle_count++;

    printf("T=%.2f C  RH=%.2f%% (%d samples)\n",
           reading->temperature, reading->humidity, good_samples);

    /* Determine if we should POST */
    bool should_post = false;

    if (state.cycle_count >= MAX_CYCLES) {
        /* 30 min max — mandatory POST */
        printf("  -> 30 min reached, must POST\n");
        should_post = true;
    } else if (state.cycle_count >= MIN_CYCLES_BEFORE_CHECK) {
        /* After 15 min — check threshold */
        float dt = fabsf(reading->temperature - state.last_sent_temp);
        float dh = fabsf(reading->humidity - state.last_sent_hum);

        if (state.last_sent_temp < -900.0f) {
            /* First ever POST */
            printf("  -> First reading batch, POST\n");
            should_post = true;
        } else if (dt > TEMP_THRESHOLD || dh > HUM_THRESHOLD) {
            printf("  -> Threshold exceeded (dT=%.2f dH=%.2f), POST\n", dt, dh);
            should_post = true;
        } else {
            printf("  -> No significant change (dT=%.2f dH=%.2f), buffering\n", dt, dh);
        }
    } else {
        printf("  -> Buffering (%d/%d min before check)\n",
               state.cycle_count * 5, MIN_CYCLES_BEFORE_CHECK * 5);
    }

    /* POST if needed */
    if (should_post) {
        /* Init NVS (required for WiFi) */
        esp_err_t ret = nvs_flash_init();
        if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
            ESP_ERROR_CHECK(nvs_flash_erase());
            ret = nvs_flash_init();
        }
        ESP_ERROR_CHECK(ret);

        if (wifi_connect()) {
            http_post_readings();
            wifi_disconnect();
        }

        /* Update last sent values and reset buffer */
        state.last_sent_temp = reading->temperature;
        state.last_sent_hum = reading->humidity;
        state.cycle_count = 0;
    }

    /* Clean up I2C before sleep */
    i2c_master_bus_rm_device(dev_handle);
    i2c_del_master_bus(bus_handle);

    /* Deep sleep */
    enter_deep_sleep();
}
