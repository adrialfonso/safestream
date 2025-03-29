const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Configure server CORS (allow all, for now)
const io = socketIo(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"],
  }
});

app.use(express.static('public'));

// Handle all other routes by serving index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
  console.log(`New peer ${socket.id} connected`);

  let currentRoom = null;

  // Handle joining a room (new peer enters the P2P mesh)
  socket.on('join', (room) => {
    currentRoom = room;
    socket.join(room);
    // Broadcast new peer connection to all peers in the same room
    socket.to(room).emit('new-peer', socket.id);
  });

  // Handle receiving an offer
  socket.on('offer', ({ to, offer }) => {
    console.log('Offer received:', offer);
    // Send the offer to the peer id=socket.Id
    socket.to(to).emit('offer', { from: socket.id, offer });
  });

  // Handle receiving an answer
  socket.on('answer', ({ to, answer }) => {
    console.log('Answer received:', answer);
    // Send the answer to the peer id=socket.Id
    socket.to(to).emit('answer', { from: socket.id, answer });
  });

  // Handle receiving an ICE candidate
  socket.on('candidate', ({ to, candidate }) => {
    console.log('ICE candidate received:', candidate);
    // Send the ICE candidate to the peer id=socket.Id
    socket.to(to).emit('candidate', { from: socket.id, candidate });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Peer ${socket.id} disconnected`);
    if (currentRoom) {
      // Broadcast peer disconnection to all peers in the same room
      socket.to(currentRoom).emit('peer-disconnected', socket.id);
    }
  });
});

// for Render deployment (random port assignment) or local testing
// const PORT = process.env.PORT || 8765; 
const PORT = 8765;
server.listen(PORT, () => {
  console.log(`Signaling server running on port http://localhost:${PORT}`);
  // console.log(`Signaling server running on port ${PORT}`);
});
