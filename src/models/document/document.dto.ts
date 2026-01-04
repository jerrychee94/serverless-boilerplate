import { IsString, IsOptional, IsArray, IsNumber, IsBoolean, Min, Max, IsUrl, ArrayMaxSize } from 'class-validator';
import { BaseReqModel, BaseResponseModel } from '../common.dto';
import { Document } from './document.model';

/**
 * @swagger
 * components:
 *   schemas:
 *     DocumentRequest:
 *       type: object
 *       required:
 *         - fileUri
 *         - ownerId
 *       properties:
 *         fileUri:
 *           type: string
 *           description: S3 URI in format s3://bucket/key
 *           example: s3://destination-bucket-name/path/to/file.pdf
 *         ownerId:
 *           type: string
 *           description: Owner identifier
 *           example: owner123
 *         referenceId:
 *           type: string
 *           description: Optional external reference ID
 *         redirectUrl:
 *           type: string
 *           format: uri
 *           description: Optional redirect URL after upload
 *         webhookUrl:
 *           type: array
 *           items:
 *             type: string
 *             format: uri
 *           maxItems: 10
 *           description: Optional webhook URLs (max 10)
 *         limitFileSizeInBytes:
 *           type: number
 *           minimum: 1
 *           maximum: 12582912
 *           description: Optional file size limit in bytes (max 12MB)
 *         expireInSecs:
 *           type: number
 *           minimum: 60
 *           maximum: 3600
 *           description: Optional expiration time in seconds (60-3600)
 *         useOriginalFileName:
 *           type: boolean
 *           description: Use original filename
 */
export class CreateDocumentDto extends BaseReqModel {
  fileUri!: string;

  ownerId!: string;

  referenceId?: string;

  redirectUrl?: string;

  webhookUrl?: string[];

  limitFileSizeInBytes?: number;

  expireInSecs?: number;

  useOriginalFileName?: boolean;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     PresignedPost:
 *       type: object
 *       properties:
 *         url:
 *           type: string
 *           format: uri
 *         fields:
 *           type: object
 *           additionalProperties:
 *             type: string
 *         method:
 *           type: string
 *           example: POST
 */
export interface PresignedPost {
  url: string;
  fields: Record<string, string>;
  method: string;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     DocumentResponse:
 *       allOf:
 *         - $ref: '#/components/schemas/Document'
 *         - type: object
 *           properties:
 *             presignedPost:
 *               $ref: '#/components/schemas/PresignedPost'
 *             error:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                 name:
 *                   type: string
 *                 message:
 *                   type: string
 */
export class DocumentResponse extends BaseResponseModel implements Document {
  id!: string;
  ownerId!: string;
  docType?: string;
  bucket!: string;
  fileKey!: string;
  fileName!: string;
  originalFileName?: string;
  fileSize?: number;
  fileMD5?: string;
  scanStatus!: string;
  scannedAt?: string;
  uploaded!: number;
  uploadedAt?: string;
  uploadedCount?: number;
  referenceId?: string;
  redirectUrl?: string;
  webhookUrl?: string[];
  correlationId?: string;
  processingLock?: any;
  processingAttempts?: number;
  lastProcessedAt?: string;
  webhookDeliveryStatus?: any[];
  createdDate!: string;
  expires?: number;
  createdAt?: string;
  updatedAt?: string;

  presignedPost?: PresignedPost;
  error?: {
    statusCode: number;
    name: string;
    message: string;
  };
}