import cron from "node-cron";
import { generateAndSaveIrrigationJobsForAllZones } from "../services/irrigation.service";

let isIrrigationJobRunning = false;

export function startIrrigationScheduler() {
  cron.schedule("0 * * * *", async () => {
    if (isIrrigationJobRunning) {
      console.log("[Irrigation Scheduler] Previous run is still in progress, skipping this cycle.");
      return;
    }

    isIrrigationJobRunning = true;

    try {
      console.log("[Irrigation Scheduler] Run started at:", new Date().toISOString());

      const result = await generateAndSaveIrrigationJobsForAllZones();

      console.log("[Irrigation Scheduler] Run finished:", {
        total_zones: result.total_zones,
        successful_count: result.successful_count,
        failed_count: result.failed_count,
      });
    } catch (error: any) {
      console.error("[Irrigation Scheduler] Run failed:", error?.message || error);
    } finally {
      isIrrigationJobRunning = false;
    }
  });

  console.log("[Irrigation Scheduler] Initialized. Test mode: running every minute.");
}