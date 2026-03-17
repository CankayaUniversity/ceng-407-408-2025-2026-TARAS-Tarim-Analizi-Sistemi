import { Router } from "express";
import { getTarasAdvice } from "../controllers/advisory.controller";

const router = Router();

router.post("/", getTarasAdvice);

export default router;
