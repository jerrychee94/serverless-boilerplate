import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import autoBind from 'auto-bind';
// import dynamoose from 'dynamoose'; // Temporarily disabled due to dependency issues
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
// dynamoose.Table.defaults.set({
//   create: !!config.dynamodb.endpoint, // Create tables in local development
//   waitForActive: !!config.dynamodb.endpoint, // Wait for active in local
//   throughput: 'ON_DEMAND',
//   prefix: config.dynamodb.tablePrefix,
// });

// TODO: Replace with direct AWS SDK DynamoDB configuration when dependencies are available

export class AWSDynamoDB {
  constructor() {
    autoBind(this);
  }

  public static initDB() {
    try {
      if (config.dynamodb.endpoint) {
        // Local development
        // dynamoose.aws.ddb.local(config.dynamodb.endpoint);
        AppLogger.info('DynamoDB initialized for local development (stub)', {
          endpoint: config.dynamodb.endpoint,
        });
      } else {
        // AWS production
        const ddb = new DynamoDBClient({
          region: config.dynamodb.region,
          // logger: DatabaseLogger, // Temporarily disabled
          requestHandler: new NodeHttpHandler({
            requestTimeout: 5000,
            connectionTimeout: 1000
          }),
          maxAttempts: 3,
          retryMode: 'adaptive',
        });

        // dynamoose.aws.ddb.set(ddb);
        AppLogger.info('DynamoDB initialized for AWS (stub)', {
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
   * Create or update table
   */
  public static async ensureTable(
    model: any,
    options: Partial<Record<TableUpdateOptions, any>> = {}
  ) {
    try {
      const table = model.table;

      if (config.dynamodb.endpoint) {
        // Local development - create table
        await table.create(options);
        AppLogger.info('Table created in local DynamoDB', {
          tableName: table.name,
        });
      } else {
        // Production - ensure table exists and is up to date
        const exists = await table.exists();
        if (!exists) {
          await table.create(options);
          AppLogger.info('Table created in production DynamoDB', {
            tableName: table.name,
          });
        } else {
          // Update table if needed
          await table.update(options);
          AppLogger.debug('Table updated', {
            tableName: table.name,
            options,
          });
        }
      }
    } catch (error: any) {
      AppLogger.error('Failed to ensure table', error, { options });
      throw error;
    }
  }
}

// export default dynamoose;

// Stub export until dynamoose is available
export default {
  Table: { defaults: { set: () => {} } },
  aws: { ddb: { local: () => {}, set: () => {} } },
  model: () => ({}),
  type: { ANY: {} },
} as any;