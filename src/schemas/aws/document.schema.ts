import dynamoose from '../../../services/aws/database.service';

export const DocumentSchema = new dynamoose.Schema({
  id: {
    type: String,
    hashKey: true,
  },
  ownerId: {
    type: String,
    rangeKey: true,
  },
  docType: {
    type: String,
    enum: ['document', 'image', 'unknown'],
  },
  bucket: String,
  fileKey: String,
  fileName: String,
  originalFileName: String,
  fileSize: Number,
  fileMD5: String,
  scanStatus: {
    type: String,
    enum: ['PENDING', 'CLEAN', 'INFECTED', 'PROCCESSING_ERROR', 'SKIPPED'],
    required: true,
  },
  scannedAt: Date,
  uploaded: {
    type: Number,
    required: true,
  },
  uploadedAt: Date,
  uploadedCount: Number,
  referenceId: String,
  redirectUrl: String,
  webhookUrl: {
    type: dynamoose.type.ANY,
  },
  correlationId: String,
  processingLock: {
    type: dynamoose.type.ANY,
  },
  processingAttempts: {
    type: Number,
    default: 0,
  },
  lastProcessedAt: Date,
  webhookDeliveryStatus: {
    type: dynamoose.type.ANY,
  },
  createdDate: {
    type: String,
    required: true,
  },
  expires: Number,
}, {
  timestamps: true,
  saveUnknown: true,
});

// Create Model
export const DocumentModel = dynamoose.model('Document', DocumentSchema);