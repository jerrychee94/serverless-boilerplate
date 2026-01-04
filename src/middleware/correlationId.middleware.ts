import { NextFunction, Request, Response } from 'express';
import { CORRELATION_ID_HEADER, generateCorrelationId } from '../utils';

export const correlationIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Get correlation ID from header or generate new one
  const correlationId = (req.headers[CORRELATION_ID_HEADER] as string) || generateCorrelationId();
  
  // Store in request object
  (req as any).correlationId = correlationId;
  
  // Set in response header
  res.setHeader(CORRELATION_ID_HEADER, correlationId);
  
  next();
};