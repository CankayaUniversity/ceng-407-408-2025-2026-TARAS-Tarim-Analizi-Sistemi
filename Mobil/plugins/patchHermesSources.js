// Post-unzip patch — MSVC uyumluluk
const fs = require("fs");
const dir = process.argv[2];

if (!dir) { console.log("Usage: node patchHermesSources.js <hermesDir>"); process.exit(1); }
console.log("  Hermes dir: " + dir);

// 1. StackOverflowGuard.h
const hPath = dir + "/include/hermes/Support/StackOverflowGuard.h";
if (fs.existsSync(hPath)) {
  let h = fs.readFileSync(hPath, "utf8");
  if (!h.includes("HERMES_GET_FRAME_ADDRESS")) {
    // Once kullanim yerini degistir (henuz macro yok)
    h = h.replace(/__builtin_frame_address\(0\)/g, "HERMES_GET_FRAME_ADDRESS()");
    // Sonra macro tanimini ekle — boylece kendi icinde recursion olmaz
    h = h.replace(
      "#define HERMES_SUPPORT_STACKOVERFLOWGUARD_H",
      `#define HERMES_SUPPORT_STACKOVERFLOWGUARD_H

#ifdef _MSC_VER
#include <intrin.h>
#define HERMES_GET_FRAME_ADDRESS() _AddressOfReturnAddress()
#else
#define HERMES_GET_FRAME_ADDRESS() __builtin_frame_address(0)
#endif
`
    );
    fs.writeFileSync(hPath, h);
    console.log("  Patched: StackOverflowGuard.h");
  }
}

// 2. StackOverflowGuard.cpp
const cppPath = dir + "/lib/Support/StackOverflowGuard.cpp";
if (fs.existsSync(cppPath)) {
  let c = fs.readFileSync(cppPath, "utf8");
  if (!c.includes("HERMES_GET_FRAME_ADDRESS")) {
    c = c.replace(/__builtin_frame_address\(0\)/g, "HERMES_GET_FRAME_ADDRESS()");
    fs.writeFileSync(cppPath, c);
    console.log("  Patched: StackOverflowGuard.cpp");
  }
}

// 3. CMakeLists.txt — Boost Context
const cmPath = dir + "/CMakeLists.txt";
if (fs.existsSync(cmPath)) {
  let cm = fs.readFileSync(cmPath, "utf8");
  if (!cm.includes("# WINDOWS_BOOST_PATCH")) {
    cm = cm.replace(
      "if (HERMES_ALLOW_BOOST_CONTEXT EQUAL 0)",
      `# WINDOWS_BOOST_PATCH
if (WIN32)
    set(HERMES_ALLOW_BOOST_CONTEXT 0)
endif()
if (HERMES_ALLOW_BOOST_CONTEXT EQUAL 0)`
    );
    fs.writeFileSync(cmPath, cm);
    console.log("  Patched: CMakeLists.txt");
  }
}
