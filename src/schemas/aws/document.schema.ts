import dynamoose from '../../services/aws/database.service';

// Document Schema Definition
export const DocumentSchema = new dynamoose.Schema(
  {
    id: {
      type: String,
      hashKey: true,
      required: true,
    },
    ownerId: {
      type: String,
      rangeKey: true,
      required: true,
      index: {
        name: 'ownerDocsGI',
        type: 'global',
        rangeKey: 'id',
      },
    },
    docType: {
      type: String,
      enum: ['document', 'image', 'unknown'],
      index: [
        {
          name: 'docTypeCreatedGI',
          type: 'global',
          rangeKey: 'createdAt',
        },
        {
          name: 'docTypeUploadedGI',
          type: 'global',
          rangeKey: 'uploaded',
        },
      ],
    },
    bucket: {
      type: String,
      required: true,
      index: {
        name: 'docBucketTypeGI',
        type: 'global',
        rangeKey: 'docType',
      },
    },
    fileKey: {
      type: String,
      required: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    originalFileName: String,
    fileSize: Number,
    fileMD5: String,
    scanStatus: {
      type: String,
      required: true,
      enum: ['PENDING', 'CLEAN', 'INFECTED', 'PROCCESSING_ERROR', 'SKIPPED'],
      default: 'PENDING',
    },
    scannedAt: Date,
    uploaded: {
      type: Number,
      required: true,
      default: 0,
    },
    uploadedAt: {
      type: Date,
      index: {
        name: 'ownerDocsUploadedGI',
        type: 'global',
        rangeKey: 'uploadedAt',
      },
    },
    uploadedCount: {
      type: Number,
      default: 0,
    },
    referenceId: String,
    redirectUrl: String,
    webhookUrl: {
      type: Array,
      schema: [String],
    },
    correlationId: String,
    processingLock: {
      type: Object,
      schema: {
        timestamp: Date,
        expiresAt: Date,
      },
    },
    processingAttempts: {
      type: Number,
      default: 0,
    },
    lastProcessedAt: Date,
    webhookDeliveryStatus: {
      type: Array,
      schema: [
        {
          type: Object,
          schema: {
            url: String,
            status: String,
            attempts: Number,
            lastAttemptAt: Date,
          },
        },
      ],
    },
    createdDate: {
      type: String,
      required: true,
    },
    expires: {
      type: Number,
      default: -1,
    },
  },
  {
    timestamps: {
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
  }
);

// Create Model
export const DocumentModel = dynamoose.model('Document', DocumentSchema);