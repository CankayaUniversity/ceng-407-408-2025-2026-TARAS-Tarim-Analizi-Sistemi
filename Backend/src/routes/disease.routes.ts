import { Router } from 'express';
import multer from 'multer';
import * as diseaseController from '../controllers/disease.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (_req, file, cb) => {
    // Accept image files only
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// Health check (public)
router.get('/health', diseaseController.healthCheck);

// All other routes require authentication
router.use(authenticateToken);

// Submit a new disease detection request
// POST /api/disease/submit
// Form-data: image (file, required)
router.post('/submit', upload.single('image'), diseaseController.submitDetection);

// Get all disease detection requests for the authenticated user
// GET /api/disease/requests
router.get('/requests', diseaseController.getUserDetectionRequests);

// Get a specific disease detection request by ID
// GET /api/disease/requests/:detectionId
router.get('/requests/:detectionId', diseaseController.getDetectionRequest);

// Get presigned URL to view the detection image
// GET /api/disease/requests/:detectionId/image
router.get('/requests/:detectionId/image', diseaseController.getDetectionImage);

// Delete a disease detection request
// DELETE /api/disease/requests/:detectionId
router.delete('/requests/:detectionId', diseaseController.deleteDetectionRequest);

export default router;
