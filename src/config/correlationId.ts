import { nanoid } from 'nanoid';

export const generateCorrelationId = (): string => {
  return `req-${nanoid(12)}`;
};

export const CORRELATION_ID_HEADER = 'x-correlation-id';