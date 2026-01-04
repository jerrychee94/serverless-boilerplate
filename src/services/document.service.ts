import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import * as mime from 'mime-types';
import { config } from '../config';
import { AppLogger } from '../config/logger';
import { Document, ScanStatus, DocType } from '../models/document';
import { CreateDocumentDto, DocumentResponse, PresignedPost } from '../models/document';
import { awsDocumentService } from './aws/document.service';

export class DocumentService {
  private s3Client: S3Client;

  constructor() {
    this.s3Client = new S3Client({
      region: config.s3.region,
      endpoint: config.dynamodb.endpoint, // For local S3 (localstack)
      credentials: config.dynamodb.endpoint
        ? {
            accessKeyId: 'test',
            secretAccessKey: 'test',
          }
        : undefined,
    });
  }

  /**
   * Generate unique document ID
   */
  private generateDocumentId(): string {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    const randomId = Math.random().toString(36).substring(2, 12); // 10 chars
    return `${dateStr}${randomId}`;
  }

  /**
   * Determine file type from extension
   */
  private getFileType(fileName: string): DocType {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (!ext) return DocType.UNKNOWN;

    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'svg'];
    if (imageExts.includes(ext)) {
      return DocType.IMAGE;
    }

    return DocType.DOCUMENT;
  }

  /**
   * Generate system filename
   */
  private generateSystemFileName(originalName: string): string {
    const ext = originalName.split('.').pop() || 'unknown';
    return `file_${Date.now()}.${ext}`;
  }

  /**
   * Parse S3 URI
   */
  private parseS3Uri(s3Uri: string): { bucket: string; key: string } {
    const match = s3Uri.match(/^s3:\/\/([^\/]+)\/(.+)$/);
    if (!match) {
      throw new Error('Invalid S3 URI format. Expected: s3://bucket/key');
    }
    return {
      bucket: match[1],
      key: match[2],
    };
  }

  /**
   * Validate bucket exists
   */
  private async validateBucket(bucketName: string, correlationId?: string): Promise<void> {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
      AppLogger.debug('Bucket validation successful', { bucketName }, correlationId);
    } catch (error: any) {
      AppLogger.error('Bucket validation failed', error, { bucketName }, correlationId);
      throw new Error(`Destination bucket '${bucketName}' does not exist or is not accessible`);
    }
  }

  /**
   * Create document and generate presigned URL
   */
  async createDocument(dto: CreateDocumentDto, correlationId?: string): Promise<DocumentResponse> {
    try {
      AppLogger.info('Creating document', { ownerId: dto.ownerId, fileUri: dto.fileUri }, correlationId);

      // Parse S3 URI
      const { bucket, key: fileKey } = this.parseS3Uri(dto.fileUri);

      // Validate bucket exists
      await this.validateBucket(bucket, correlationId);

      // Generate document ID
      const documentId = this.generateDocumentId();

      // Determine file type and generate filename
      const fileName = this.generateSystemFileName(fileKey.split('/').pop() || 'unknown');
      const docType = this.getFileType(fileName);

      // Generate S3 scanner key
      const scannerKey = `${config.s3.scannerPath}${docType}/${dto.ownerId}/${documentId}/${bucket}/${fileKey}`;

      // Generate presigned POST URL
      const presignedPost = await this.generatePresignedPost(
        config.s3.scannerBucket,
        scannerKey,
        fileName,
        dto.expireInSecs,
        dto.limitFileSizeInBytes,
        dto.useOriginalFileName,
        correlationId
      );

      // Create document record
      const document: Document = {
        id: documentId,
        ownerId: dto.ownerId,
        docType,
        bucket,
        fileKey,
        fileName,
        scanStatus: ScanStatus.PENDING,
        uploaded: 0,
        referenceId: dto.referenceId,
        redirectUrl: dto.redirectUrl,
        webhookUrl: dto.webhookUrl,
        correlationId,
        processingAttempts: 0,
        createdDate: new Date().toISOString().split('T')[0].replace(/-/g, ''),
        expires: -1, // No expiration
      };

      // Save to DynamoDB
      await awsDocumentService.createDocument(document, correlationId);

      // Return response with presigned URL
      const response = new DocumentResponse();
      Object.assign(response, document);
      response.presignedPost = presignedPost;

      AppLogger.info('Document created successfully', { documentId }, correlationId);
      return response;
    } catch (error: any) {
      AppLogger.error('Error creating document', error, { ownerId: dto.ownerId }, correlationId);
      throw error;
    }
  }

  /**
   * Generate presigned POST URL for S3 upload
   */
  private async generatePresignedPost(
    bucket: string,
    key: string,
    systemFileName: string,
    expireInSecs: number = 300,
    limitFileSize?: number,
    useOriginalFileName?: boolean,
    correlationId?: string
  ): Promise<PresignedPost> {
    try {
      const fields: Record<string, string> = {
        'key': key,
        'Content-Type': mime.lookup(systemFileName) || 'application/octet-stream',
        'x-amz-meta-systemfilename': systemFileName,
        'x-amz-meta-useoriginalfilename': useOriginalFileName ? 'enabled' : 'disabled',
      };

      const conditions: any[] = [
        ['eq', '$Content-Type', fields['Content-Type']],
        ['content-length-range', 1, limitFileSize || 12582912], // 12MB default
      ];

      const { url, fields: presignedFields } = await createPresignedPost(
        this.s3Client,
        {
          Bucket: bucket,
          Key: key,
          Fields: fields,
          Conditions: conditions,
          Expires: expireInSecs,
        }
      );

      AppLogger.debug('Presigned POST URL generated', { bucket, key }, correlationId);

      return {
        url,
        fields: presignedFields,
        method: 'POST',
      };
    } catch (error: any) {
      AppLogger.error('Error generating presigned POST URL', error, { bucket, key }, correlationId);
      throw error;
    }
  }

  /**
   * Get document by ID
   */
  async getDocument(ownerId: string, documentId: string, correlationId?: string): Promise<Document | null> {
    try {
      AppLogger.debug('Getting document', { ownerId, documentId }, correlationId);

      const document = await awsDocumentService.getDocument(documentId, ownerId, correlationId);

      if (document) {
        AppLogger.debug('Document found', { documentId }, correlationId);
      } else {
        AppLogger.warn('Document not found', { ownerId, documentId }, correlationId);
      }

      return document;
    } catch (error: any) {
      AppLogger.error('Error getting document', error, { ownerId, documentId }, correlationId);
      throw error;
    }
  }
}

export const documentService = new DocumentService();