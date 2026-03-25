#include <Wire.h>

#define SHT31_ADDR 0x44

uint8_t crc8(const uint8_t *data, int len) {
  uint8_t crc = 0xFF;

  for (int j = 0; j < len; j++) {
    crc ^= data[j];
    for (int i = 0; i < 8; i++) {
      if (crc & 0x80) {
        crc = (crc << 1) ^ 0x31;
      } else {
        crc <<= 1;
      }
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
  uint8_t data[6];

  // Single shot measurement, high repeatability
  if (!writeCommand(0x2400)) {
    return false;
  }

  delay(20);

  int received = Wire.requestFrom(SHT31_ADDR, 6);
  if (received != 6) {
    return false;
  }

  for (int i = 0; i < 6; i++) {
    data[i] = Wire.read();
  }

  // CRC kontrolü
  if (crc8(data, 2) != data[2]) {
    Serial.println("Sicaklik CRC hatasi");
    return false;
  }

  if (crc8(data + 3, 2) != data[5]) {
    Serial.println("Nem CRC hatasi");
    return false;
  }

  uint16_t rawT = ((uint16_t)data[0] << 8) | data[1];
  uint16_t rawH = ((uint16_t)data[3] << 8) | data[4];

  temperature = -45.0f + 175.0f * ((float)rawT / 65535.0f);
  humidity = 100.0f * ((float)rawH / 65535.0f);

  return true;
}

void setup() {
  Serial.begin(115200);
  delay(2000);

  Wire.begin(4, 5);   // SDA, SCL
  Wire.setClock(100000);

  Serial.println("SHT31 basliyor...");

  // Soft reset
  if (!writeCommand(0x30A2)) {
    Serial.println("Soft reset komutu gonderilemedi");
  }
  delay(20);

  // Clear status
  if (!writeCommand(0x3041)) {
    Serial.println("Status clear komutu gonderilemedi");
  }
  delay(20);

  Serial.println("Baslatma tamam.");
  Serial.println("----------------------");
}

void loop() {
  float t, h;

  if (readSHT31(t, h)) {
    Serial.print("Sicaklik: ");
    Serial.print(t, 2);
    Serial.println(" C");

    Serial.print("Nem: ");
    Serial.print(h, 2);
    Serial.println(" %");
  } else {
    Serial.println("Gecerli veri okunamadi.");
  }

  Serial.println("----------------------");
  delay(2000);
}