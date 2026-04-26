import cron from "node-cron";
import {
  generateAndSaveIrrigationJobsForAllZones,
  processDueFollowups,
} from "../services/irrigation.service";

let isIrrigationJobRunning = false;



async function runIrrigationCycle() {
  if (isIrrigationJobRunning) {
    console.log("[Irrigation Scheduler] Previous run is still in progress, skipping this cycle.");
    return;
  }

  isIrrigationJobRunning = true;

  try {
    console.log("[Irrigation Scheduler] Run started at:", new Date().toISOString());

    const followupResult = await processDueFollowups();
    console.log("[Irrigation Scheduler] Followup process finished:", followupResult);

    const recommendationResult = await generateAndSaveIrrigationJobsForAllZones();
    console.log("[Irrigation Scheduler] Recommendation run finished:", {
      total_zones: recommendationResult.total_zones,
      successful_count: recommendationResult.successful_count,
      skipped_count: recommendationResult.skipped_count,
      waiting_for_followup_count: recommendationResult.waiting_for_followup_count,
      failed_count: recommendationResult.failed_count,
    });
  } catch (error: any) {
    console.error("[Irrigation Scheduler] Run failed:", error?.message || error);
  } finally {
    isIrrigationJobRunning = false;
  }
}



export function startIrrigationScheduler() {
  runIrrigationCycle();

  cron.schedule("0 * * * *", async () => {
    await runIrrigationCycle();
  });

  console.log("[Irrigation Scheduler] Initialized. Running immediately on startup, then every hour.");
}
