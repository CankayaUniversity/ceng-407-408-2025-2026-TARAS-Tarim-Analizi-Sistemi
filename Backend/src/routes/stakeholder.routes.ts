import { Router } from "express";
import {
  createInvite,
  acceptInvite,
  getMyStakeholderFarms,
  listFarmStakeholders,
  listFarmInvites,
  revokeStakeholder,
  changeMemberRole,
  revokeInvite,
} from "../controllers/stakeholder.controller";
import { authenticateToken } from "../middleware/auth.middleware";
import { authLimiter } from "../middleware/authLimiter";

const router = Router();

router.use(authenticateToken);

// Ciftci: kendi ciftligi icin davet kodu uret / aktif kodlari listele / erisim iptal et
router.post("/farms/:farmId/invite", createInvite);
router.get("/farms/:farmId/invites", listFarmInvites);
router.delete("/farms/:farmId/stakeholders/:userId", revokeStakeholder);
// Sahip: bir uyenin rolunu degistir (stakeholder <-> farmer)
router.patch("/farms/:farmId/members/:userId/role", changeMemberRole);
// Uyeler: ciftligin tum uyeleri + rolleri (sahip + paydas okur; sahip kaldirabilir)
router.get("/farms/:farmId/stakeholders", listFarmStakeholders);
// Ciftci: henuz kullanilmamis (PENDING) davet kodunu iptal et
router.post("/invites/:inviteId/revoke", revokeInvite);

// Paydas: gorebildigi ciftlikler + davet kabul (kod brute-force'a karsi rate-limit)
router.get("/farms", getMyStakeholderFarms);
router.post("/accept", authLimiter, acceptInvite);

export default router;
