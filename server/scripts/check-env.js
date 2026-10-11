// Safe environment check: prints what was loaded WITHOUT printing any secret values.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { diagnoseMongoUri } from '../config/db.js';

const envPath = path.resolve(process.cwd(), '.env');
console.log(`.env file found in ${process.cwd()}: ${existsSync(envPath) ? 'yes' : 'NO'}`);
for (const k of ['PORT', 'NODE_ENV', 'MONGODB_URI', 'JWT_SECRET', 'CLIENT_URL', 'FIRST_USER_ADMIN']) {
  const v = process.env[k];
  console.log(`${k.padEnd(18)} ${v === undefined ? 'MISSING' : v.trim() === '' ? 'EMPTY' : `set (${v.length} characters)`}`);
}
console.log(`JWT_SECRET length ok (>=16): ${(env.jwtSecret || '').length >= 16}`);
const uri = env.mongoUri;
if (uri) {
  console.log(`MONGODB_URI scheme: ${/^(mongodb\+srv|mongodb):\/\//.test(uri.trim()) ? uri.trim().split('://')[0] + '://' : 'INVALID'}`);
}
const problems = diagnoseMongoUri(uri);
console.log(problems.length ? `\nProblems found with MONGODB_URI:\n - ${problems.join('\n - ')}` : '\nMONGODB_URI format looks valid.');
