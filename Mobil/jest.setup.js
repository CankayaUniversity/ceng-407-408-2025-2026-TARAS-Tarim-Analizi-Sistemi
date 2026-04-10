// Jest setup — Expo SDK 54 winter runtime uyumluluk
// structuredClone polyfill (expo/winter runtime bunu bekliyor)
if (typeof globalThis.structuredClone === "undefined") {
  globalThis.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
}
