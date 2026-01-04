import dynamoose from './database.service';
import { DocumentModel } from '../../schemas/aws/document.schema';
import { DatabaseLogger, AppLogger } from '../../config/logger';
import { AWSDynamoDB } from './database.service';

export class AWSDocumentService extends AWSDynamoDB {
  constructor() {
    super();
    AppLogger.info('AWS Document service initialized', {
      tableName: DocumentModel.table.name,
    });
  }

  /**
   * Get document by id and ownerId
   */
  async getDocument(id: string, ownerId: string, correlationId?: string) {
    try {
      DatabaseLogger.debug('Getting document from DynamoDB', { id, ownerId }, correlationId);

      const document = await DocumentModel.get({ id, ownerId });

      if (document) {
        DatabaseLogger.debug('Document retrieved', { id, ownerId }, correlationId);
        return document.toJSON();
      } else {
        DatabaseLogger.debug('Document not found', { id, ownerId }, correlationId);
        return null;
      }
    } catch (error: any) {
      DatabaseLogger.error('Error getting document from DynamoDB', error, { id, ownerId }, correlationId);
      throw error;
    }
  }

  /**
   * Create document
   */
  async createDocument(document: any, correlationId?: string) {
    try {
      DatabaseLogger.debug('Creating document in DynamoDB', { documentId: document.id }, correlationId);

      const doc = new DocumentModel(document);
      const savedDoc = await doc.save();

      DatabaseLogger.info('Document created successfully', { documentId: document.id }, correlationId);
      return savedDoc.toJSON();
    } catch (error: any) {
      DatabaseLogger.error('Error creating document', error, { documentId: document.id }, correlationId);
      throw error;
    }
  }

  /**
   * Update document with conditional update support
   */
  async updateDocument(
    id: string,
    ownerId: string,
    updates: Record<string, any>,
    correlationId?: string,
    condition?: any
  ) {
    try {
      DatabaseLogger.debug('Updating document in DynamoDB', { id, ownerId, updates }, correlationId);

      const updateQuery = DocumentModel.update({ id, ownerId }, updates);

      if (condition) {
        updateQuery.condition(condition);
      }

      const updatedDoc = await updateQuery.return(dynamoose.Condition.ALL_NEW);

      DatabaseLogger.info('Document updated successfully', { id, ownerId }, correlationId);
      return updatedDoc.toJSON();
    } catch (error: any) {
      if (error.name === 'ValidationException' && error.message.includes('ConditionalCheckFailed')) {
        DatabaseLogger.warn('Conditional update failed', { id, ownerId }, correlationId);
        const conditionalError = new Error('ConditionalCheckFailed') as any;
        conditionalError.name = 'ConditionalCheckFailedException';
        throw conditionalError;
      }
      DatabaseLogger.error('Error updating document', error, { id, ownerId }, correlationId);
      throw error;
    }
  }

  /**
   * Query documents by ownerId
   */
  async queryByOwnerId(
    ownerId: string,
    indexName?: string,
    limit?: number,
    correlationId?: string
  ) {
    try {
      DatabaseLogger.debug('Querying documents by ownerId', { ownerId, indexName, limit }, correlationId);

      let query = DocumentModel.query('ownerId').eq(ownerId);

      if (indexName) {
        query = query.using(indexName);
      }

      if (limit) {
        query = query.limit(limit);
      }

      const results = await query.exec();
      const documents = results.map(doc => doc.toJSON());

      DatabaseLogger.debug('Query completed', {
        ownerId,
        count: documents.length,
      }, correlationId);

      return documents;
    } catch (error: any) {
      DatabaseLogger.error('Error querying documents', error, { ownerId }, correlationId);
      throw error;
    }
  }

  /**
   * Delete document
   */
  async deleteDocument(id: string, ownerId: string, correlationId?: string) {
    try {
      DatabaseLogger.debug('Deleting document from DynamoDB', { id, ownerId }, correlationId);

      await DocumentModel.delete({ id, ownerId });

      DatabaseLogger.info('Document deleted successfully', { id, ownerId }, correlationId);
      return true;
    } catch (error: any) {
      DatabaseLogger.error('Error deleting document', error, { id, ownerId }, correlationId);
      throw error;
    }
  }

  /**
   * Initialize tables (call this during app startup)
   */
  public static async initTables() {
    await AWSDynamoDB.ensureTable(DocumentModel, {
      [AWSDynamoDB.TableUpdateOptions.throughput]: 'ON_DEMAND',
    });
  }
}

export const awsDocumentService = new AWSDocumentService();