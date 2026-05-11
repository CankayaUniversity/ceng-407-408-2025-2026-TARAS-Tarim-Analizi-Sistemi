// ISRG Root X1 — Let's Encrypt root CA certificate
// Source: https://letsencrypt.org/certs/isrgrootx1.pem
// Valid until: 2035-06-04
//
// Setup:
//   1. Copy this file to isrg_root_x1.h
//   2. Replace the placeholder below with the contents of
//      https://letsencrypt.org/certs/isrgrootx1.pem
//   3. The PEM content must be wrapped in the R"EOF(...)EOF" raw string.
//
// This cert is publicly distributed in every browser/OS — it is NOT secret.
// Its only purpose is to let the gateway verify Let's Encrypt TLS certs.
#pragma once

const char* ISRG_ROOT_X1_PEM = R"EOF(
-----BEGIN CERTIFICATE-----
<paste contents of https://letsencrypt.org/certs/isrgrootx1.pem here>
-----END CERTIFICATE-----
)EOF";
