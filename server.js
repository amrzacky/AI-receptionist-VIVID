const express = require('express');
const app = express();
const http = require('http').createServer(app);
const WebSocket = require('ws');
const wss = new WebSocket.Server({ server: http });

require('dotenv').config();

wss.on('connection', ws => {
    console.log('WebSocket connected');
    ws.on('message', message => {
        console.log('Received:', message);
        // Here you'd add Deepgram/OpenAI/ElevenLabs logic
    });
});

app.get('/', (req, res) => {
    res.send('AI Receptionist is running!');
});

const PORT = process.env.PORT || 8080;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
