import { Request, Response } from "express";
import dashboardService from "../services/dashboardService";
import logger from "../utils/logger";
import { getStringParam } from "../utils/requestHelpers";

// get user"s fields
export async function getFields(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
      });
      return;
    }

    const farmId = req.query.farm_id as string | undefined;
    const fields = await dashboardService.getUserFields(userId, farmId);

    res.status(200).json({
      success: true,
      data: fields,
    });
  } catch (error) {
    logger.error("Get dashboard fields error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}

// get field dashboard data
export async function getFieldDashboard(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;
    const fieldId = getStringParam(req.params.fieldId);

    if (!userId) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
      });
      return;
    }

    if (!fieldId) {
      res.status(400).json({
        success: false,
        error: "Field ID is required",
      });
      return;
    }

    // check access
    const hasAccess = await dashboardService.checkFieldAccess(userId, fieldId);
    if (!hasAccess) {
      res.status(403).json({
        success: false,
        error: "You do not have access to this field",
      });
      return;
    }

    const dashboard = await dashboardService.getFieldDashboard(fieldId);

    if (!dashboard) {
      res.status(404).json({
        success: false,
        error: "Field not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: dashboard,
    });
  } catch (error) {
    logger.error("Get field dashboard error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}

// create a new field with zones
export async function createField(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
      });
      return;
    }

    const { fieldName, cropName, fieldType, polygon, area, zones, farmId } = req.body;

    if (!fieldName || !fieldType || !polygon || area == null || !zones) {
      res.status(400).json({
        success: false,
        error: "Missing required fields: fieldName, fieldType, polygon, area, zones",
      });
      return;
    }

    if (fieldType !== "greenhouse" && fieldType !== "pot") {
      res.status(400).json({
        success: false,
        error: "fieldType must be greenhouse or pot",
      });
      return;
    }

    const field = await dashboardService.createField(userId, {
      fieldName,
      cropName,
      fieldType,
      polygon,
      area,
      zones,
      farmId,
    });

    res.status(201).json({
      success: true,
      data: field,
    });
  } catch (error: any) {
    if (error.message === "NO_FARM") {
      res.status(400).json({
        success: false,
        error: "User has no farm. Please create a farm first.",
      });
      return;
    }
    logger.error("Create field error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}

// create a new farm
export async function createFarm(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
      });
      return;
    }

    const { name, latitude, longitude, altitude_m } = req.body;

    if (!name?.trim()) {
      res.status(400).json({
        success: false,
        error: "Farm name is required",
      });
      return;
    }

    if (latitude == null || longitude == null) {
      res.status(400).json({
        success: false,
        error: "Latitude and longitude are required",
      });
      return;
    }

    if (latitude < -90 || latitude > 90) {
      res.status(400).json({
        success: false,
        error: "Latitude must be between -90 and 90",
      });
      return;
    }

    if (longitude < -180 || longitude > 180) {
      res.status(400).json({
        success: false,
        error: "Longitude must be between -180 and 180",
      });
      return;
    }

    const farm = await dashboardService.createFarm(userId, {
      name: name.trim(),
      latitude,
      longitude,
      altitude_m: altitude_m ?? null,
    });

    res.status(201).json({
      success: true,
      data: farm,
    });
  } catch (error) {
    logger.error("Create farm error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}

// get elevation for a coordinate
export async function getElevation(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const lat = parseFloat(req.query.latitude as string);
    const lng = parseFloat(req.query.longitude as string);

    if (isNaN(lat) || isNaN(lng)) {
      res.status(400).json({
        success: false,
        error: "Valid latitude and longitude query params are required",
      });
      return;
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      res.status(400).json({
        success: false,
        error: "Latitude must be -90..90, longitude must be -180..180",
      });
      return;
    }

    const altitude_m = await dashboardService.getElevation(lat, lng);

    res.json({
      success: true,
      data: { altitude_m },
    });
  } catch (error) {
    logger.error("Elevation lookup error:", error);
    res.status(502).json({
      success: false,
      error: "Could not fetch elevation data",
    });
  }
}

// list available crops
export async function getCrops(_req: Request, res: Response): Promise<void> {
  try {
    const crops = await dashboardService.getCropList();
    res.status(200).json({ success: true, data: crops });
  } catch (error) {
    logger.error("Get crops error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}

export default {
  getFields,
  getFieldDashboard,
  createField,
  createFarm,
  getElevation,
  getCrops,
};
