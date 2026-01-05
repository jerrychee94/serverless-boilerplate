import { NextFunction, Request, Response } from 'express';
import pino from 'pino';
import pinoHttp from 'pino-http';
import pinoPretty from 'pino-pretty';
import { config } from '../config/index';
import { CORRELATION_ID_HEADER, generateCorrelationId } from './correlationId';

export enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
  SILENT = 'silent',
}

const defaultRedacts = [
  'req.body.password',
  'req.headers.Authorization',
  'req.headers.authorization',
  'req.query.token',
  'res.body.id_token',
  'res.body.access_token',
  'res.body.refresh_token',
];

export default class Logger {
  public instance: pino.Logger;

  constructor(loggerName: string, level: LogLevel = LogLevel.INFO, redactPaths?: string[]) {
    const options: pino.LoggerOptions = {
      name: loggerName,
      timestamp: pino.stdTimeFunctions.isoTime,
      level,
      redact: config.stage === 'prod' ? (redactPaths ? [...redactPaths, ...defaultRedacts] : defaultRedacts) : undefined,
      messageKey: 'message',
    };

    this.instance = pino(
      options,
      config.nodeEnv === 'development'
        ? pinoPretty({
      colorize: true,
            levelFirst: true,
            translateTime: true,
            sync: true,
          })
        : undefined,
    );
  }

  log(event: any) {
    this.debug(null, event);
  }

  trace(message: string | null, data?: any | Error, correlationId?: string) {
    if (this.instance.isLevelEnabled(this.instance.level)) {
      this.instance.trace({ correlationId, data }, message || '');
    }
  }

  debug(message: string | null, data?: any | Error, correlationId?: string) {
    if (this.instance.isLevelEnabled(this.instance.level)) {
      this.instance.debug({ correlationId, data }, message || '');
    }
  }

  info(message: string, data?: any | Error, correlationId?: string) {
    if (this.instance.isLevelEnabled(this.instance.level)) {
      this.instance.info({ correlationId, data }, message);
    }
  }

  warn(message: string, data?: any | Error, correlationId?: string) {
    if (this.instance.isLevelEnabled(this.instance.level)) {
      this.instance.warn({ correlationId, data }, message);
    }
  }

  error(message: string, errorObj?: any | Error, data?: any | Error, correlationId?: string) {
    if (this.instance.isLevelEnabled(this.instance.level)) {
      const error = errorObj instanceof Error 
        ? {
            message: errorObj.message,
            stack: errorObj.stack,
            name: errorObj.name,
            ...Object.getOwnPropertyNames(errorObj).reduce((acc, key) => {
              acc[key] = (errorObj as any)[key];
              return acc;
            }, {} as any),
          }
        : errorObj;
      
      this.instance.error(
        {
          correlationId,
          error,
          data,
        },
        message,
      );
    }
  }

  fatal(message: string, errorObj?: any | Error, data?: any | Error, correlationId?: string) {
    if (this.instance.isLevelEnabled(this.instance.level)) {
      const error = errorObj instanceof Error
        ? {
            message: errorObj.message,
            stack: errorObj.stack,
            name: errorObj.name,
            ...Object.getOwnPropertyNames(errorObj).reduce((acc, key) => {
              acc[key] = (errorObj as any)[key];
              return acc;
            }, {} as any),
          }
        : errorObj;
      
      this.instance.fatal(
        {
          correlationId,
          error,
          data,
        },
        message,
      );
    }
  }
}

export function setResponseBody(req: Request, res: Response, next: NextFunction) {
  const rawResponse = (res as any).write;
  const rawResponseEnd = (res as any).end;
  if (rawResponse && rawResponseEnd) {
    const chunks: Buffer[] = [];
    (res as any).write = (chunk: any, encoding?: BufferEncoding, callback?: () => void) => {
      chunks.push(Buffer.from(chunk));
      rawResponse.call(res, chunk, encoding, callback);
      return true;
    };

    (res as any).end = (chunk?: any, encoding?: BufferEncoding, callback?: () => void) => {
      if (chunk) {
        chunks.push(Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks).toString('utf8');

      const resHeaders = res.getHeaders();
      const contentType = `${resHeaders['content-type']}`;
      if (contentType && contentType.indexOf('application/json') >= 0) {
        try {
          (res as any).body = JSON.parse(body);
        } catch {
          (res as any).body = body;
        }
      } else {
        (res as any).body = contentType;
      }
      rawResponseEnd.call(res, chunk, encoding, callback);
    };

    next();
  } else {
    next();
  }
}

export const HTTPLogger = pinoHttp({
  logger: new Logger('app:http', config.logging.level as LogLevel).instance,
});

export const DatabaseLogger = new Logger('aws:database', config.logging.level === 'debug' ? LogLevel.DEBUG : LogLevel.SILENT);
export const ErrorLogger = new Logger('app:exception', LogLevel.ERROR);
export const AppLogger = new Logger('app', config.logging.level as LogLevel);