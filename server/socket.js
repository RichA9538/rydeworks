/**
 * socket.js — Socket.io singleton
 * Import getIo() in any route to emit real-time events to clients.
 */

let io;

function init(httpServer) {
  const { Server } = require('socket.io');
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (/^https?:\/\/(.*\.)?rydeworks\.com$/.test(origin)) return callback(null, true);
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true);
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true
    },
    transports: ['websocket', 'polling']
  });

  io.on('connection', (socket) => {
    // Client joins its org room immediately after connecting
    socket.on('join:org', (orgId) => {
      if (orgId) {
        socket.join(`org:${orgId}`);
      }
    });

    // Driver emits location — broadcast to org room (dispatch map)
    socket.on('driver:location', (data) => {
      const { orgId, driverId, driverName, lat, lng } = data;
      if (orgId && lat && lng) {
        socket.to(`org:${orgId}`).emit('driver:location', { driverId, driverName, lat, lng });
      }
    });

    socket.on('disconnect', () => {});
  });

  return io;
}

function getIo() {
  return io; // returns null if not initialized — callers should guard
}

module.exports = { init, getIo };
