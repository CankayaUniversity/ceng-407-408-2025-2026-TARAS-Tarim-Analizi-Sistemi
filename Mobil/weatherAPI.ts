// weatherAPI.ts

// Ekranlara döndüreceğimiz basit tip
export interface WeatherInfo {
  temperature: number; // °C
  humidity: number;    // %
}

// Open-Meteo temel URL
const BASE_URL = 'https://api.open-meteo.com/v1/forecast';

// Bu fonksiyon: verilen enlem/boylam için hava verisini döner
export async function fetchWeatherInfo(
  latitude: number,
  longitude: number
): Promise<WeatherInfo> {
  // 1) URL'yi oluştur
  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    // Günlük veriler – şimdilik kullanmıyoruz ama sende URL’de vardı, bırakıyorum:
    daily: 'sunrise,sunset',
    // Saatlik almak istediğimiz değişkenler:
    hourly: 'temperature_2m,soil_temperature_18cm,relative_humidity_2m',
    // Cihaz saatine daha yakın olsun diye:
    timezone: 'auto',
  });

  const url = `${BASE_URL}?${params.toString()}`;

  // 2) API çağrısı
  const response = await fetch(url);

  if (!response.ok) {
    // Şimdilik basit hata:
    throw new Error('Open-Meteo isteği başarısız oldu');
  }

  const data = await response.json();

  // 3) Dönen yapıyı kullan:
  // data.hourly.temperature_2m → [sayı, sayı, ...]
  // data.hourly.relative_humidity_2m → [sayı, sayı, ...]
  //
  // ŞİMDİLİK basit olsun diye ilk saati (index 0) alıyoruz.
  // Sonra "şu anki saate en yakın olan index" hesabını beraber yaparız.
  const firstIndex = 0;

  const temperature = data.hourly.temperature_2m[firstIndex];
  const humidity = data.hourly.relative_humidity_2m[firstIndex];

  return {
    temperature,
    humidity,
  };
}
