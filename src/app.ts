import express, { Express } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import compression from 'compression';
import responseTime from 'response-time';
import swaggerUi from 'swagger-ui-express';
import { config } from './config';
import { correlationIdMiddleware } from './middleware/correlationId.middleware';
import { errorMiddleware } from './middleware/error.middleware';
import { HTTPLogger, setResponseBody, AppLogger } from './utils';
import { swaggerSpec } from './config/swagger';
import { AWSDynamoDB } from './services/aws/database.service';
import documentRoutes from './routes/document.routes';

const app: Express = express();

// Trust proxy (for accurate IP addresses behind load balancer)
app.set('trust proxy', true);

// Compression middleware
app.use(compression());

// CORS
app.use(cors());

// Body parser
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Response time middleware
app.use(responseTime((req, res, time) => {
  const correlationId = (req as any).correlationId;
  AppLogger.debug('Request completed', {
    method: req.method,
    statusCode: res.statusCode,
    responseTime: `${time.toFixed(2)}ms`,
  }, correlationId);
}));

// Correlation ID middleware (must be before HTTP logger)
app.use(correlationIdMiddleware);

// Response body capture (for logging)
app.use(setResponseBody);

// HTTP Logger middleware
app.use(HTTPLogger);

// Initialize database connection
AWSDynamoDB.initDB();

// Initialize tables in development
if (config.nodeEnv === 'development') {
  import('./services/aws/document.service').then(({ AWSDocumentService }) => {
    AWSDocumentService.initTables().catch((error) => {
      AppLogger.error('Failed to initialize tables', error);
      process.exit(1);
    });
  });
}

// Swagger documentation (only in local/dev)
if (config.nodeEnv === 'development' || config.stage === 'dev') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'DMS API Documentation',
  }));
  AppLogger.info('Swagger documentation available at /api-docs');
}

// OpenAPI JSON endpoint
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [Health]
 *     description: Returns the health status of the service
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 service:
 *                   type: string
 *                   example: dms-service
 *                 environment:
 *                   type: string
 *                   example: dev
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 correlationId:
 *                   type: string
 *                 uptime:
 *                   type: number
 *                   description: Uptime in seconds
 */
app.get('/health', (req, res) => {
  const correlationId = (req as any).correlationId;
    
  AppLogger.info('Health check', {
    status: 'ok',
    ip: req.ip,
  }, correlationId);
  
  res.json({
    status: 'ok',
    service: config.serviceName,
    environment: config.stage,
    timestamp: new Date().toISOString(),
    correlationId,
    uptime: process.uptime(),
  });
});

// API routes will go here
app.use('/api/document', documentRoutes);

// 404 handler
app.use((req, res) => {
  const correlationId = (req as any).correlationId;
  AppLogger.warn('Route not found', {
    method: req.method,
    path: req.path,
  }, correlationId);
  
  res.status(404).json({
    statusCode: 404,
    name: 'NotFoundError',
    message: 'Route not found',
    correlationId,
  });
});

// Error handling middleware (must be last)
app.use(errorMiddleware);

// Start server
if (require.main === module) {
  const port = config.port;
  app.listen(port, () => {
    AppLogger.info(`Server is running on port ${port}`, {
      port,
      environment: config.stage,
      nodeEnv: config.nodeEnv,
    });
  });
}

export default app;