import { Router } from 'express';
import * as imageController from '../controllers/image.controller';

const router = Router();

router.post('/upload', imageController.uploadCropImage);
router.post('/presigned-upload', imageController.getPresignedUploadUrl);
router.get('/presigned-download', imageController.getPresignedDownloadUrl);
router.get('/field/:fieldId', imageController.listFieldImages);

export default router;
