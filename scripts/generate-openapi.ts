import { writeFileSync } from 'fs';
import { join } from 'path';
import { swaggerSpec } from '../src/config/swagger';

const outputPath = join(process.cwd(), 'openapi.json');

try {
  writeFileSync(outputPath, JSON.stringify(swaggerSpec, null, 2), 'utf-8');
  console.log(`✅ OpenAPI specification generated successfully at: ${outputPath}`);
} catch (error) {
  console.error('❌ Failed to generate OpenAPI specification:', error);
  process.exit(1);
}

