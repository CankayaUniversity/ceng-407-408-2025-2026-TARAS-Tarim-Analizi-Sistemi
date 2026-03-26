ESP32-C6 + Arduino IDE + SHT31 Kurulumu
========================================

1. ARDUINO IDE KURULUMU
-----------------------
1. Arduino IDE'yi indir: https://www.arduino.cc/en/software
2. Kur ve ac.
3. File > Preferences > "Additional Boards Manager URLs" kismina ekle:
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
4. Tools > Board > Boards Manager > "esp32" ara > Espressif Systems paketini kur


2. BOARD SECIMI VE AYARLAR
---------------------------
Board: MakerGO ESP32 C6 SuperMini  (Pil yuvali olan icin: ESP32 Dev Module)

Tools menusunden:
  - USB CDC On Boot  ->  Enabled    (ZORUNLU - yoksa Serial Monitor bos kalir)
  - Upload Speed     ->  460800
  - Flash Mode       ->  QIO

Serial Monitor hizi: 115200 baud


3. KUTUPHANE KURULUMU
---------------------
Arduino IDE > Library Manager (veya Sketch > Include Library > Manage Libraries):
  - "Adafruit SHT31" ara ve kur
  - Bagimliligi olan "Adafruit BusIO" otomatik kurulacaktir


4. I2C PIN TESPITI (ILK ADIM)
-------------------------------
SHT31 sensorunun ESP32-C6 uzerinde hangi GPIO pinlerine bagli oldugunu bulmak icin:

1. "i2cdetect" klasorundeki sketch'i ac
2. Board'a yukle
3. Serial Monitor'u ac (115200 baud)
4. Tarama tamamlaninca ekranda su bilgiyi goreceksiniz:
     SDA = GPIO X
     SCL = GPIO Y
5. Bu degerleri not alin - diger sketch'lerde kullanacaksiniz

NOT: Tarama ~5 saniye surer, tum guvenli GPIO kombinasyonlarini dener.


5. SENSOR OKUMA
---------------
1. "sht31_sensor" klasorundeki sketch'i ac
2. Dosyanin basindaki pin tanimlarini guncelleyin:
     #define SDA_PIN  X    // i2cdetect'ten gelen deger
     #define SCL_PIN  Y    // i2cdetect'ten gelen deger
3. Board'a yukle
4. Serial Monitor'da sicaklik ve nem verilerini goreceksiniz:
     Temperature: 23.45 C  |  Humidity: 45.67 %


6. SORUN GIDERME
-----------------
COM portu gorunmuyor:
  - ESP32-C6 USB surucusunu kur
  - Upload sirasinda board uzerindeki BOOT dugmesine basili tut
  - Kabloyu degistirmeyi dene (bazi USB kablolari sadece sarj icin)

Serial Monitor bos:
  - Tools > USB CDC On Boot > Enabled oldugundan emin ol
  - Upload'dan sonra Serial Monitor'u kapat ve tekrar ac
  - Board uzerindeki RST (reset) dugmesine bas

SHT31 bulunamadi:
  - Once i2cdetect sketch'ini calistir, dogru pinleri bul
  - VCC (3.3V) ve GND baglantilarini kontrol et
  - SDA ve SCL kablolarini kontrol et
  - Gerekirse 4.7k ohm pull-up direnc ekle (SDA->3.3V ve SCL->3.3V)

Veriler hatali / CRC hatasi:
  - Kablo uzunlugunu kisalt
  - 4.7k ohm harici pull-up direnc ekle
  - Breadboard baglantilarin gevsemedginden emin ol


7. SKETCH LISTESI
------------------
  deneme/         - Temel seri port testi (board calisiyor mu?)
  i2cdetect/      - I2C pin otomatik tarayici (hangi pinler?)
  sht31_sensor/   - SHT31 sicaklik ve nem okuma
  internet/       - SHT31 okuma (ag destegi icin hazirlik)
