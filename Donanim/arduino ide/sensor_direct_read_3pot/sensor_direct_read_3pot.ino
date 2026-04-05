/*
 * TARAS Direct Read — 3 Sensors
 * Prints SHT31 (temp/humidity) + 3 soil moisture raw ADC every second.
 * For calibration: note the raw value in air (dry) and in water (wet).
 */

#include <Wire.h>

#define SDA_PIN    4
#define SCL_PIN    7
#define SOIL_PIN_0 0
#define SOIL_PIN_1 1
#define SOIL_PIN_2 2
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
  uint8_t err = Wire.endTransmission();
  if (err != 0) { Serial.printf("[SHT31] endTransmission err=%d\n", err); return false; }
  delay(20);
  int got = Wire.requestFrom(SHT31_ADDR, 6);
  if (got != 6) { Serial.printf("[SHT31] requestFrom got %d bytes\n", got); return false; }
  uint8_t d[6];
  for (int i = 0; i < 6; i++) d[i] = Wire.read();
  if (crc8(d, 2) != d[2]) { Serial.println("[SHT31] CRC fail on temp"); return false; }
  if (crc8(d + 3, 2) != d[5]) { Serial.println("[SHT31] CRC fail on hum"); return false; }
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

  // I2C scan
  Serial.println("\nI2C scan:");
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0)
      Serial.printf("  Found device at 0x%02X\n", addr);
  }

  Serial.println("\nTARAS Direct Read - 3 Sensors");
  Serial.println("SDA=4 SCL=7 S0=GPIO0 S1=GPIO1 S2=GPIO2");
  Serial.println("----");
}

void loop() {
  float temp = 0, hum = 0;
  bool ok = readSHT31(temp, hum);
  uint16_t s0 = analogRead(SOIL_PIN_0);
  uint16_t s1 = analogRead(SOIL_PIN_1);
  uint16_t s2 = analogRead(SOIL_PIN_2);

  if (ok)
    Serial.printf("T=%.2fC  H=%.1f%%  S0=%d  S1=%d  S2=%d\n", temp, hum, s0, s1, s2);
  else
    Serial.printf("T=ERROR  H=ERROR  S0=%d  S1=%d  S2=%d\n", s0, s1, s2);

  delay(1000);
}
