import mongoose from 'mongoose';

let isConnected = false;

// Attach the error listener ONCE before any connect() call so that
// unhandled 'error' events from the mongoose connection object never
// crash the process (Node.js throws on EventEmitter 'error' with no listener).
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
  isConnected = false;
});

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected.');
  isConnected = false;
});

export async function connectMongoDB(): Promise<void> {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not set.');
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });
  isConnected = true;
  console.log('✅ MongoDB connected');
}

export default mongoose;
