/*
 * Simplified SHT31 monitor example for ESP32-C6 (ESP-IDF)
 * - Uses I2C on GPIO8 (SCL) and GPIO9 (SDA)
 * - Reads temperature and humidity periodically and logs values
 * - Includes CRC check for data integrity and simple retry logic
 */

#include <stdio.h>
#include <string.h>
#include <stdbool.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "driver/i2c.h"
#include "esp_log.h"
#include "sdkconfig.h"

// I2C Configuration
// Using GPIO8 (SCL) and GPIO9 (SDA)
#define I2C_MASTER_SCL_IO           8      // GPIO8 for I2C SCL
#define I2C_MASTER_SDA_IO           9      // GPIO9 for I2C SDA
#define I2C_MASTER_NUM              I2C_NUM_0
#define I2C_MASTER_FREQ_HZ          100000 // 100kHz - now that pull-ups are working
#define I2C_MASTER_TIMEOUT_MS       1000

// SHT31 Configuration
#define SHT31_ADDR                  0x44
// High repeatability, no clock stretching (common command)
#define SHT31_MEAS_HIGH_CMD_MSB     0x24
#define SHT31_MEAS_HIGH_CMD_LSB     0x00
// Soft reset command
#define SHT31_SOFT_RESET_MSB        0x30
#define SHT31_SOFT_RESET_LSB        0xA2

static const char *TAG = "sht31_monitor";

typedef struct {
    float temperature;
    float humidity;
} sht31_reading_t;

// CRC8 for SHT3x (polynomial 0x31, initialization 0xFF)
static uint8_t sht31_crc8(const uint8_t *data, int len)
{
    uint8_t crc = 0xFF;
    for (int i = 0; i < len; i++) {
        crc ^= data[i];
        for (int bit = 0; bit < 8; bit++) {
            if (crc & 0x80) crc = (crc << 1) ^ 0x31;
            else crc <<= 1;
        }
    }
    return crc;
}

// Soft reset SHT31 sensor
static esp_err_t sht31_soft_reset(void)
{
    uint8_t cmd[2] = {SHT31_SOFT_RESET_MSB, SHT31_SOFT_RESET_LSB};
    i2c_cmd_handle_t h = i2c_cmd_link_create();
    if (h == NULL) return ESP_FAIL;
    
    i2c_master_start(h);
    i2c_master_write_byte(h, (SHT31_ADDR << 1) | I2C_MASTER_WRITE, true);
    i2c_master_write(h, cmd, sizeof(cmd), true);
    i2c_master_stop(h);
    esp_err_t err = i2c_master_cmd_begin(I2C_MASTER_NUM, h, pdMS_TO_TICKS(500));
    i2c_cmd_link_delete(h);
    
    if (err == ESP_OK) {
        ESP_LOGI(TAG, "SHT31 soft reset sent");
    } else {
        ESP_LOGW(TAG, "SHT31 soft reset failed: %s", esp_err_to_name(err));
    }
    return err;
}

static esp_err_t i2c_master_init(void)
{
    i2c_port_t i2c_num = I2C_MASTER_NUM;
    
    // Reset GPIO pins to default state first
    gpio_reset_pin(I2C_MASTER_SDA_IO);
    gpio_reset_pin(I2C_MASTER_SCL_IO);
    
    // Configure GPIO pull-ups explicitly
    gpio_set_pull_mode(I2C_MASTER_SDA_IO, GPIO_PULLUP_ONLY);
    gpio_set_pull_mode(I2C_MASTER_SCL_IO, GPIO_PULLUP_ONLY);
    
    i2c_config_t conf = {
        .mode = I2C_MODE_MASTER,
        .sda_io_num = I2C_MASTER_SDA_IO,
        .scl_io_num = I2C_MASTER_SCL_IO,
        .sda_pullup_en = GPIO_PULLUP_ENABLE,
        .scl_pullup_en = GPIO_PULLUP_ENABLE,
        .master.clk_speed = I2C_MASTER_FREQ_HZ,
    };
    esp_err_t err = i2c_param_config(i2c_num, &conf);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "i2c_param_config failed: %s", esp_err_to_name(err));
        return err;
    }
    err = i2c_driver_install(i2c_num, conf.mode, 0, 0, 0);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "i2c_driver_install failed: %s", esp_err_to_name(err));
    }
    return err;
}

// Read SHT31 with CRC check and retries
static esp_err_t read_sht31(sht31_reading_t *out, int max_attempts)
{
    if (out == NULL) return ESP_ERR_INVALID_ARG;
    
    // Send soft reset before attempting to read
    sht31_soft_reset();
    vTaskDelay(pdMS_TO_TICKS(100));  // Wait 100ms for sensor to wake up after soft reset
    
    esp_err_t err = ESP_FAIL;
    uint8_t cmd[2] = {SHT31_MEAS_HIGH_CMD_MSB, SHT31_MEAS_HIGH_CMD_LSB};
    uint8_t data[6] = {0};  // FIX: Initialize data array

    for (int attempt = 0; attempt < max_attempts; attempt++) {
        // send measurement command
        i2c_cmd_handle_t h = i2c_cmd_link_create();
        if (h == NULL) {
            ESP_LOGW(TAG, "failed to create i2c handle (attempt %d)", attempt+1);
            vTaskDelay(pdMS_TO_TICKS(100));
            continue;
        }
        i2c_master_start(h);
        i2c_master_write_byte(h, (SHT31_ADDR << 1) | I2C_MASTER_WRITE, true);
        i2c_master_write(h, cmd, sizeof(cmd), true);
        i2c_master_stop(h);
        err = i2c_master_cmd_begin(I2C_MASTER_NUM, h, pdMS_TO_TICKS(1000));
        i2c_cmd_link_delete(h);
        if (err != ESP_OK) {
            ESP_LOGW(TAG, "write cmd failed (attempt %d): %s", attempt+1, esp_err_to_name(err));
            vTaskDelay(pdMS_TO_TICKS(100));
            continue;
        }

        // wait for measurement (datasheet: typically <15ms for high repeatability, increased to 30ms for safety)
        vTaskDelay(pdMS_TO_TICKS(30));

        // read 6 bytes: temp MSB, temp LSB, temp CRC, hum MSB, hum LSB, hum CRC
        h = i2c_cmd_link_create();
        if (h == NULL) {
            ESP_LOGW(TAG, "failed to create i2c read handle (attempt %d)", attempt+1);
            vTaskDelay(pdMS_TO_TICKS(100));
            continue;
        }
        i2c_master_start(h);
        i2c_master_write_byte(h, (SHT31_ADDR << 1) | I2C_MASTER_READ, true);
        i2c_master_read(h, data, 6, I2C_MASTER_LAST_NACK);
        i2c_master_stop(h);
        err = i2c_master_cmd_begin(I2C_MASTER_NUM, h, pdMS_TO_TICKS(500));
        i2c_cmd_link_delete(h);
        if (err != ESP_OK) {
            ESP_LOGW(TAG, "read failed (attempt %d): %s", attempt+1, esp_err_to_name(err));
            vTaskDelay(pdMS_TO_TICKS(100));
            continue;
        }

        // Debug: log raw bytes received
        ESP_LOGI(TAG, "raw: [0x%02X, 0x%02X, 0x%02X] [0x%02X, 0x%02X, 0x%02X]", 
                 data[0], data[1], data[2], data[3], data[4], data[5]);        // CRC checks
        if (sht31_crc8(&data[0], 2) != data[2]) {
            ESP_LOGW(TAG, "temp CRC failed (attempt %d)", attempt+1);
            vTaskDelay(pdMS_TO_TICKS(50));
            continue;
        }
        if (sht31_crc8(&data[3], 2) != data[5]) {
            ESP_LOGW(TAG, "hum CRC failed (attempt %d)", attempt+1);
            vTaskDelay(pdMS_TO_TICKS(50));
            continue;
        }

        uint16_t temp_raw = (data[0] << 8) | data[1];
        uint16_t hum_raw = (data[3] << 8) | data[4];
        out->temperature = -45.0f + 175.0f * ((float)temp_raw / 65535.0f);
        out->humidity = 100.0f * ((float)hum_raw / 65535.0f);
        return ESP_OK;
    }
    return err;
}

// I2C bus scanner - scans all addresses to find connected devices
static void i2c_scan(void)
{
    ESP_LOGI(TAG, "=== I2C BUS SCAN ===");
    ESP_LOGI(TAG, "Scanning I2C addresses 0x00-0x7F...");
    
    int devices_found = 0;
    for (uint8_t addr = 0x00; addr <= 0x7F; addr++) {
        i2c_cmd_handle_t cmd = i2c_cmd_link_create();
        i2c_master_start(cmd);
        i2c_master_write_byte(cmd, (addr << 1) | I2C_MASTER_WRITE, true);
        i2c_master_stop(cmd);
        esp_err_t ret = i2c_master_cmd_begin(I2C_MASTER_NUM, cmd, pdMS_TO_TICKS(50));
        i2c_cmd_link_delete(cmd);
        
        if (ret == ESP_OK) {
            ESP_LOGI(TAG, "  [FOUND] Device at 0x%02X", addr);
            devices_found++;
        }
    }
    
    if (devices_found == 0) {
        ESP_LOGE(TAG, "No devices found! Check wiring and pull-up resistors!");
    } else {
        ESP_LOGI(TAG, "Total devices found: %d", devices_found);
        if (devices_found > 0 && devices_found < 5) {
            ESP_LOGI(TAG, "SHT31 address is 0x44 (with ADR->GND) or 0x45 (with ADR->VDD)");
        }
    }
    ESP_LOGI(TAG, "=== END SCAN ===");
}

static void app_main_task(void *arg)
{
    (void)arg;
    ESP_LOGI(TAG, "Initializing I2C on SDA=%d SCL=%d", I2C_MASTER_SDA_IO, I2C_MASTER_SCL_IO);
    if (i2c_master_init() != ESP_OK) {
        ESP_LOGE(TAG, "I2C init failed");
        vTaskDelay(pdMS_TO_TICKS(1000));
    }

    // Scan the bus first to diagnose connectivity
    vTaskDelay(pdMS_TO_TICKS(500));
    i2c_scan();
    vTaskDelay(pdMS_TO_TICKS(1000));
    
    // Check I2C bus status
    ESP_LOGI(TAG, "Checking I2C bus state...");
    uint8_t dummy[1] = {0};
    i2c_cmd_handle_t test_cmd = i2c_cmd_link_create();
    if (test_cmd) {
        i2c_master_start(test_cmd);
        i2c_master_write_byte(test_cmd, (0x44 << 1) | I2C_MASTER_WRITE, true);
        i2c_master_stop(test_cmd);
        esp_err_t ret = i2c_master_cmd_begin(I2C_MASTER_NUM, test_cmd, pdMS_TO_TICKS(100));
        i2c_cmd_link_delete(test_cmd);
        if (ret == ESP_OK) {
            ESP_LOGI(TAG, "SHT31 (0x44) responded to write probe");
        } else {
            ESP_LOGW(TAG, "SHT31 (0x44) did NOT respond: %s", esp_err_to_name(ret));
        }
    }

    sht31_reading_t reading = {0};
    float last_temp = 0.0f;

    // initial read with retries
    if (read_sht31(&reading, 5) == ESP_OK) {
        last_temp = reading.temperature;
        ESP_LOGI(TAG, "Initial read: T=%.2f C, RH=%.2f%%", reading.temperature, reading.humidity);
    } else {
        ESP_LOGW(TAG, "Initial read failed after retries");
    }

    const TickType_t interval = pdMS_TO_TICKS(2000);
    while (1) {
        if (read_sht31(&reading, 3) == ESP_OK) {
            float dtemp = reading.temperature - last_temp;
            ESP_LOGI(TAG, "T=%.2f C (Δ %.2f)  RH=%.2f%%", reading.temperature, dtemp, reading.humidity);
            last_temp = reading.temperature;
        } else {
            ESP_LOGW(TAG, "Read failed, sensor may be disconnected or bus busy");
        }
        vTaskDelay(interval);
    }
}

void app_main(void)
{
    // create the main monitoring task
    xTaskCreate(app_main_task, "sht31_task", 4096, NULL, 5, NULL);
}

