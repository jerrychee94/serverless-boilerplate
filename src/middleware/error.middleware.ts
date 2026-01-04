import { NextFunction, Request, Response } from 'express';
import { ErrorLogger } from '../utils/logger';
import { CORRELATION_ID_HEADER } from '../utils/correlationId';

export interface AppError extends Error {
  statusCode?: number;
  data?: any;
}

export const errorMiddleware = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const correlationId = (req as any).correlationId || req.headers[CORRELATION_ID_HEADER] as string;
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  ErrorLogger.error(
    message,
    err,
    {
      path: req.path,
      method: req.method,
      statusCode,
    },
    correlationId
  );

  res.status(statusCode).json({
    statusCode,
    name: err.name || 'Error',
    message,
    correlationId,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    ...(err.data && { data: err.data }),
  });
};