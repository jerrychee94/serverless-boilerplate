import dotenv from 'dotenv';

dotenv.config();

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  region: process.env.REGION || 'ap-southeast-1',
  serviceName: process.env.SERVICE_NAME || 'dms-service',
  stage: process.env.STAGE || 'dev',
  configName: process.env.CONFIG_NAME || 'dev',
 
  dynamodb: {
    tablePrefix: process.env.DYNAMODB_TABLE_PREFIX || 'dev_dms_Document',
    endpoint: process.env.DYNAMODB_ENDPOINT, // undefined for production
    region: process.env.AWS_REGION || 'ap-southeast-1',
  },

  s3: {
    scannerBucket: process.env.SCANNER_S3_BUCKET || 'scanner-bucket-dev',
    scannerPath: process.env.SCANNER_S3_PATH || 'quarantine/',
    region: process.env.AWS_REGION || 'ap-southeast-1',
    endpoint: process.env.S3_ENDPOINT, // For local S3-compatible storage (MinIO, LocalStack, Garage)
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true', // Required for MinIO and LocalStack
  },

  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'ap-southeast-1',
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },

  swagger: {
    title: process.env.SWAGGER_TITLE || 'DMS API',
    description: process.env.SWAGGER_DESCRIPTION || 'Document Management Service API Documentation',
    version: process.env.SWAGGER_VERSION || '1.0.0',
    server: process.env.SWAGGER_SERVER || '/api',
    contactName: process.env.CONTACT_NAME || 'API Support',
    contactEmail: process.env.CONTACT_EMAIL || 'jerrycheetest@gmail.com'
  },
};