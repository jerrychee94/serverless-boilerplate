/**
 * @swagger
 * components:
 *   schemas:
 *     Document:
 *       type: object
 *       required:
 *         - id
 *         - ownerId
 *         - bucket
 *         - fileKey
 *         - fileName
 *         - scanStatus
 *         - uploaded
 *         - createdDate
 *       properties:
 *         id:
 *           type: string
 *           description: Document ID
 *         ownerId:
 *           type: string
 *           description: Owner identifier
 *         docType:
 *           type: string
 *           enum: [document, image, unknown]
 *         bucket:
 *           type: string
 *           description: Destination S3 bucket name
 *         fileKey:
 *           type: string
 *           description: S3 object key in destination bucket
 *         fileName:
 *           type: string
 *           description: System-generated filename
 *         originalFileName:
 *           type: string
 *         fileSize:
 *           type: number
 *         fileMD5:
 *           type: string
 *         scanStatus:
 *           type: string
 *           enum: [PENDING, CLEAN, INFECTED, PROCCESSING_ERROR, SKIPPED]
 *         scannedAt:
 *           type: string
 *           format: date-time
 *         uploaded:
 *           type: number
 *           enum: [0, 1]
 *         uploadedAt:
 *           type: string
 *           format: date-time
 *         uploadedCount:
 *           type: number
 *         referenceId:
 *           type: string
 *         redirectUrl:
 *           type: string
 *         webhookUrl:
 *           type: array
 *           items:
 *             type: string
 *         correlationId:
 *           type: string
 *         processingLock:
 *           type: object
 *         processingAttempts:
 *           type: number
 *         lastProcessedAt:
 *           type: string
 *           format: date-time
 *         webhookDeliveryStatus:
 *           type: array
 *         createdDate:
 *           type: string
 *         expires:
 *           type: number
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

export enum DocType {
  DOCUMENT = 'document',
  IMAGE = 'image',
  UNKNOWN = 'unknown',
}

export enum ScanStatus {
  PENDING = 'PENDING',
  CLEAN = 'CLEAN',
  INFECTED = 'INFECTED',
  PROCCESSING_ERROR = 'PROCCESSING_ERROR',
  SKIPPED = 'SKIPPED',
}

export interface ProcessingLock {
  timestamp: number;
  expiresAt: number;
}

export interface WebhookDeliveryStatus {
  url: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'RETRYING';
  attempts: number;
  lastAttemptAt?: string;
  error?: string;
}

export interface Document {
  id: string;
  ownerId: string;
  docType?: string;
  bucket: string;
  fileKey: string;
  fileName: string;
  originalFileName?: string;
  fileSize?: number;
  fileMD5?: string;
  scanStatus: string;
  scannedAt?: string;
  uploaded: number; // 0 = not uploaded, 1 = uploaded
  uploadedAt?: string;
  uploadedCount?: number;
  referenceId?: string;
  redirectUrl?: string;
  webhookUrl?: string[];
  correlationId?: string;
  processingLock?: ProcessingLock;
  processingAttempts?: number;
  lastProcessedAt?: string;
  webhookDeliveryStatus?: WebhookDeliveryStatus[];
  createdDate: string; // YYYYMMDD
  expires?: number; // TTL timestamp (-1 = no expiration)
  createdAt?: string;
  updatedAt?: string;
}