import { Request, Response, NextFunction } from "express";
import { asyncHandler } from "../middleware/error.middleware";
import {
  getIrrigationPreviewInput,
  getIrrigationPythonPayload,
  generateAndSaveIrrigationJob,
  generateAndSaveIrrigationJobsForAllZones,
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