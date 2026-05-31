import { Router } from 'express';
import dashboardController from '../controllers/dashboard.controller';
import { authenticateToken, requireFarmer } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);

router.get('/fields', dashboardController.getFields);
router.post('/fields', requireFarmer, dashboardController.createField);
router.get('/fields/:fieldId', dashboardController.getFieldDashboard);
// Sil: yalnizca field'in ciftliginin DIREKT sahibi (soft delete). Paydas/uyelik silemez.
router.delete('/fields/:fieldId', dashboardController.deleteField);
// Ilk ciftlik herkese acik — yeni (stakeholder varsayilan) kullanici kendi ciftligini
// olusturabilir ve bu islem onu farmer'a yukseltir. Field olusturma hala farmer ister.
router.post('/farms', dashboardController.createFarm);
// Sil: yalnizca DIREKT sahibi (Farm.user_id) silebilir. Paydas/uyelik silemez (controller'da
// kontrol edilir). Frontend trash ikonu is_owner ile gizlenir, backend de bagimsiz reddeder.
router.delete('/farms/:farmId', dashboardController.deleteFarm);
router.get('/elevation', dashboardController.getElevation);
router.get('/crops', dashboardController.getCrops);

export default router;
