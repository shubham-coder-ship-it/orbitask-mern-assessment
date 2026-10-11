import dotenv from 'dotenv';
dotenv.config();

export const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  firstUserAdmin: process.env.FIRST_USER_ADMIN === 'true',
};
export const isProd = () => (process.env.NODE_ENV || 'development') === 'production';
