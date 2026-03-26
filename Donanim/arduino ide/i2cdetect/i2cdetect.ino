#include <Wire.h>

// LIVE WIRE FINDER
// 1. Upload this sketch
// 2. Open Serial Monitor (115200)
// 3. Take the SECOND wire from the SHT31 (the one that's not working)
// 4. Touch it to different pins on the ESP32, one at a time
// 5. The sketch will detect it and try I2C immediately
//
// GPIO 4 is confirmed working. We're looking for where the other wire goes.

const int pins[] = {0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 15, 18, 19, 20, 21, 22, 23};
const int pinCount = sizeof(pins) / sizeof(pins[0]);

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

bool tryI2C(int sdaPin, int sclPin) {
  Wire.end();
  delay(50);
  Wire.begin(sdaPin, sclPin);
  Wire.setClock(100000);
  delay(50);

  Wire.beginTransmission(0x44);
  if (Wire.endTransmission() != 0) return false;

  // Soft reset
  Wire.beginTransmission(0x44);
  Wire.write(0x30); Wire.write(0xA2);
  Wire.endTransmission();
  delay(50);

  // Measure
  Wire.beginTransmission(0x44);
  Wire.write(0x24); Wire.write(0x00);
  if (Wire.endTransmission() != 0) return false;
  delay(30);

  if (Wire.requestFrom(0x44, 6) != 6) return false;
  uint8_t d[6];
  for (int i = 0; i < 6; i++) d[i] = Wire.read();
  Wire.end();

  if (crc8(d, 2) != d[2] || crc8(d + 3, 2) != d[5]) return false;

  uint16_t rawT = ((uint16_t)d[0] << 8) | d[1];
  uint16_t rawH = ((uint16_t)d[3] << 8) | d[4];
  float t = -45.0f + 175.0f * ((float)rawT / 65535.0f);
  float h = 100.0f * ((float)rawH / 65535.0f);
  if (t < -20 || t > 80 || h < 0 || h > 100) return false;

  Serial.printf("\n>>> SUCCESS! SDA=%d SCL=%d <<<\n", sdaPin, sclPin);
  Serial.printf(">>> Temp=%.2f C  Hum=%.2f %% <<<\n", t, h);
  Serial.printf("\nUpdate sht31_sensor.ino:\n");
  Serial.printf("  #define SDA_PIN  %d\n", sdaPin);
  Serial.printf("  #define SCL_PIN  %d\n", sclPin);
  return true;
}

void setup() {
  Serial.begin(115200);
  delay(3000);

  Serial.println("==========================================");
  Serial.println("  LIVE WIRE FINDER");
  Serial.println("==========================================");
  Serial.println("Touch the loose SHT31 wire to different");
  Serial.println("ESP32 pins. I'll detect it instantly.");
  Serial.println("==========================================\n");
}

void loop() {
  for (int i = 0; i < pinCount; i++) {
    int pin = pins[i];

    // Check for external pull-up
    pinMode(pin, INPUT_PULLDOWN);
    delayMicroseconds(500);
    int level = digitalRead(pin);
    pinMode(pin, INPUT);

    if (level == HIGH) {
      Serial.printf("Wire detected on GPIO %d! Testing I2C... ", pin);

      // Try both orientations with GPIO 4
      if (tryI2C(4, pin)) return;
      if (tryI2C(pin, 4)) return;

      Serial.println("no sensor response");
      delay(2000);  // Don't spam
    }
  }

  // Also do a quick check: is GPIO 4 still showing pull-up?
  pinMode(4, INPUT_PULLDOWN);
  delayMicroseconds(500);
  int g4 = digitalRead(4);
  pinMode(4, INPUT);

  static unsigned long lastPrint = 0;
  if (millis() - lastPrint > 5000) {
    Serial.printf("Waiting... (GPIO 4: %s)\n", g4 ? "OK" : "DISCONNECTED!");
    lastPrint = millis();
  }

  delay(200);
}
