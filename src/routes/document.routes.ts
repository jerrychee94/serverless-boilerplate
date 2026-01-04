import { Router } from 'express';
import { createDocument, getDocument } from '../controllers/document.controller';

const router: ReturnType<typeof Router> = Router();

/**
 * @swagger
 * tags:
 *   name: Documents
 *   description: Document management endpoints
 */

router.post('/create', createDocument);
router.get('/:ownerId/:documentId', getDocument);

export default router;