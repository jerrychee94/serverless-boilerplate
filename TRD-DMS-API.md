# Technical Requirements Document (TRD)
## Document Management Service (DMS) API

**Version:** 1.1  
**Date:** 2025-01-27  
**Last Updated:** 2025-01-27  
**Repository:** api-dms  
**Purpose:** Metadata storage and document upload orchestration service

---

## 1. Executive Summary

The DMS API is a serverless service that manages document metadata, generates presigned S3 upload URLs, processes scan results, and orchestrates file movements between S3 buckets. It integrates with a separate ClamAV scanner service to ensure uploaded files are virus-free before being stored in final destination buckets.

### Key Responsibilities
- Generate presigned S3 upload URLs for secure file uploads
- Store and manage document metadata in DynamoDB
- Process scan results from ClamAV scanner
- Move clean files to destination buckets
- Invoke webhooks for scan status updates
- Handle DynamoDB stream events for cleanup

---

## 2. Architecture Overview

### 2.1 System Flow

```
Frontend
  ↓
API Gateway (HTTP API)
  ↓
Lambda (apiLambda) - Generate Presigned URL
  ↓
DynamoDB (Store Metadata)
  ↓
Returns Presigned URL → Frontend
  ↓
Frontend Uploads File → S3 Scanner Bucket (quarantine/ prefix)
  ↓
[ClamAV Scanner Service scans file and tags it]
  ↓
S3 ObjectTagging:Put Event
  ↓
Lambda (apiLambda) - Process Scan Results
  ├─ If CLEAN: Copy to destination bucket, delete from scanner, update DynamoDB, webhook
  └─ If INFECTED: Update DynamoDB, webhook (file stays in quarantine)
```

### 2.2 Components

1. **API Lambda** (`apiLambda`)
   - HTTP API handler (Express via serverless-adapter)
   - S3 event handler (ObjectTagging:Put)
   - DynamoDB stream handler

2. **DynamoDB Table** (`Document`)
   - Stores document metadata
   - Hash Key: `id`
   - Range Key: `ownerId`
   - TTL: `expires` field (-1 = no expiration)

3. **S3 Service**
   - Presigned URL generation
   - File operations (copy, delete, metadata, tagging)

4. **Webhook Service**
   - HTTP POST to configured webhook URLs
   - Retry logic with axios

---

## 3. API Endpoints

### 3.1 Create Document (Generate Presigned URL)

**Endpoint:** `POST /api/document/create`  
**Authentication:** AWS IAM (SigV4)  
**Request Body:**

```json
{
  "fileUri": "s3://destination-bucket-name/path/to/file.pdf",
  "ownerId": "owner123",
  "referenceId": "ref-456",              // Optional
  "redirectUrl": "https://...",          // Optional
  "webhookUrl": ["https://webhook1", ...], // Optional, max 10 URLs
  "limitFileSizeInBytes": 10485760,      // Optional, max 12MB
  "expireInSecs": 300,                   // Optional, 60-3600 seconds
  "useOriginalFileName": true            // Optional
}
```

**Response:**

```json
{
  "id": "20250127abc123def456",
  "ownerId": "owner123",
  "bucket": "destination-bucket-name",
  "fileKey": "path/to/file.pdf",
  "fileName": "generated-filename.pdf",
  "scanStatus": "PENDING",
  "uploaded": 0,
  "createdDate": "20250127",
  "expires": "2025-01-27T12:00:00.000Z",
  "presignedPost": {
    "url": "https://scanner-bucket.s3.amazonaws.com/",
    "fields": {
      "key": "quarantine/pdf/owner123/20250127abc123def456/destination-bucket-name/path/to/file.pdf",
      "Content-Type": "application/pdf",
      "x-amz-meta-originalfilename": "${filename}",
      "x-amz-meta-systemfilename": "generated-filename.pdf",
      "x-amz-meta-useoriginalfilename": "enabled",
      ...
    },
    "method": "POST"
  }
}
```

**Key Logic:**
1. Parse `fileUri` to extract destination bucket and key
2. Validate destination bucket exists (with caching to reduce API calls)
3. Generate document ID: `{createdDate}{10-char-random-id}`
4. Generate correlation ID for request tracing
5. Create DynamoDB record with `scanStatus: PENDING`
6. Generate presigned POST URL for scanner bucket with:
   - File size enforcement via `content-length-range` condition
   - Content-Type validation
   - Expiration time (60-3600 seconds)
7. S3 key structure: `{scanPath}{type}/{ownerId}/{docId}/{destinationBucket}/{filePath}`
   - `scanPath`: "quarantine/" (from config)
   - `type`: Determined from file extension or "unknown"
   - Example: `quarantine/pdf/owner123/doc456/dest-bucket/path/file.pdf`
8. Include `docId` in destination path to prevent collisions: `{filePath}/{docId}/{originalFileName or systemFileName}`

### 3.2 Get Document by ID

**Endpoint:** `GET /api/document/:ownerId/:docId`  
**Authentication:** AWS IAM (SigV4)  
**Response:** Full document metadata

### 3.3 Process S3 Events (Internal)

**Endpoint:** `POST /api/document/s3/process`  
**Authentication:** Host verification (internal only)  
**Trigger:** S3 `ObjectTagging:Put` event on `quarantine/` prefix

**Event Structure:**
```json
{
  "Records": [{
    "eventName": "ObjectTagging:Put",
    "eventTime": "2025-01-27T10:00:00.000Z",
    "s3": {
      "bucket": { "name": "scanner-bucket" },
      "object": {
        "key": "quarantine/pdf/owner123/doc456/dest-bucket/path/file.pdf",
        "size": 1024000,
        "eTag": "\"abc123\""
      }
    }
  }]
}
```

**Processing Logic:**

1. **Idempotency Check:**
   - Retrieve document from DynamoDB using `docId` and `ownerId`
   - Check `scanStatus`: If already `CLEAN` or `INFECTED`, skip processing (idempotent)
   - Check `processingLock`: If locked and not expired, skip to prevent concurrent processing
   - Set `processingLock` with expiration (5 minutes) using conditional update

2. **Parse S3 Key:**
   - Validate key structure matches expected pattern: `quarantine/{type}/{ownerId}/{docId}/{destinationBucket}/...`
   - Split by `/`: `[quarantine, type, ownerId, docId, destinationBucket, ...filePath]`
   - Extract: `docId`, `ownerId`, `destinationBucket`
   - If key structure invalid, log error and skip processing

3. **Get File Tags:**
   - `avStatus`: CLEAN | INFECTED | SKIPPED | PROCCESSING_ERROR
   - `avScannedAt`: ISO timestamp
   - If tags missing, update document with `scanStatus: PROCCESSING_ERROR` and skip

4. **Get File Metadata:**
   - `x-amz-meta-originalfilename`: Original filename
   - `x-amz-meta-systemfilename`: System-generated filename
   - `x-amz-meta-useoriginalfilename`: "enabled" | "disabled"
   - `x-amz-meta-correlationid`: Correlation ID for tracing

5. **If CLEAN:**
   - Copy file from scanner bucket to destination bucket
   - Destination key: `{filePath}/{docId}/{originalFileName or systemFileName}` (includes docId to prevent collisions)
   - Verify copy succeeded (check object exists in destination)
   - Delete file from scanner bucket (only after successful copy)
   - Update DynamoDB with conditional update (ensure scanStatus is still PENDING):
     - `scanStatus`: CLEAN
     - `fileKey`: destination key
     - `fileSize`, `fileMD5`, `scannedAt`, `uploadedAt`
     - `uploaded`: 1
     - `expires`: -1 (no expiration)
     - `processingLock`: null (clear lock)
     - `lastProcessedAt`: current timestamp
   - If DynamoDB update fails, log error and trigger compensation logic
   - Invoke webhook(s) asynchronously (via SQS/EventBridge) with success data

6. **If INFECTED:**
   - Update DynamoDB with conditional update:
     - `scanStatus`: INFECTED
     - `fileSize`, `fileMD5`, `scannedAt`, `uploadedAt`
     - `uploaded`: 1
     - `processingLock`: null
     - `lastProcessedAt`: current timestamp
   - File remains in scanner bucket under `quarantine/`
   - Invoke webhook(s) asynchronously with failure data

7. **Error Handling:**
   - If processing fails at any step:
     - Update document with `scanStatus: PROCCESSING_ERROR`
     - Log error with correlation ID and full context
     - Clear `processingLock`
     - Increment `processingAttempts` counter
     - If `processingAttempts` exceeds threshold (e.g., 3), send to DLQ
   - Invoke webhook with error details
   - Compensation logic: If S3 copy succeeded but DynamoDB update failed:
     - Mark file in destination bucket for cleanup (via lifecycle policy or reconciliation job)
     - Log incident for manual review

### 3.4 Process DynamoDB Events (Internal)

**Endpoint:** `POST /api/document/dynamodb/process`  
**Authentication:** Host verification (internal only)  
**Trigger:** DynamoDB Stream (REMOVE events only)

**Processing Logic:**
- When document is deleted from DynamoDB (TTL expiration or manual deletion)
- Validate event: Check if `scanStatus === CLEAN` and `uploaded === 1`
- If valid, delete file from destination S3 bucket using `bucket` and `fileKey`
- Handle partial batch failures: Process each record independently
- Failed records are sent to DLQ for retry
- Log all cleanup operations with correlation ID

---

## 4. Data Models

### 4.1 Document Schema (DynamoDB)

**Table Name:** `{stage}_{service}_Document`  
**Partition Key:** `id` (String)  
**Sort Key:** `ownerId` (String)

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | String | Yes | Document ID: `{YYYYMMDD}{10-char-id}` |
| `ownerId` | String | Yes | Owner identifier |
| `docType` | Enum | No | `document` \| `image` \| `unknown` |
| `bucket` | String | Yes | Destination S3 bucket name |
| `fileKey` | String | Yes | S3 object key in destination bucket |
| `fileName` | String | Yes | System-generated filename |
| `originalFileName` | String | No | Original filename from upload |
| `fileSize` | Number | No | File size in bytes |
| `fileMD5` | String | No | S3 ETag (MD5) |
| `scanStatus` | Enum | Yes | `PENDING` \| `CLEAN` \| `INFECTED` \| `PROCCESSING_ERROR` \| `SKIPPED` |
| `scannedAt` | Date | No | Scan completion timestamp |
| `uploaded` | Number | Yes | 0 = not uploaded, 1 = uploaded |
| `uploadedAt` | Date | No | Upload completion timestamp |
| `uploadedCount` | Number | No | Upload attempt counter |
| `referenceId` | String | No | External reference ID |
| `redirectUrl` | String | No | Redirect URL after upload |
| `webhookUrl` | Array[String] | No | Webhook URLs (max 10) |
| `correlationId` | String | No | Request correlation ID for tracing |
| `processingLock` | Object | No | Processing lock: `{timestamp, expiresAt}` |
| `processingAttempts` | Number | No | Number of processing attempts (default: 0) |
| `lastProcessedAt` | Date | No | Last processing attempt timestamp |
| `webhookDeliveryStatus` | Array[Object] | No | Webhook delivery status: `[{url, status, attempts, lastAttemptAt}]` |
| `createdDate` | String | Yes | Date string: `YYYYMMDD` |
| `expires` | Number | No | TTL timestamp (-1 = no expiration) |
| `createdAt` | Date | Auto | Creation timestamp |
| `updatedAt` | Date | Auto | Update timestamp |

**Global Secondary Indexes (GSI):**

**Note:** GSI usage should be audited regularly. Remove unused indexes to reduce costs. Consider sparse GSIs (e.g., only index when `uploaded === 1`) where applicable.

1. `docIdCreatedGI`: `id` (PK) → `createdAt` (SK)
2. `ownerDocsGI`: `ownerId` (PK) → `id` (SK)
3. `ownerCreatedGI`: `ownerId` (PK) → `createdAt` (SK)
4. `ownerDocsUploadedGI`: `ownerId` (PK) → `uploadedAt` (SK) - Sparse: Only when `uploaded === 1`
5. `docTypeCreatedGI`: `docType` (PK) → `createdAt` (SK)
6. `docTypeUploadedGI`: `docType` (PK) → `uploaded` (SK) - Sparse: Only when `uploaded === 1`
7. `docBucketTypeGI`: `bucket` (PK) → `docType` (SK)
8. `docBucketFilePathGI`: `bucket` (PK) → `fileKey` (SK)
9. `docBucketScanStatusGI`: `bucket` (PK) → `scanStatus` (SK)
10. `docBucketUploadedGI`: `bucket` (PK) → `uploaded` (SK) - Sparse: Only when `uploaded === 1`
11. `docMD5GI`: `fileMD5` (PK) → `id` (SK) - Sparse: Only when `fileMD5` is present
12. `docReferenceIdGI`: `referenceId` (PK) → `id` (SK) - Sparse: Only when `referenceId` is present
13. `docCreatedGI`: `createdDate` (PK) → `createdAt` (SK)

### 4.2 Request DTO

```typescript
interface DocumentReq {
  fileUri: string;                    // s3://bucket/key format
  ownerId: string;                    // Alphanumeric + special chars
  referenceId?: string;               // Optional external reference
  redirectUrl?: string;               // Optional redirect URL
  webhookUrl?: string[];               // Max 10 unique URLs
  limitFileSizeInBytes?: number;      // 1 to 12MB (12582912 bytes)
  expireInSecs?: number;               // 60 to 3600 seconds
  useOriginalFileName?: boolean;      // Use original filename
}
```

### 4.3 Response Model

```typescript
interface DocumentRes {
  // All DocumentModel fields +
  presignedPost?: {
    url: string;
    fields: Record<string, string>;
    method: string;
  };
  error?: {
    statusCode: number;
    name: string;
    message: string;
  };
}
```

---

## 5. S3 Bucket Configuration

### 5.1 Scanner Bucket (Inbound)

- **Source:** Separate CloudFormation stack (`s3-scanner-{stage}-serverless`)
- **Environment Variable:** `SCANNER_S3_BUCKET`
- **Default Path:** `quarantine/`
- **Purpose:** Initial upload destination, scanning location

### 5.2 Destination Buckets

- **Source:** Provided in `fileUri` during document creation
- **Validation:** Bucket existence checked before creating document
- **Purpose:** Final storage location for clean files

### 5.3 File Path Structure

**Scanner Bucket:**
```
quarantine/{type}/{ownerId}/{docId}/{destinationBucket}/{filePath}
```

**Destination Bucket:**
```
{filePath}/{docId}/{originalFileName or systemFileName}
```
**Note:** Includes `docId` in path to prevent file collisions when multiple documents use the same `fileUri`.

**Type Determination:**
- Images: `image` (png, jpg, jpeg)
- Documents: File extension (pdf, docx, etc.)
- Unknown: `unknown`

---

## 6. Webhook Integration

### 6.1 Webhook Invocation

- **Trigger:** After scan result processing (asynchronously via SQS/EventBridge)
- **Method:** HTTP POST
- **Content-Type:** `application/json`
- **Payload:** Full document model (serialized) with correlation ID
- **Retry Strategy:** Exponential backoff with jitter
  - Initial delay: 1 second
  - Max attempts: 3
  - Max delay: 30 seconds
- **Timeout:** 10 seconds per webhook
- **Concurrency:** Up to 10 webhooks invoked in parallel
- **Delivery Tracking:** Update `webhookDeliveryStatus` in DynamoDB after each attempt

### 6.2 Webhook Reliability

- **Async Delivery:** Webhooks are sent to SQS queue or EventBridge for async processing
- **Dead Letter Queue:** Failed webhooks (after max retries) are sent to DLQ
- **Signature Verification:** Optional HMAC signature in `X-Webhook-Signature` header
- **Idempotency:** Webhook receivers should handle duplicate deliveries gracefully

### 6.3 Webhook Payload

```json
{
  "id": "20250127abc123",
  "ownerId": "owner123",
  "scanStatus": "CLEAN",
  "fileKey": "path/to/file.pdf",
  "fileSize": 1024000,
  "scannedAt": "2025-01-27T10:00:00.000Z",
  "uploaded": 1,
  "uploadedAt": "2025-01-27T10:00:00.000Z",
  "correlationId": "req-abc123def456",
  // ... all other fields
  "error": { ... }  // Only present if processing failed
}
```

### 6.4 Webhook Delivery Status

Each webhook URL has a delivery status tracked in `webhookDeliveryStatus` array:
- `url`: Webhook URL
- `status`: `PENDING` | `SUCCESS` | `FAILED` | `RETRYING`
- `attempts`: Number of delivery attempts
- `lastAttemptAt`: Timestamp of last attempt
- `error`: Error message if failed

---

## 7. Error Handling

### 7.1 Error Types

1. **InvalidDocumentUriError**: Invalid S3 URI format
2. **DocumentBucketNotFoundError**: Destination bucket doesn't exist
3. **DocumentNotFoundError**: Document not found in DynamoDB
4. **ScanStatusNotFoundError**: Missing scan tags on file
5. **DocumentMetaDataNotFoundError**: Missing required metadata
6. **DestinationBucketNotFoundError**: Missing destination bucket in S3 key
7. **DocumentAlreadyProcessedError**: Document already processed (idempotency check)
8. **ProcessingLockError**: Document is currently being processed
9. **S3CopyError**: Failed to copy file to destination bucket
10. **WebhookDeliveryError**: Webhook delivery failed after max retries

### 7.2 Error Response Format

```json
{
  "statusCode": 400,
  "name": "DocumentBucketNotFoundError",
  "message": "Document bucket not found",
  "correlationId": "req-abc123def456",
  "data": {},
  "timestamp": "2025-01-27T10:00:00.000Z"
}
```

### 7.3 Error Recovery

- **Retry Logic:** Automatic retries with exponential backoff for transient errors
- **Dead Letter Queue:** Permanent failures sent to DLQ for manual review
- **Compensation Logic:** Rollback or cleanup for partial failures (e.g., S3 copy succeeded but DynamoDB update failed)
- **Reconciliation Job:** Scheduled Lambda to detect and fix inconsistencies

---

## 8. Configuration

### 8.1 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SERVICE_NAME` | Service name | - |
| `SCANNER_S3_BUCKET` | Scanner bucket name | CF output |
| `SCANNER_S3_PATH` | Scan path prefix | `quarantine/` |
| `REGION` | AWS region | `ap-southeast-1` |
| `ENABLE_XRAY` | Enable X-Ray tracing | `false` |
| `LAMBDA_ROLE` | Lambda execution role ARN | - |
| `CFN_ROLE` | CloudFormation role ARN | - |
| `WEBHOOK_QUEUE_URL` | SQS queue URL for webhook delivery | - |
| `WEBHOOK_DLQ_URL` | DLQ URL for failed webhooks | - |
| `PROCESSING_LOCK_TTL_SECS` | Processing lock TTL in seconds | `300` |
| `MAX_PROCESSING_ATTEMPTS` | Max processing attempts before DLQ | `3` |
| `BUCKET_VALIDATION_CACHE_TTL` | Bucket validation cache TTL (seconds) | `3600` |

### 8.2 Config Files

- `config/default.json`: Default configuration
- `config/staging.json`: Staging overrides
- `config/production.json`: Production overrides
- `config/custom-environment-variables.json`: Env var mapping

---

## 9. Security

### 9.1 Authentication

- **API Endpoints:** AWS IAM SigV4 authentication
- **Internal Endpoints:** Host verification middleware
- **S3 Presigned URLs:** Time-limited (60-3600 seconds)

### 9.2 Authorization

- IAM-based access control
- Bucket policies restrict direct uploads (enforced by scanner service)

### 9.3 Data Protection

- S3 server-side encryption (AES256)
- DynamoDB encryption at rest
- HTTPS only for API endpoints
- Presigned URL security:
  - File size enforcement via `content-length-range` condition
  - Content-Type validation
  - Time-limited expiration (60-3600 seconds)
  - CORS configuration for allowed origins

### 9.4 Rate Limiting

- Per-owner rate limiting: Max requests per minute per `ownerId`
- Global rate limiting: Max requests per minute across all owners
- Rate limit headers in API responses: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## 10. Monitoring & Observability

### 10.1 Logging

- Structured logging with Pino
- Log levels: `debug`, `info`, `error`
- Request/response logging with correlation IDs
- Error stack traces with full context
- Log fields:
  - `correlationId`: Request correlation ID
  - `docId`: Document ID (when applicable)
  - `ownerId`: Owner ID (when applicable)
  - `scanStatus`: Current scan status
  - `timestamp`: ISO timestamp
  - `lambdaRequestId`: AWS Lambda request ID

### 10.2 Tracing

- AWS X-Ray integration (optional)
- Method-level tracing
- Lambda handler tracing

### 10.3 Metrics

- CloudWatch metrics (automatic)
- Lambda duration, errors, throttles
- API Gateway metrics
- Custom business metrics:
  - `DocumentCreated`: Count of documents created
  - `DocumentScanned`: Count of documents scanned (by status)
  - `DocumentUploaded`: Count of documents uploaded successfully
  - `WebhookDelivered`: Count of webhooks delivered (by status)
  - `ProcessingTime`: Time to process scan results (p50, p95, p99)
  - `S3CopyDuration`: Time to copy files to destination (p50, p95, p99)
  - `ProcessingErrors`: Count of processing errors by type

### 10.4 CloudWatch Alarms

- **High Error Rate:** Alert when error rate exceeds 5% over 5 minutes
- **Failed Scan Processing:** Alert when scan processing failures exceed threshold
- **Webhook Delivery Failures:** Alert when webhook delivery failure rate exceeds 10%
- **S3 Copy Failures:** Alert when S3 copy operations fail
- **DynamoDB Write Failures:** Alert when DynamoDB write operations fail
- **DLQ Message Count:** Alert when DLQ message count exceeds threshold
- **Lambda Throttles:** Alert when Lambda throttles occur
- **Processing Lock Timeout:** Alert when processing locks expire without completion

---

## 11. Deployment

### 11.1 Infrastructure

- **Framework:** Serverless Framework
- **Runtime:** Node.js 18.x (ARM64)
- **Memory:** 2048 MB
- **Timeout:** 29 seconds

### 11.2 Lambda Functions

1. **apiLambda**
   - HTTP API events
   - S3 ObjectTagging:Put events
   - DynamoDB stream events

### 11.3 Dependencies

- Express.js (via serverless-adapter)
- Dynamoose (DynamoDB ODM)
- AWS SDK v3
- Class-validator (request validation)

---

## 12. Implementation Notes for NestJS

### 12.1 Key Modules

1. **Document Module**
   - Controller: HTTP endpoints
   - Service: Business logic
   - Repository: DynamoDB operations
   - DTOs: Request/response validation

2. **S3 Module**
   - Service: S3 operations
   - Presigned URL generation
   - File metadata/tagging operations

3. **Webhook Module**
   - Service: HTTP POST to webhooks
   - Retry logic
   - Error handling

4. **Event Module**
   - S3 event handler
   - DynamoDB stream handler

### 12.2 NestJS Specific Considerations

- Use `@nestjs/aws-sdk` for AWS SDK integration
- Use `@nestjs/dynamodb` or `dynamoose` for DynamoDB
- Use `@nestjs/config` for configuration
- Use `class-validator` and `class-transformer` for DTOs
- Use `@nestjs/event-emitter` for internal events
- Use `@nestjs/bull` for webhook queue processing (optional)

### 12.3 Serverless Integration

- Use `@nestjs/platform-express` for HTTP
- Use `serverless-http` or `@vendia/serverless-express` for Lambda
- Consider `@nestjs/terminus` for health checks

---

## 13. Testing Considerations

### 13.1 Unit Tests

- Service layer logic
- Repository operations
- S3 service methods
- Webhook service

### 13.2 Integration Tests

- API endpoint testing
- DynamoDB operations
- S3 operations (localstack)
- Event processing

### 13.3 E2E Tests

- Full document upload flow
- Scan result processing
- Webhook invocation

---

## 14. Reliability Patterns

### 14.1 Idempotency

- **S3 Event Processing:** Check `scanStatus` before processing to prevent duplicate operations
- **Processing Lock:** Use `processingLock` field with TTL to prevent concurrent processing
- **Conditional Updates:** Use DynamoDB conditional updates to ensure state consistency
- **Idempotency Keys:** Include correlation IDs in all operations for tracing

### 14.2 Transactional Consistency

- **Compensation Logic:** If S3 copy succeeds but DynamoDB update fails:
  - Mark file in destination for cleanup (lifecycle policy)
  - Log incident for reconciliation job
  - Retry DynamoDB update with exponential backoff
- **Reconciliation Job:** Scheduled Lambda (daily) to:
  - Detect orphaned files in destination buckets
  - Detect documents with inconsistent state
  - Fix inconsistencies automatically where possible
  - Alert for manual intervention when needed

### 14.3 Event Processing

- **S3 Event Filtering:** Strict event filters to process only relevant files
- **Batch Processing:** Handle S3 event batches with partial failure support
- **DLQ Integration:** Failed events sent to DLQ for retry and manual review
- **Event Ordering:** Process events in order when possible (within partition)

### 14.4 Health Checks

- **Health Endpoint:** `GET /health` returns service health status
- **Readiness Check:** Verify DynamoDB and S3 connectivity
- **Liveness Check:** Verify Lambda execution environment
- **Dependency Checks:** Verify scanner bucket accessibility

---

## 15. Future Enhancements

- EventBridge integration (currently direct S3 events)
- Step Functions for workflow orchestration
- Support for multiple file uploads
- File versioning
- Custom metadata fields
- Enhanced retry logic for webhooks (already implemented)
- Dead letter queue for failed webhooks (already implemented)
- S3 multipart upload support for large files
- File content validation (e.g., PDF structure validation)
- Audit logging for all document operations
- VPC endpoints for S3 access

---

## Appendix A: File Type Detection

```typescript
function getFileContentType(fileName: string): string | null {
  const ext = getFileExtensionFromPath(fileName).toLowerCase();
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    // ... more types
  };
  return mimeTypes[ext] || null;
}
```

---

## Appendix B: ID Generation

```typescript
function generateDocumentId(): string {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const randomId = generateShortId(10); // Alphanumeric, 10 chars
  return `${dateStr}${randomId}`;
}

function generateCorrelationId(): string {
  return `req-${generateShortId(12)}`; // For request tracing
}
```

---

## Appendix C: Idempotency Pattern

```typescript
async function processScanResult(docId: string, ownerId: string, avStatus: string) {
  // 1. Check current status (idempotency)
  const doc = await getDocument(docId, ownerId);
  if (doc.scanStatus === 'CLEAN' || doc.scanStatus === 'INFECTED') {
    logger.info('Document already processed', { docId, scanStatus: doc.scanStatus });
    return; // Idempotent - skip processing
  }

  // 2. Acquire processing lock
  const lock = {
    timestamp: Date.now(),
    expiresAt: Date.now() + (PROCESSING_LOCK_TTL_SECS * 1000)
  };
  
  try {
    await updateDocument(docId, ownerId, {
      processingLock: lock
    }, {
      condition: 'attribute_not_exists(processingLock) OR processingLock.expiresAt < :now',
      expressionAttributeValues: { ':now': Date.now() }
    });
  } catch (error) {
    if (error.code === 'ConditionalCheckFailedException') {
      logger.warn('Document is locked', { docId });
      return; // Another process is handling this
    }
    throw error;
  }

  try {
    // 3. Process scan result
    // ... processing logic ...
    
    // 4. Update document and clear lock
    await updateDocument(docId, ownerId, {
      scanStatus: avStatus,
      processingLock: null,
      lastProcessedAt: new Date()
    });
  } catch (error) {
    // 5. Clear lock on error
    await updateDocument(docId, ownerId, {
      processingLock: null,
      processingAttempts: doc.processingAttempts + 1
    });
    throw error;
  }
}
```

---

## Appendix D: Compensation Pattern

```typescript
async function copyFileWithCompensation(
  sourceBucket: string,
  sourceKey: string,
  destBucket: string,
  destKey: string,
  docId: string
) {
  try {
    // Copy file
    await s3.copyObject({
      CopySource: `${sourceBucket}/${sourceKey}`,
      Bucket: destBucket,
      Key: destKey
    });

    // Verify copy succeeded
    await s3.headObject({ Bucket: destBucket, Key: destKey });

    return { success: true };
  } catch (error) {
    // If copy failed, no compensation needed
    throw error;
  }
}

async function updateDocumentWithCompensation(
  docId: string,
  ownerId: string,
  updates: any,
  destBucket: string,
  destKey: string
) {
  try {
    await updateDocument(docId, ownerId, updates);
  } catch (error) {
    // Compensation: Mark file for cleanup
    logger.error('DynamoDB update failed after S3 copy', {
      docId,
      destBucket,
      destKey,
      error
    });

    // Tag file for cleanup by reconciliation job
    await s3.putObjectTagging({
      Bucket: destBucket,
      Key: destKey,
      Tagging: {
        TagSet: [
          { Key: 'CleanupReason', Value: 'DynamoDBUpdateFailed' },
          { Key: 'DocId', Value: docId },
          { Key: 'CreatedAt', Value: new Date().toISOString() }
        ]
      }
    });

    throw error;
  }
}
```

---

**Document End**

