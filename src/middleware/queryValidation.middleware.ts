import { Request, Response, NextFunction } from 'express';
import { query, ValidationChain, validationResult } from 'express-validator';
import { AppError } from './error.middleware';

export const validate = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const error = new Error('Validation failed') as AppError;
      error.statusCode = 400;
      error.data = errors.array();
      return next(error);
    }

    next();
  };
};

// Example usage helper
export const validateQuery = (validations: ValidationChain[]) => {
  return validate(validations);
};