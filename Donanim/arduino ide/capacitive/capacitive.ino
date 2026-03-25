const int soilPin = 0;

void setup() {
  Serial.begin(115200);
}

void loop() {
  int raw = analogRead(soilPin);
  Serial.println(raw);
  delay(1000);
}