#include <Wire.h>

// ============ PIN CONFIGURATION ============
// Found by i2cdetect auto-scanner
#define SDA_PIN  4
#define SCL_PIN  7
// ===========================================

#define SHT31_ADDR 0x44

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

bool writeCommand(uint16_t cmd) {
  Wire.beginTransmission(SHT31_ADDR);
  Wire.write(cmd >> 8);
  Wire.write(cmd & 0xFF);
  return (Wire.endTransmission() == 0);
}

bool readSHT31(float &temperature, float &humidity) {
  // Single shot measurement, high repeatability
  if (!writeCommand(0x2400)) return false;
  delay(20);

  if (Wire.requestFrom(SHT31_ADDR, 6) != 6) return false;

  uint8_t data[6];
  for (int i = 0; i < 6; i++) data[i] = Wire.read();

  if (crc8(data, 2) != data[2]) return false;
  if (crc8(data + 3, 2) != data[5]) return false;

  uint16_t rawT = ((uint16_t)data[0] << 8) | data[1];
  uint16_t rawH = ((uint16_t)data[3] << 8) | data[4];

  temperature = -45.0f + 175.0f * ((float)rawT / 65535.0f);
  humidity = 100.0f * ((float)rawH / 65535.0f);
  return true;
}

void setup() {
  Serial.begin(115200);
  delay(3000);

  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(100000);

  Serial.println("==========================================");
  Serial.println("  SHT31 Sensor - TARAS Project");
  Serial.printf("  I2C Pins: SDA=GPIO%d, SCL=GPIO%d\n", SDA_PIN, SCL_PIN);
  Serial.println("==========================================");

  // Soft reset
  if (!writeCommand(0x30A2)) Serial.println("Soft reset failed");
  delay(20);

  // Clear status
  writeCommand(0x3041);
  delay(20);

  Serial.println("Ready.");
  Serial.println("------------------------------------------");
}

void loop() {
  float t, h;

  if (readSHT31(t, h)) {
    Serial.printf("Temperature: %.2f C  |  Humidity: %.2f %%\n", t, h);
  } else {
    Serial.println("Read failed - check sensor connection");
  }

  delay(2000);
}
