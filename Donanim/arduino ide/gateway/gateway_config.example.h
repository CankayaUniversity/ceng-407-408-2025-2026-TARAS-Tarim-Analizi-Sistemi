// TARAS Gateway local config — KOPYALA: gateway_config.h
// Bu ornek dosya commit edilir, asil gateway_config.h gitignore'da.
//
// Setup:
//   1. Bu dosyayi gateway_config.h olarak kopyala
//   2. BACKEND_HOST'u kendi sunucuna ayarla
//   3. gateway.ino'yu derle ve flashla
#pragma once

// Backend host (sertifika dogrulamasi icin alan adi olmali, IP degil)
#define BACKEND_HOST  "your-backend.example.com"
