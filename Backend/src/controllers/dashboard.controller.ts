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

    const fields = await dashboardService.getUserFields(userId);

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

export default {
  getFields,
  getFieldDashboard,
};
