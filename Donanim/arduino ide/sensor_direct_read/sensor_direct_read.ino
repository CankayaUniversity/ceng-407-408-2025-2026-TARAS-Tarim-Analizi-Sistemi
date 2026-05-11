/*
 * TARAS Direct Read — 1 Sensor
 * Prints SHT31 (temp/humidity) + soil moisture raw ADC every second.
 * For calibration: note the raw value in air (dry) and in water (wet).
 */

#include <Wire.h>

#define SDA_PIN    4
#define SCL_PIN    7
#define SOIL_PIN   0
#define SHT31_ADDR 0x44

uint8_t crc8(const uint8_t *data, int len) {
  uint8_t crc = 0xFF;
  for (int j = 0; j < len; j++) {
    crc ^= data[j];
    for (int i = 0; i < 8; i++)
      crc = (crc & 0x80) ? (crc << 1) ^ 0x31 : crc << 1;
  }
  return crc;
}

bool readSHT31(float &temp, float &hum) {
  Wire.beginTransmission(SHT31_ADDR);
  Wire.write(0x24); Wire.write(0x00);
  if (Wire.endTransmission() != 0) return false;
  delay(20);
  if (Wire.requestFrom(SHT31_ADDR, 6) != 6) return false;
  uint8_t d[6];
  for (int i = 0; i < 6; i++) d[i] = Wire.read();
  if (crc8(d, 2) != d[2] || crc8(d + 3, 2) != d[5]) return false;
  uint16_t rawT = (d[0] << 8) | d[1];
  uint16_t rawH = (d[3] << 8) | d[4];
  temp = -45.0f + 175.0f * (rawT / 65535.0f);
  hum  = 100.0f * (rawH / 65535.0f);
  return true;
}

void setup() {
  Serial.begin(115200);
  delay(2000);
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(100000);

  // Soft reset SHT31
  Wire.beginTransmission(SHT31_ADDR);
  Wire.write(0x30); Wire.write(0xA2);
  Wire.endTransmission();
  delay(20);

  Serial.println("\nTARAS Direct Read - 1 Sensor");
  Serial.println("SDA=4 SCL=7 SOIL=GPIO0");
  Serial.println("----");
}

void loop() {
  float temp = 0, hum = 0;
  bool ok = readSHT31(temp, hum);
  uint16_t soil = analogRead(SOIL_PIN);

  if (ok)
    Serial.printf("T=%.2fC  H=%.1f%%  Soil=%d\n", temp, hum, soil);
  else
    Serial.printf("T=ERROR  H=ERROR  Soil=%d\n", soil);

  delay(1000);
}
