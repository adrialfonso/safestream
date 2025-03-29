const startBtn = document.getElementById('start-btn');
const sendBtn = document.getElementById('send-btn');
const localVideo = document.getElementById('localVideo');
const remoteVideos = document.getElementById('remoteVideos');
const chat = document.getElementById('chat');
const messageInput = document.getElementById('message');

// const socket = io.connect('http://localhost:8765');
const socket = io.connect('https://safestream.onrender.com');

let localStream;
let roomId;
const peerConnections = {};
const dataChannels = {};
const config = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'turn:relay.backups.cz', username: 'webrtc', credential: 'webrtc' }
    ]
};

// Extract room ID from URL
const pathSegments = window.location.pathname.split('/').filter(segment => segment);
roomId = pathSegments[0] || crypto.randomUUID();
if (!pathSegments.length) {
  window.history.replaceState(null, null, `/${roomId}`);
}
document.getElementById('room-id').textContent = `Room ID: ${roomId}`;

// Function to start video streaming
async function startVideo() {
    // Get user media (video and audio)
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    localVideo.style.display = "block";
    // Emit a join event to the server
    socket.emit('join', roomId);
}

// Function to create a new peer-to-peer connection
function createPeerConnection(socketId) {
    const peerConnection = new RTCPeerConnection(config);
    // Add local stream tracks to the peer connection
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    // Handle ICE candidate event
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.emit('candidate', { to: socketId, candidate: event.candidate });
        }
    };

    // Handle track event
    peerConnection.ontrack = event => {
        let remoteVideo = document.getElementById(`remoteVideo_${socketId}`);
        if (!remoteVideo) {
            remoteVideo = document.createElement('video');
            remoteVideo.id = `remoteVideo_${socketId}`;
            remoteVideo.autoplay = true;
            remoteVideo.classList.add('remote-video');
            remoteVideos.appendChild(remoteVideo);
        }
        // Set the remote video stream
        remoteVideo.srcObject = event.streams[0];
    };

    // Create a data channel for chat
    const dataChannel = peerConnection.createDataChannel('chat');
    dataChannels[socketId] = dataChannel;

    dataChannel.onopen = () => {
        console.log(`RTCDataChannel is now open with ${socketId}`);
    };

    // Handle data channel message event
    dataChannel.onmessage = event => {
        const message = document.createElement('p');
        message.textContent = `${socketId} > ${event.data}`;
        message.style.color = '#ca5cdd';
        message.style.fontWeight = 'bold';
        chat.appendChild(message);
    };

    // Handle data channel event
    peerConnection.ondatachannel = event => {
        const receiveChannel = event.channel;
        receiveChannel.onmessage = event => {
            const message = document.createElement('p');
            message.textContent = `${event.data}`;
            message.style.color = '#ca5cdd';
            message.style.fontWeight = 'bold';
            chat.appendChild(message);
        };
    };

    return peerConnection;
}

// Show online peers in the room when joining the room
socket.on('online-room-peers', (peers) => {
    let message;
    if (peers.length === 0) {
        message = `<em>You joined the room. No peers online.</em>`;
    } else {
        message = `<em>You joined the room. Peers in room: ${peers.join(', ')}</em>`;
    }

    const messageElement = document.createElement('p');
    messageElement.innerHTML = message;
    chat.appendChild(messageElement);
});

// Handle new peer connection
socket.on('new-peer', async (socketId) => {
    const peerConnection = createPeerConnection(socketId);
    peerConnections[socketId] = peerConnection;

    // Create an offer and send it to the remote peer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', { to: socketId, offer });

    const message = `<em>${socketId} joined the room</em>`;
    const messageElement = document.createElement('p');
    messageElement.innerHTML = message;
    chat.appendChild(messageElement);
});

// Handle peer disconnection
socket.on('peer-disconnected', (socketId) => {
    console.log(`Peer disconnected: ${socketId}`);
    const remoteVideo = document.getElementById(`remoteVideo_${socketId}`);
    
    // Close peer connection 
    if (remoteVideo) {
        remoteVideo.remove();
    }
    if (peerConnections[socketId]) {
        peerConnections[socketId].close();
        delete peerConnections[socketId];
    }
    if (dataChannels[socketId]) {
        dataChannels[socketId].close();
        delete dataChannels[socketId];
    }

    const message = `<em>${socketId} left the room</em>`;
    const messageElement = document.createElement('p');
    messageElement.innerHTML = message;
    chat.appendChild(messageElement);
});

// Handle receiving an offer
socket.on('offer', async ({ from, offer }) => {
    const peerConnection = createPeerConnection(from);
    peerConnections[from] = peerConnection;

    // Create an answer and send it to the remote peer
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', { to: from, answer });
});

// Handle receiving an answer
socket.on('answer', async ({ from, answer }) => {
    await peerConnections[from].setRemoteDescription(new RTCSessionDescription(answer));
});

// Handle receiving a candidate
socket.on('candidate', async ({ from, candidate }) => {
    // Add the received ICE candidate to the peer connection
    await peerConnections[from].addIceCandidate(new RTCIceCandidate(candidate));
});

// Start video on button click
startBtn.addEventListener('click', startVideo);

// Send message on button click
sendBtn.addEventListener('click', () => {
    const message = messageInput.value;
    const fullMessage = `${socket.id} > ${message}`;
    // Send the message through all data channels (mesh network)
    Object.values(dataChannels).forEach(channel => channel.send(fullMessage));
    const messageElement = document.createElement('p');
    messageElement.textContent = message;
    chat.appendChild(messageElement);
    messageInput.value = '';
});
