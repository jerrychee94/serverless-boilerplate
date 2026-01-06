import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import autoBind from 'auto-bind';
import dynamoose from 'dynamoose';
import { config } from '../../config';
import { DatabaseLogger, AppLogger } from '../../config/logger';

export enum TableUpdateOptions {
  ttl = 'ttl',
  indexes = 'indexes',
  throughput = 'throughput',
  tags = 'tags',
  tableClass = 'tableClass',
}

// Configure DynamoDB defaults
dynamoose.Table.defaults.set({
  create: !!config.dynamodb.endpoint, // Create tables in local development
  waitForActive: !!config.dynamodb.endpoint, // Wait for active in local
  throughput: 'ON_DEMAND',
  prefix: config.dynamodb.tablePrefix,
});

export class AWSDynamoDB {
  constructor() {
    autoBind(this);
  }

  public static initDB() {
    try {
      if (config.dynamodb.endpoint) {
        // Local development
        dynamoose.aws.ddb.local(config.dynamodb.endpoint);
        AppLogger.info('DynamoDB initialized for local development', {
          endpoint: config.dynamodb.endpoint,
        });
      } else {
        // AWS production
        const ddb = new DynamoDB({
          region: config.dynamodb.region,
          requestHandler: new NodeHttpHandler({
            requestTimeout: 5000,
            connectionTimeout: 1000
          }),
          maxAttempts: 3,
          retryMode: 'adaptive',
        });

        dynamoose.aws.ddb.set(ddb);
        AppLogger.info('DynamoDB initialized for AWS', {
          region: config.dynamodb.region,
        });
      }
    } catch (error: any) {
      AppLogger.error('Failed to setup DynamoDB connection', error);
      throw new Error('Failed to setup DynamoDB connection');
    }
  }

  /**
   * Get table name with prefix
   */
  public static getTableName(tableName: string): string {
    return `${config.dynamodb.tablePrefix}${tableName}`;
  }

  /**
   * Initialize table
   * In Dynamoose v4, tables are created automatically based on Table.defaults.set() configuration
   * This method triggers table initialization by performing a scan operation
   */
  public static async ensureTable(
    model: any,
    options: Partial<Record<TableUpdateOptions, any>> = {}
  ) {
    try {
      const tableName = model.name;
      
      AppLogger.info('Table initialization started', {
        tableName,
        environment: config.dynamodb.endpoint ? 'local' : 'production',
      });
      
      // Trigger table creation by performing a scan with limit 0
      // This will create the table if create: true is set in defaults
      await model.scan().limit(0).exec();
      
      AppLogger.info('Table initialized successfully', {
        tableName,
        autoCreate: !!config.dynamodb.endpoint,
      });
    } catch (error: any) {
      AppLogger.error('Failed to ensure table', error, { options });
      throw error;
    }
  }
}

export default dynamoose;