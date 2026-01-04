import express, { Express } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import compression from 'compression';
import responseTime from 'response-time';
import userAgent from 'express-useragent';
import swaggerUi from 'swagger-ui-express';
import { config } from './config';
import { correlationIdMiddleware } from './middleware/correlationId.middleware';
import { errorMiddleware } from './middleware/error.middleware';
import { HTTPLogger, setResponseBody } from './utils/logger';
import { AppLogger } from './utils/logger';
import { swaggerSpec } from './config/swagger';

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

// User agent parsing
app.use(userAgent.express());

// Response time middleware
app.use(responseTime((req, res, time) => {
  const correlationId = (req as any).correlationId;
  AppLogger.debug('Request completed', {
    method: req.method,
    path: req.path,
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

// Swagger documentation (only in local/dev)
if (config.nodeEnv === 'development' || config.stage === 'dev') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'DMS API Documentation',
  }));
  AppLogger.info('Swagger documentation available at /api-docs');
}

// Health check endpoint
app.get('/health', (req, res) => {
  const correlationId = (req as any).correlationId;
  const userAgentInfo = req.useragent;
  
  AppLogger.info('Health check', {
    status: 'ok',
    userAgent: userAgentInfo?.source,
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
// app.use('/api/document', documentRoutes);

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