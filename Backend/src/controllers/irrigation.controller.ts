import { Request, Response, NextFunction } from "express";
import { asyncHandler } from "../middleware/error.middleware";
import { getStringParam } from "../utils/requestHelpers";
import {
  getIrrigationPreviewInput,
  getIrrigationPythonPayload,
  generateAndSaveIrrigationJob,
  generateAndSaveIrrigationJobsForAllZones,
  getLatestIrrigationJobsByField,
  getZoneIrrigationJobs,
  submitIrrigationJobActual,
} from "../services/irrigation.service";

export const previewIrrigationInput = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const { zone_id } = req.body;

    if (!zone_id) {
      res.status(400).json({
        success: false,
        error: "Eksik parametre: 'zone_id' zorunludur.",
      });
      return;
    }

    const preview = await getIrrigationPreviewInput(zone_id);
    const pythonPayload = await getIrrigationPythonPayload(zone_id);

    res.status(200).json({
      success: true,
      data: {
        preview,
        pythonPayload,
      },
    });
  },
);



export const runIrrigationJob = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const zone_id = Array.isArray(req.params.zone_id)
      ? req.params.zone_id[0]
      : req.params.zone_id;

    if (!zone_id) {
      res.status(400).json({
        success: false,
        error: "Eksik parametre: 'zone_id' zorunludur.",
      });
      return;
    }

    const result = await generateAndSaveIrrigationJob(zone_id);

    if (result.waiting_for_followup) {
      res.status(200).json({
        success: true,
        message: result.reason,
        data: result,
      });
      return;
    }

    if (result.skipped) {
      res.status(200).json({
        success: true,
        message: result.reason ?? "Irrigation recommendation skipped.",
        data: result,
      });
      return;
    }

    res.status(201).json({
      success: true,
      message: "Irrigation job created successfully.",
      data: result,
    });
  },
);




export const runAllIrrigationJobs = asyncHandler(
  async (_req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const result = await generateAndSaveIrrigationJobsForAllZones();

    res.status(200).json({
      success: true,
      message: "All irrigation jobs processed.",
      data: result,
    });
  },
);


export const getZoneIrrigationJobsHandler = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const userId = (req as any).user?.user_id;
    if (!userId) {
      res.status(401).json({ success: false, error: "Auth required" });
      return;
    }

    const zoneId = getStringParam(req.params.zone_id);
    if (!zoneId) {
      res.status(400).json({
        success: false,
        error: "Eksik parametre: 'zone_id' zorunludur.",
      });
      return;
    }

    try {
      const data = await getZoneIrrigationJobs(zoneId, userId);
      res.status(200).json({ success: true, data });
    } catch (err: any) {
      if (err?.message === "ZONE_NOT_FOUND_OR_FORBIDDEN") {
        res.status(404).json({
          success: false,
          error: "Bolge bulunamadi veya erisim izniniz yok.",
        });
        return;
      }
      throw err;
    }
  },
);


export const getFieldIrrigationJobs = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const userId = (req as any).user?.user_id;
    if (!userId) {
      res.status(401).json({ success: false, error: "Auth required" });
      return;
    }

    const fieldId = getStringParam(req.params.field_id);
    if (!fieldId) {
      res.status(400).json({
        success: false,
        error: "Eksik parametre: 'field_id' zorunludur.",
      });
      return;
    }

    try {
      const data = await getLatestIrrigationJobsByField(fieldId, userId);
      res.status(200).json({ success: true, data });
    } catch (err: any) {
      if (err?.message === "FIELD_NOT_FOUND_OR_FORBIDDEN") {
        res.status(404).json({
          success: false,
          error: "Tarla bulunamadi veya erisim izniniz yok.",
        });
        return;
      }
      throw err;
    }
  },
);


export const submitIrrigationJobOutcome = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const userId = (req as any).user?.user_id;
    if (!userId) {
      res.status(401).json({ success: false, error: "Auth required" });
      return;
    }

    const jobId = getStringParam(req.params.job_id);
    if (!jobId) {
      res.status(400).json({
        success: false,
        error: "Eksik parametre: 'job_id' zorunludur.",
      });
      return;
    }

    const { actual_water_amount_ml, actual_start_time, actual_duration_min } =
      req.body ?? {};

    if (
      typeof actual_water_amount_ml !== "number" ||
      !Number.isFinite(actual_water_amount_ml) ||
      actual_water_amount_ml <= 0
    ) {
      res.status(400).json({
        success: false,
        error: "'actual_water_amount_ml' pozitif bir sayi olmalidir.",
      });
      return;
    }

    // duration optional — mobil UI sormuyor, atlanırsa dokunulmaz
    let durationMin: number | undefined = undefined;
    if (actual_duration_min !== undefined && actual_duration_min !== null) {
      if (
        typeof actual_duration_min !== "number" ||
        !Number.isFinite(actual_duration_min) ||
        actual_duration_min <= 0
      ) {
        res.status(400).json({
          success: false,
          error: "'actual_duration_min' pozitif bir sayi olmalidir.",
        });
        return;
      }
      durationMin = actual_duration_min;
    }

    if (
      typeof actual_start_time !== "string" ||
      actual_start_time.trim().length === 0
    ) {
      res.status(400).json({
        success: false,
        error: "'actual_start_time' ISO tarih dizgesi olmalidir.",
      });
      return;
    }

    const startTime = new Date(actual_start_time);
    if (isNaN(startTime.getTime())) {
      res.status(400).json({
        success: false,
        error: "'actual_start_time' gecerli bir tarih degil.",
      });
      return;
    }

    if (startTime.getTime() > Date.now() + 60_000) {
      res.status(400).json({
        success: false,
        error: "'actual_start_time' gelecekte olamaz.",
      });
      return;
    }

    try {
      const updated = await submitIrrigationJobActual(jobId, userId, {
        actual_water_amount_ml,
        actual_start_time: startTime,
        ...(durationMin != null ? { actual_duration_min: durationMin } : {}),
      });

      res.status(200).json({
        success: true,
        message: "Sulama isi sonucu kaydedildi.",
        data: updated,
      });
    } catch (err: any) {
      const status = err?.status;
      if (status === 404) {
        res.status(404).json({
          success: false,
          error: "Sulama isi bulunamadi veya erisim izniniz yok.",
        });
        return;
      }
      if (status === 409) {
        res.status(409).json({
          success: false,
          error: err.message,
        });
        return;
      }
      throw err;
    }
  },
);
