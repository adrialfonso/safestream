// Wrapper for RTCPeerConnection
// This code uses the Web Crypto API to generate RSA key pairs, sign SDP messages, and verify signatures 
// to add an extra layer of security to the WebRTC connection process. It ensures that only the intended 
// recipient can accept the SDP offer and that the offer has not been modified during transmission.
class SecurePeerConnection extends RTCPeerConnection {
    constructor(config) {
        super(config);
        this._isOfferer = false; 
    }
  
    async setLocalDescription(description) {
        if (description.type === 'offer') {
            this._isOfferer = true;

            // Generate key pair, sign the SDP, and export public key and signature
            const { publicKeyBase64, signatureBase64, keyPair } = await generateAndSignSDP(description.sdp);

            console.log('🔐 Public Key (Base64):', publicKeyBase64);
            console.log('✍️ SDP Signature (Base64):', signatureBase64);

            this._keyPair = keyPair; 
        }

        return super.setLocalDescription(description); 
    }
  
    async setRemoteDescription(description) {
        if (description.type === 'offer') {
            const publicKeyBase64 = prompt('🔐 Enter the offerer\'s public key (Base64):');
            const signatureBase64 = prompt('✍️ Enter the SDP signature (Base64):');

            // Verify the signature of the received SDP
            const isValid = await verifySDPSignature(description.sdp, publicKeyBase64, signatureBase64);

            if (!isValid) {
                throw new Error('❌ Invalid signature: connection rejected.');
            }

            console.log('✅ Signature verified successfully. Proceeding with secure connection.');
        }

        return super.setRemoteDescription(description);
    }
}
  
async function generateAndSignSDP(sdp) {
    // Generate an RSA key pair for signing and verification
    const keyPair = await crypto.subtle.generateKey(
        {
            name: 'RSASSA-PKCS1-v1_5',
            modulusLength: 2048, 
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: 'SHA-256',
        },
        true, 
        ['sign', 'verify']
    );

    // Encode the SDP and sign it using the private key
    const encoder = new TextEncoder();
    const data = encoder.encode(sdp);
    const signature = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, keyPair.privateKey, data);

    // Export the public key and convert it to Base64
    const publicKeyBuffer = await crypto.subtle.exportKey('spki', keyPair.publicKey);
    const publicKeyBase64 = arrayBufferToBase64(publicKeyBuffer);

    const signatureBase64 = arrayBufferToBase64(signature);

    return { publicKeyBase64, signatureBase64, keyPair }; 
}

async function verifySDPSignature(sdp, publicKeyBase64, signatureBase64) {
    // Convert Base64-encoded public key and signature to ArrayBuffer
    const publicKeyBuffer = base64ToArrayBuffer(publicKeyBase64);
    const signature = base64ToArrayBuffer(signatureBase64);

    // Import the public key for verification
    const publicKey = await crypto.subtle.importKey(
        'spki',
        publicKeyBuffer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false, 
        ['verify'] 
    );

    // Encode the SDP and verify the signature
    const encoder = new TextEncoder();
    const data = encoder.encode(sdp);

    return await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, publicKey, signature, data);
}

function arrayBufferToBase64(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const buffer = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        buffer[i] = binary.charCodeAt(i);
    }
    return buffer;
}

window.RTCPeerConnection = SecurePeerConnection;
