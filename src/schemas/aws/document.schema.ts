// import dynamoose from '../../services/aws/database.service';

// Stub schema definition until dynamoose is available
export const DocumentSchema = {
  // TODO: Replace with actual dynamoose schema when dependencies are installed
  id: String,
  ownerId: String,
  docType: String,
  bucket: String,
  fileKey: String,
  fileName: String,
  originalFileName: String,
  fileSize: Number,
  fileMD5: String,
  scanStatus: String,
  scannedAt: Date,
  uploaded: Number,
  uploadedAt: Date,
  uploadedCount: Number,
  referenceId: String,
  redirectUrl: String,
  webhookUrl: Array,
  correlationId: String,
  processingLock: Object,
  processingAttempts: Number,
  lastProcessedAt: Date,
  webhookDeliveryStatus: Object,
  createdDate: String,
  expires: Number,
} as any;

// Create Model
// export const DocumentModel = dynamoose.model('Document', DocumentSchema);

// Stub model until dynamoose is available
export const DocumentModel = {
  table: {
    name: 'Document',
    create: async () => {},
    exists: async () => true,
    update: async () => {},
    delete: async () => {},
  },
  get: async () => ({}),
  update: () => ({ return: () => ({}) }),
  query: () => ({ exec: async () => [] }),
  delete: async () => ({}),
} as any;