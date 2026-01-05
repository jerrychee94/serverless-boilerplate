import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './index';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: config.swagger.title,
      version: config.swagger.version,
      description: config.swagger.description,
      contact: {
        name: config.swagger.contactName,
        ...(config.swagger.contactEmail && { email: config.swagger.contactEmail }),
      },
    },
    servers: [
      {
        url: '/api',
        description: 'API Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            statusCode: {
              type: 'number',
              example: 400,
            },
            name: {
              type: 'string',
              example: 'ValidationError',
            },
            message: {
              type: 'string',
              example: 'Validation failed',
            },
            correlationId: {
              type: 'string',
              description: 'Correlation ID for request tracing',
            },
            data: {
              type: 'object',
              description: 'Additional error details',
            },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.ts', './src/models/**/*.ts', './src/controllers/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);