import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';
import dns from 'node:dns';

// Some networks refuse Node's SRV lookups (needed for mongodb+srv://). Override with DNS_SERVERS=a,b or leave default.
const dnsServers = (process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1').split(',').map((s) => s.trim()).filter(Boolean);
if (process.env.MONGODB_URI?.startsWith('mongodb+srv://') && dnsServers.length) dns.setServers(dnsServers);

if (!env.jwtSecret || env.jwtSecret.length < 16) {
  console.error('JWT_SECRET must be set (at least 16 characters). See server/.env.example');
  process.exit(1);
}

try {
  await connectDB(env.mongoUri);
  console.log('MongoDB connected');
} catch (err) {
  console.error('MongoDB connection failed:', err.message);
  process.exit(1);
}

createApp().listen(env.port, () => console.log(`Orbitask API listening on port ${env.port}`));
