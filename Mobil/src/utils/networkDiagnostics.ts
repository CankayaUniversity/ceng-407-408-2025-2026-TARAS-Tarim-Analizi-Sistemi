// Ag tani araci - baglanti sorunlarini tespit eder
// Testler: network state, DNS, HTTP, API endpoints, Socket.IO
import { Platform } from "react-native";
import NetInfo from "@react-native-community/netinfo";

interface DiagnosticResult {
  timestamp: string;
  test: string;
  success: boolean;
  message: string;
  details?: any;
}

export class NetworkDiagnostics {
  private results: DiagnosticResult[] = [];
  private baseUrl: string;

  constructor(baseUrl: string = "") {
    this.baseUrl = baseUrl;
  }

  private log(test: string, success: boolean, message: string, details?: any) {
    const result: DiagnosticResult = {
      timestamp: new Date().toISOString(),
      test,
      success,
      message,
      details,
    };
    this.results.push(result);
    console.log(`[NETDIAG] ${test}: ${success ? "ok" : "fail"} - ${message}`);
  }

  // Tum testleri calistir
  async runAll(): Promise<DiagnosticResult[]> {
    this.results = [];
    console.log("[NETDIAG] start");

    await this.testNetworkState();
    await this.testDNS();
    await this.testBasicConnectivity();
    await this.testHTTPConnection();
    await this.testAPIEndpoints();
    await this.testSocketConnection();

    return this.results;
  }

  // Ag durumunu kontrol et
  async testNetworkState(): Promise<void> {
    try {
      const state = await NetInfo.fetch();
      this.log(
        "Network State",
        state.isConnected === true,
        state.isConnected ? "Device is connected" : "Device is offline",
        {
          type: state.type,
          isConnected: state.isConnected,
          isInternetReachable: state.isInternetReachable,
        },
      );
    } catch (error) {
      this.log("Network State", false, "Failed to check network state", {
        error: String(error),
      });
    }
  }

  // DNS cozumlemesi
  async testDNS(): Promise<void> {
    try {
      const ip = this.baseUrl.match(/\d+\.\d+\.\d+\.\d+/)?.[0];
      if (ip) {
        this.log("DNS Resolution", true, `Using direct IP: ${ip}`, { ip });
      } else {
        const hostname = new URL(this.baseUrl).hostname;
        this.log(
          "DNS Resolution",
          false,
          `Cannot test DNS for hostname: ${hostname}`,
          { hostname },
        );
      }
    } catch (error) {
      this.log("DNS Resolution", false, "DNS test failed", {
        error: String(error),
      });
    }
  }

  // Temel baglanti testi
  async testBasicConnectivity(): Promise<void> {
    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.baseUrl}/api/health`, {
        method: "GET",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      this.log("Basic Connectivity", response.ok, `Response in ${duration}ms`, {
        status: response.status,
        duration,
      });
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.log(
        "Basic Connectivity",
        false,
        `Failed after ${duration}ms: ${error.message}`,
        { error: String(error), duration, platform: Platform.OS },
      );
    }
  }

  // HTTP baglanti testleri
  async testHTTPConnection(): Promise<void> {
    const tests = [
      { method: "GET", endpoint: "/api/health", description: "Health check" },
      {
        method: "OPTIONS",
        endpoint: "/api/health",
        description: "CORS preflight",
      },
    ];

    for (const test of tests) {
      const startTime = Date.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${this.baseUrl}${test.endpoint}`, {
          method: test.method,
          signal: controller.signal,
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        });

        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;

        let body;
        try {
          const contentType = response.headers.get("content-type");
          if (contentType?.includes("application/json")) {
            body = await response.json();
          } else {
            body = await response.text();
          }
        } catch {
          body = "Unable to parse response body";
        }

        this.log(
          `HTTP ${test.method}`,
          response.ok,
          `${test.description}: ${response.status} in ${duration}ms`,
          { status: response.status, duration, body },
        );
      } catch (error: any) {
        const duration = Date.now() - startTime;
        this.log(
          `HTTP ${test.method}`,
          false,
          `${test.description} failed: ${error.message}`,
          { error: String(error), duration },
        );
      }
    }
  }

  // API endpoint testleri
  async testAPIEndpoints(): Promise<void> {
    const endpoints = [
      { path: "/api/health", needsAuth: false, description: "Health endpoint" },
      { path: "/api/zones", needsAuth: true, description: "Zones list" },
    ];

    for (const endpoint of endpoints) {
      const startTime = Date.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const headers: Record<string, string> = {
          Accept: "application/json",
          "Content-Type": "application/json",
        };

        if (endpoint.needsAuth) {
          headers["Authorization"] = "Bearer test-token";
        }

        const response = await fetch(`${this.baseUrl}${endpoint.path}`, {
          method: "GET",
          signal: controller.signal,
          headers,
        });

        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;

        const expectedStatus = endpoint.needsAuth ? [200, 401, 403] : [200];
        const success = expectedStatus.includes(response.status);

        this.log(
          `API ${endpoint.path}`,
          success,
          `${endpoint.description}: ${response.status} in ${duration}ms`,
          { status: response.status, duration, needsAuth: endpoint.needsAuth },
        );
      } catch (error: any) {
        const duration = Date.now() - startTime;
        this.log(
          `API ${endpoint.path}`,
          false,
          `${endpoint.description} failed: ${error.message}`,
          { error: String(error), duration },
        );
      }
    }
  }

  // Socket.IO baglanti testi
  async testSocketConnection(): Promise<void> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      try {
        const io = require("socket.io-client");

        const socket = io(this.baseUrl, {
          transports: ["websocket", "polling"],
          timeout: 10000,
          reconnection: false,
        });

        const cleanup = () => {
          socket.off("connect");
          socket.off("connect_error");
          socket.off("disconnect");
          socket.disconnect();
        };

        const timeout = setTimeout(() => {
          cleanup();
          const duration = Date.now() - startTime;
          this.log(
            "Socket.IO Connection",
            false,
            `Timeout after ${duration}ms`,
            { duration },
          );
          resolve();
        }, 10000);

        socket.on("connect", () => {
          clearTimeout(timeout);
          const duration = Date.now() - startTime;
          this.log("Socket.IO Connection", true, `Connected in ${duration}ms`, {
            duration,
            transport: socket.io.engine.transport.name,
            id: socket.id,
          });
          cleanup();
          resolve();
        });

        socket.on("connect_error", (error: Error) => {
          clearTimeout(timeout);
          const duration = Date.now() - startTime;
          this.log("Socket.IO Connection", false, `Error: ${error.message}`, {
            error: String(error),
            duration,
          });
          cleanup();
          resolve();
        });
      } catch (error: any) {
        const duration = Date.now() - startTime;
        this.log(
          "Socket.IO Connection",
          false,
          `Init failed: ${error.message}`,
          { error: String(error), duration },
        );
        resolve();
      }
    });
  }

  getResults(): DiagnosticResult[] {
    return this.results;
  }

  // Rapor olustur
  generateReport(): string {
    let report = "=== Network Diagnostics Report ===\n\n";
    report += `Generated: ${new Date().toISOString()}\n`;
    report += `Platform: ${Platform.OS} ${Platform.Version}\n`;
    report += `Target: ${this.baseUrl}\n\n`;

    const passed = this.results.filter((r) => r.success).length;
    const failed = this.results.filter((r) => !r.success).length;

    report += `Summary: ${passed} passed, ${failed} failed\n\n`;

    for (const result of this.results) {
      report += `[${result.success ? "ok" : "fail"}] ${result.test}\n`;
      report += `    ${result.message}\n`;
      if (result.details) {
        report += `    Details: ${JSON.stringify(result.details, null, 2)}\n`;
      }
      report += "\n";
    }

    return report;
  }
}

// Kullanim kolayligi icin fonksiyon
export async function runNetworkDiagnostics(baseUrl?: string): Promise<string> {
  // If no baseUrl provided, get it from api.ts
  let url = baseUrl;
  if (!url) {
    const { API_HOST } = await import("./api");
    url = API_HOST;
    console.log("[NETDIAG] using API_HOST from config:", url || "EMPTY");
  }
  const diagnostics = new NetworkDiagnostics(url);
  await diagnostics.runAll();
  return diagnostics.generateReport();
}
