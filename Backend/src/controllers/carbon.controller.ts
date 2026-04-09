import { Request, Response } from "express";
import carbonService from "../services/carbonService";
import logger from "../utils/logger";
import { getStringParam, getDateParam } from "../utils/requestHelpers";
import { ActivityTypeCategory } from "../generated/prisma";

const VALID_CATEGORIES = ["YAKIT", "GUBRE", "ELEKTRIK"];

/** GET /carbon/activity-types — kategoriye göre gruplanmış activity type listesi */
export async function getActivityTypes(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const grouped = await carbonService.getActivityTypes();

    res.status(200).json({
      success: true,
      data: grouped,
    });
  } catch (error) {
    logger.error("Get activity types error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}

/** GET /carbon/farm/:farmId/logs — farm'ın carbon log kayıtları */
export async function getFarmLogs(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;
    const farmId = getStringParam(req.params.farmId);

    if (!userId) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    if (!farmId) {
      res.status(400).json({ success: false, error: "Farm ID is required" });
      return;
    }

    const hasAccess = await carbonService.checkFarmAccess(userId, farmId);
    if (!hasAccess) {
      res.status(403).json({ success: false, error: "You do not have access to this farm" });
      return;
    }

    const startDate = getDateParam(req.query.startDate);
    const endDate = getDateParam(req.query.endDate);
    const categoryParam = getStringParam(req.query.category);
    const category = categoryParam && VALID_CATEGORIES.includes(categoryParam)
      ? (categoryParam as ActivityTypeCategory)
      : undefined;

    const logs = await carbonService.getFarmLogs(farmId, {
      startDate,
      endDate,
      category,
    });

    res.status(200).json({
      success: true,
      data: logs,
    });
  } catch (error) {
    logger.error("Get farm carbon logs error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}

/** POST /carbon/farm/:farmId/logs — yeni carbon log kaydı */
export async function createCarbonLog(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;
    const farmId = getStringParam(req.params.farmId);

    if (!userId) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    if (!farmId) {
      res.status(400).json({ success: false, error: "Farm ID is required" });
      return;
    }

    const hasAccess = await carbonService.checkFarmAccess(userId, farmId);
    if (!hasAccess) {
      res.status(403).json({ success: false, error: "You do not have access to this farm" });
      return;
    }

    const { activity_type_id, activity_date, activity_amount, notes } = req.body;

    if (!activity_type_id || !activity_date || activity_amount == null) {
      res.status(400).json({
        success: false,
        error: "activity_type_id, activity_date, and activity_amount are required",
      });
      return;
    }

    if (typeof activity_amount !== "number" || activity_amount <= 0) {
      res.status(400).json({
        success: false,
        error: "activity_amount must be a positive number",
      });
      return;
    }

    const log = await carbonService.createCarbonLog(farmId, {
      activity_type_id,
      activity_date,
      activity_amount,
      notes,
    });

    res.status(201).json({
      success: true,
      data: log,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("No emission factor") ? 400 : 500;
    logger.error("Create carbon log error:", error);
    res.status(status).json({
      success: false,
      error: message,
    });
  }
}

/** DELETE /carbon/farm/:farmId/logs/:logId — carbon log kaydını sil */
export async function deleteCarbonLog(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;
    const farmId = getStringParam(req.params.farmId);
    const logId = getStringParam(req.params.logId);

    if (!userId) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    if (!farmId || !logId) {
      res.status(400).json({ success: false, error: "Farm ID and Log ID are required" });
      return;
    }

    const hasAccess = await carbonService.checkFarmAccess(userId, farmId);
    if (!hasAccess) {
      res.status(403).json({ success: false, error: "You do not have access to this farm" });
      return;
    }

    const deleted = await carbonService.deleteCarbonLog(logId, farmId);

    if (!deleted) {
      res.status(404).json({ success: false, error: "Carbon log not found" });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Carbon log deleted",
    });
  } catch (error) {
    logger.error("Delete carbon log error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}

/** GET /carbon/farm/:farmId/summary — karbon ayak izi özeti */
export async function getFarmSummary(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;
    const farmId = getStringParam(req.params.farmId);

    if (!userId) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    if (!farmId) {
      res.status(400).json({ success: false, error: "Farm ID is required" });
      return;
    }

    const hasAccess = await carbonService.checkFarmAccess(userId, farmId);
    if (!hasAccess) {
      res.status(403).json({ success: false, error: "You do not have access to this farm" });
      return;
    }

    const startDate = getDateParam(req.query.startDate);
    const endDate = getDateParam(req.query.endDate);

    const summary = await carbonService.getFarmSummary(
      farmId,
      startDate,
      endDate,
    );

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    logger.error("Get farm carbon summary error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}

/** GET /carbon/emission-factors — tüm emission factor listesi */
export async function getEmissionFactors(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const factors = await carbonService.getEmissionFactors();

    res.status(200).json({
      success: true,
      data: factors,
    });
  } catch (error) {
    logger.error("Get emission factors error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}

/** POST /carbon/emission-factors — yeni emission factor ekle */
export async function createEmissionFactor(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;

    if (!userId) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    const { activity_type_id, emission_factor, source, used_from, used_until } =
      req.body;

    if (!activity_type_id || emission_factor == null || !used_from) {
      res.status(400).json({
        success: false,
        error: "activity_type_id, emission_factor, and used_from are required",
      });
      return;
    }

    const factor = await carbonService.createEmissionFactor({
      activity_type_id,
      emission_factor,
      source,
      used_from,
      used_until,
    });

    res.status(201).json({
      success: true,
      data: factor,
    });
  } catch (error) {
    logger.error("Create emission factor error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}

export default {
  getActivityTypes,
  getFarmLogs,
  createCarbonLog,
  deleteCarbonLog,
  getFarmSummary,
  getEmissionFactors,
  createEmissionFactor,
};
