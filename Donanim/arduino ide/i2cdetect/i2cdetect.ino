#include <Wire.h>

void setup() {
  Serial.begin(115200);
  delay(2000);

  Wire.begin(4, 5);   // SDA, SCL
  Wire.setClock(100000);

  Serial.println("I2C DETECT BASLIYOR...\n");
}

void loop() {
  Serial.println("    00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F");

  for (int base = 0; base < 128; base += 16) {
    if (base < 16) Serial.print("0");
    Serial.print(base, HEX);
    Serial.print(": ");

    for (int offset = 0; offset < 16; offset++) {
      int address = base + offset;

      if (address < 8 || address > 119) {
        Serial.print("   ");
        continue;
      }

      Wire.beginTransmission(address);
      uint8_t error = Wire.endTransmission();

      if (error == 0) {
        if (address < 16) Serial.print("0");
        Serial.print(address, HEX);
        Serial.print(" ");
      } else {
        Serial.print("-- ");
      }
    }

    Serial.println();
  }

  Serial.println("\n----------------------\n");
  delay(5000);
}