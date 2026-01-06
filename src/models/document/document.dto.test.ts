import { validate } from 'class-validator';
import { CreateDocumentDto } from './document.dto';

describe('CreateDocumentDto', () => {
  it('should validate required fields', async () => {
    const dto = new CreateDocumentDto();
    const errors = await validate(dto);
    
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.property === 'fileUri')).toBe(true);
    expect(errors.some(e => e.property === 'ownerId')).toBe(true);
  });

  it('should pass validation with valid data', async () => {
    const dto = new CreateDocumentDto();
    dto.fileUri = 's3://bucket-name/path/to/file.pdf';
    dto.ownerId = 'owner123';
    
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should validate fileUri is a string', async () => {
    const dto = new CreateDocumentDto();
    dto.fileUri = 123 as any; // Invalid type
    dto.ownerId = 'owner123';
    
    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'fileUri')).toBe(true);
  });

  it('should validate redirectUrl is a valid URL', async () => {
    const dto = new CreateDocumentDto();
    dto.fileUri = 's3://bucket-name/path/to/file.pdf';
    dto.ownerId = 'owner123';
    dto.redirectUrl = 'not-a-valid-url';
    
    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'redirectUrl')).toBe(true);
  });

  it('should validate webhookUrl array size', async () => {
    const dto = new CreateDocumentDto();
    dto.fileUri = 's3://bucket-name/path/to/file.pdf';
    dto.ownerId = 'owner123';
    dto.webhookUrl = Array(11).fill('https://example.com/webhook'); // More than 10
    
    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'webhookUrl')).toBe(true);
  });

  it('should validate limitFileSizeInBytes range', async () => {
    const dto = new CreateDocumentDto();
    dto.fileUri = 's3://bucket-name/path/to/file.pdf';
    dto.ownerId = 'owner123';
    dto.limitFileSizeInBytes = 20000000; // More than 12MB
    
    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'limitFileSizeInBytes')).toBe(true);
  });

  it('should validate expireInSecs range', async () => {
    const dto = new CreateDocumentDto();
    dto.fileUri = 's3://bucket-name/path/to/file.pdf';
    dto.ownerId = 'owner123';
    dto.expireInSecs = 30; // Less than 60
    
    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'expireInSecs')).toBe(true);
  });
});

