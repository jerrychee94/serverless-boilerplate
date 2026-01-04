import dotenv from 'dotenv';

dotenv.config();

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  region: process.env.REGION || 'ap-southeast-1',
  serviceName: process.env.SERVICE_NAME || 'dms-service',
  stage: process.env.STAGE || 'dev',

  dynamodb: {
    tablePrefix: process.env.DYNAMODB_TABLE_PREFIX || 'dev_dms_Document',
    endpoint: process.env.DYNAMODB_ENDPOINT, // undefined for production
    region: process.env.AWS_REGION || 'ap-southeast-1',
  },

  s3: {
    scannerBucket: process.env.SCANNER_S3_BUCKET || 'scanner-bucket-dev',
    scannerPath: process.env.SCANNER_S3_PATH || 'quarantine/',
    region: process.env.AWS_REGION || 'ap-southeast-1',
  },

  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'ap-southeast-1',
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};