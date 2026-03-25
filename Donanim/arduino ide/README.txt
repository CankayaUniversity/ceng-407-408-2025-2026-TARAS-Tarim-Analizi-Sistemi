ESP32-C6 + Arduino IDE + SHT31 Kurulumu


1. Arduino IDE’yi indir: https://www.arduino.cc/en/software

2. Kur ve aç.

3. ESP32 Board Manager Kurulumu: Arduino IDE → File > Preferences "Additional Boards Manager URLs" kısmına: https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json


4. Tools -> Board -> Boards Manager: esp32

6. Espressif Systems -> ESP32 paketini kur

7. Arduino IDE -> Library Manager -> Adafruit SHT31


Bizim işlemci için MakerGO ESP32 C6 SuperMini seçilecek. Pil yuvalı olan için ise ESP32 Dev Module

Ayarlar olarak serial monitordan bir şeyler görmek için Tools menüsünden: 
USB CDC On Boot → Enabled


İlk deneme kodu ile kart çalışıyor mu  onu test ettim. O çalışıyordu.
Sonra i2cdetect adlı bir kod var, malesef aynı hatalar geliyor.
En son sht31_test var.

Pinleri belirlemek için Wire.begin(SDA, SCL) kullanıyoruz. 


