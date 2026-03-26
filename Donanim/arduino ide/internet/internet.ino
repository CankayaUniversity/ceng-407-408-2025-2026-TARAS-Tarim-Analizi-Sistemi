#include <Arduino.h>
#include <Wire.h>
#include "Adafruit_SHT31.h"

// ============ PIN CONFIGURATION ============
// Run i2cdetect sketch first to find the correct pins!
// Default: GPIO 9/8 based on ESP-IDF evidence
#define SDA_PIN  4
#define SCL_PIN  7
// ===========================================

Adafruit_SHT31 sht31 = Adafruit_SHT31();

void setup() {
  Serial.begin(115200);
  delay(3000);  // USB CDC needs extra time on ESP32-C6

  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(100000);

  Serial.println("Basliyor...");
  Serial.printf("I2C Pins: SDA=GPIO%d, SCL=GPIO%d\n", SDA_PIN, SCL_PIN);

  // Try both addresses with retry
  bool found = false;
  for (int attempt = 0; attempt < 3 && !found; attempt++) {
    if (sht31.begin(0x44)) {
      found = true;
      Serial.println("SHT31 bulundu (0x44)");
    } else if (sht31.begin(0x45)) {
      found = true;
      Serial.println("SHT31 bulundu (0x45)");
    } else {
      Serial.printf("Deneme %d: SHT31 bulunamadi, tekrar deneniyor...\n", attempt + 1);
      delay(1000);
    }
  }

  if (!found) {
    Serial.println("HATA: SHT31 bulunamadi!");
    Serial.println("  1. i2cdetect sketch'ini calistirin");
    Serial.println("  2. SDA_PIN ve SCL_PIN degerlerini guncelleyin");
    while (1) delay(1000);
  }
}

void loop() {
  float t = sht31.readTemperature();
  float h = sht31.readHumidity();

  if (!isnan(t)) {
    Serial.print("Temp *C = ");
    Serial.println(t);
  } else {
    Serial.println("Failed to read temperature");
  }

  if (!isnan(h)) {
    Serial.print("Hum. % = ");
    Serial.println(h);
  } else {
    Serial.println("Failed to read humidity");
  }

  Serial.println();
  delay(1000);
}
