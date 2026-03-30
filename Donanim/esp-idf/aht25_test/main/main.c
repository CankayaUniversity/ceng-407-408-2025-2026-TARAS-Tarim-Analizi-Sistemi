#include <stdio.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2c_master.h"
#include "driver/gpio.h"
#include "esp_log.h"
#include "sdkconfig.h"

static const char *TAG = "aht25";

#define I2C_SDA         CONFIG_AHT25_I2C_SDA
#define I2C_SCL         CONFIG_AHT25_I2C_SCL
#define AHT25_ADDR      0x38
#define AHT25_TIMEOUT   100  /* ms */

static i2c_master_bus_handle_t bus_handle;
static i2c_master_dev_handle_t dev_handle;

/* ---- CRC8 (polynomial 0x31, init 0xFF) ---- */
static uint8_t crc8(const uint8_t *data, int len)
{
    uint8_t crc = 0xFF;
    for (int i = 0; i < len; i++) {
        crc ^= data[i];
        for (int b = 0; b < 8; b++) {
            if (crc & 0x80)
                crc = (crc << 1) ^ 0x31;
            else
                crc <<= 1;
        }
    }
    return crc;
}

/* ---- GPIO level check before I2C init ---- */
static void gpio_debug_check(void)
{
    gpio_config_t io = {
        .pin_bit_mask = (1ULL << I2C_SDA) | (1ULL << I2C_SCL),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
    };
    gpio_config(&io);
    for (volatile int i = 0; i < 10000; i++) {}

    int sda = gpio_get_level(I2C_SDA);
    int scl = gpio_get_level(I2C_SCL);
    printf("  GPIO%d (SDA): %s\n", I2C_SDA, sda ? "HIGH" : "LOW (!)");
    printf("  GPIO%d (SCL): %s\n", I2C_SCL, scl ? "HIGH" : "LOW (!)");

    if (!sda || !scl) {
        printf("  WARNING: line LOW — check wiring/pull-ups\n");
    }

    gpio_reset_pin(I2C_SDA);
    gpio_reset_pin(I2C_SCL);
}

/* ---- I2C bus scan ---- */
static void i2c_scan(void)
{
    printf("\n  I2C Scan:\n");
    int found = 0;
    for (uint8_t addr = 0x01; addr < 0x7F; addr++) {
        esp_err_t ret = i2c_master_probe(bus_handle, addr, AHT25_TIMEOUT);
        if (ret == ESP_OK) {
            const char *name = (addr == 0x38) ? " (AHT25)" : "";
            printf("    0x%02X: FOUND%s\n", addr, name);
            found++;
        }
    }
    if (found == 0) {
        printf("    No devices found! Check wiring and pull-ups.\n");
    } else if (found > 10) {
        printf("    WARNING: %d devices — SDA likely shorted to GND!\n", found);
    } else {
        printf("    Total: %d device(s)\n", found);
    }
}

/* ---- AHT25 init ---- */
static esp_err_t aht25_init(void)
{
    /* Wait 20ms after power-on */
    vTaskDelay(pdMS_TO_TICKS(40));

    /* Read status byte */
    uint8_t status = 0;
    esp_err_t ret = i2c_master_receive(dev_handle, &status, 1, AHT25_TIMEOUT);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to read status: %s", esp_err_to_name(ret));
        return ret;
    }
    printf("  Status: 0x%02X (calibrated=%d, busy=%d)\n",
           status, (status >> 3) & 1, (status >> 7) & 1);

    /* If not calibrated, send init command 0xB1 */
    if (!((status >> 3) & 1)) {
        printf("  Sending init command (0xB1)...\n");
        uint8_t cmd[3] = {0xB1, 0x08, 0x00};
        ret = i2c_master_transmit(dev_handle, cmd, 3, AHT25_TIMEOUT);
        if (ret != ESP_OK) {
            ESP_LOGE(TAG, "Init command failed: %s", esp_err_to_name(ret));
            return ret;
        }
        vTaskDelay(pdMS_TO_TICKS(10));
        printf("  Init sent OK\n");
    } else {
        printf("  Already calibrated\n");
    }

    return ESP_OK;
}

/* ---- AHT25 read temperature & humidity ---- */
static esp_err_t aht25_read(float *temperature, float *humidity)
{
    /* Trigger measurement: 0xAC, 0x33, 0x00 */
    uint8_t cmd[3] = {0xAC, 0x33, 0x00};
    esp_err_t ret = i2c_master_transmit(dev_handle, cmd, 3, AHT25_TIMEOUT);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Trigger failed: %s", esp_err_to_name(ret));
        return ret;
    }

    /* Wait for measurement (>80ms) */
    vTaskDelay(pdMS_TO_TICKS(100));

    /* Read 7 bytes: status + 5 data + CRC */
    uint8_t data[7] = {0};
    ret = i2c_master_receive(dev_handle, data, 7, AHT25_TIMEOUT);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Read failed: %s", esp_err_to_name(ret));
        return ret;
    }

    /* Check busy bit */
    if (data[0] & 0x80) {
        ESP_LOGW(TAG, "Sensor busy, retrying...");
        vTaskDelay(pdMS_TO_TICKS(80));
        ret = i2c_master_receive(dev_handle, data, 7, AHT25_TIMEOUT);
        if (ret != ESP_OK) return ret;
        if (data[0] & 0x80) {
            ESP_LOGE(TAG, "Sensor still busy");
            return ESP_ERR_TIMEOUT;
        }
    }

    /* CRC check (6 data bytes, CRC in byte 7) */
    uint8_t calc_crc = crc8(data, 6);
    if (calc_crc != data[6]) {
        ESP_LOGW(TAG, "CRC mismatch: calc=0x%02X got=0x%02X", calc_crc, data[6]);
    }

    /* Extract 20-bit humidity (MSB) and 20-bit temperature (LSB)
     * data[1]    = hum[19:12]
     * data[2]    = hum[11:4]
     * data[3]    = hum[3:0] | temp[19:16]
     * data[4]    = temp[15:8]
     * data[5]    = temp[7:0]
     */
    uint32_t hum_raw = ((uint32_t)data[1] << 12) |
                       ((uint32_t)data[2] << 4) |
                       ((uint32_t)data[3] >> 4);

    uint32_t temp_raw = (((uint32_t)data[3] & 0x0F) << 16) |
                        ((uint32_t)data[4] << 8) |
                        ((uint32_t)data[5]);

    *humidity = ((float)hum_raw / 1048576.0f) * 100.0f;
    *temperature = ((float)temp_raw / 1048576.0f) * 200.0f - 50.0f;

    return ESP_OK;
}

void app_main(void)
{
    /* Turn off onboard LED (GPIO8) */
    gpio_set_direction(8, GPIO_MODE_OUTPUT);
    gpio_set_level(8, 0);

    printf("\n");
    printf("  AHT25 Test | SDA=GPIO%d SCL=GPIO%d\n", I2C_SDA, I2C_SCL);
    printf("  ---------------------------------\n");

    /* Step 1: GPIO check */
    gpio_debug_check();

    /* Step 2: Init I2C bus */
    i2c_master_bus_config_t bus_cfg = {
        .clk_source = I2C_CLK_SRC_DEFAULT,
        .i2c_port = I2C_NUM_0,
        .scl_io_num = I2C_SCL,
        .sda_io_num = I2C_SDA,
        .glitch_ignore_cnt = 7,
        .flags.enable_internal_pullup = true,
    };
    ESP_ERROR_CHECK(i2c_new_master_bus(&bus_cfg, &bus_handle));

    /* Step 3: Scan bus */
    i2c_scan();

    /* Step 4: Add AHT25 device */
    i2c_device_config_t dev_cfg = {
        .dev_addr_length = I2C_ADDR_BIT_LEN_7,
        .device_address = AHT25_ADDR,
        .scl_speed_hz = 100000,
    };
    ESP_ERROR_CHECK(i2c_master_bus_add_device(bus_handle, &dev_cfg, &dev_handle));

    /* Step 5: Init AHT25 */
    printf("\n  Initializing AHT25...\n");
    if (aht25_init() != ESP_OK) {
        ESP_LOGE(TAG, "AHT25 init failed — check wiring");
        return;
    }

    /* Step 6: Read loop */
    printf("\n  Reading sensor data:\n");
    int count = 0;
    float temp, hum;

    while (1) {
        vTaskDelay(pdMS_TO_TICKS(2000));
        count++;

        if (aht25_read(&temp, &hum) == ESP_OK) {
            printf("  [%d] T=%.2f C  RH=%.2f%%\n", count, temp, hum);
        } else {
            printf("  [%d] Read failed\n", count);
        }
    }
}
