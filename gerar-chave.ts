import 'dotenv/config';
import crypto from 'crypto';

// Reusing our portfolio-api-key schema logic
// We generate a raw 32-byte API key in base64, 
// and a SHA-256 hash to store in the DB.

const rawKey = crypto.randomBytes(32).toString('base64');
const prefix = 'lb_live_';
const finalKey = prefix + rawKey;

const hashedKey = crypto
  .createHash('sha256')
  .update(finalKey)
  .digest('hex');

console.log('--- API KEY GENERATOR ---');
console.log('1. Cole esta RAW KEY no curl (X-API-KEY):');
console.log(finalKey);
console.log('\n2. Cole esta HASHED KEY no Supabase / Prisma Studio:');
console.log(hashedKey);
