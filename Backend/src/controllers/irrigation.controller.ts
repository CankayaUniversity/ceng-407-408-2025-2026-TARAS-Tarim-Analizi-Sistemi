import { Request, Response, NextFunction } from "express";
import { asyncHandler } from "../middleware/error.middleware";
import { getIrrigationPreviewInput } from "../services/irrigation.service";

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

    const data = await getIrrigationPreviewInput(zone_id);

    res.status(200).json({
      success: true,
      data,
    });
  },
);