import { Request, Response, NextFunction } from 'express';
import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';
import { documentService } from '../services/document.service';
import { CreateDocumentDto, DocumentResponse } from '../models/document';
import { AppLogger } from '../config/logger';
import { AppError } from '../middleware/error.middleware';

/**
 * @swagger
 * /api/document/create:
 *   post:
 *     summary: Create a new document and generate presigned URL
 *     tags: [Documents]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DocumentRequest'
 *     responses:
 *       201:
 *         description: Document created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DocumentResponse'
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
export const createDocument = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const correlationId = (req as any).correlationId;

    // Transform and validate request
    const dto = plainToClass(CreateDocumentDto, req.body);
    const errors = await validate(dto);

    if (errors.length > 0) {
      const validationErrors = errors.map(error => ({
        field: error.property,
        constraints: error.constraints,
      }));

      const error = new Error('Validation failed') as AppError;
      error.statusCode = 400;
      error.data = validationErrors;
      return next(error);
    }

    // Create document
    const result = await documentService.createDocument(dto, correlationId);

    AppLogger.info('Document created via API', {
      documentId: result.id,
      ownerId: result.ownerId,
    }, correlationId);

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/document/{ownerId}/{documentId}:
 *   get:
 *     summary: Get document by ID
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: ownerId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Document found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Document'
 *       404:
 *         description: Document not found
 *       500:
 *         description: Server error
 */
export const getDocument = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { ownerId, documentId } = req.params;
    const correlationId = (req as any).correlationId;

    const document = await documentService.getDocument(ownerId, documentId, correlationId);

    if (!document) {
      const error = new Error('Document not found') as AppError;
      error.statusCode = 404;
      return next(error);
    }

    AppLogger.info('Document retrieved via API', { documentId, ownerId }, correlationId);
    res.json(document);
  } catch (error) {
    next(error);
  }
};