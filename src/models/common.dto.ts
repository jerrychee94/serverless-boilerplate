import { ClassTransformOptions, instanceToPlain } from 'class-transformer';

export class BaseReqModel {
  toPlain?<T>(opts?: ClassTransformOptions | { exposeUnsetFields: false }): T;

  toPlain?<T>(opts = { exposeUnsetFields: false }): T {
    return instanceToPlain(this, opts) as T;
  }
}

export class BaseModel {
  expires?: Date;
  updatedAt?: Date;
  createdAt?: Date;
}

export class BaseResponseModel {
  toPlain?<T>(opts?: ClassTransformOptions | { exposeUnsetFields: false }): T;

  toPlain?<T>(opts = { exposeUnsetFields: false }): T {
    return instanceToPlain(this, opts) as T;
  }
}