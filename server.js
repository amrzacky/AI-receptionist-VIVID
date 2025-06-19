// Catch and show crash errors
process.on('uncaughtException', function (err) {
  console.error('UNCAUGHT EXCEPTION:', err.stack);
});

// Import libraries
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { Readable } = require('stream');
const { Deepgram } = require('@deepgram/sdk');
const twilio = require('twilio');
require('dotenv').config();

// Setup Deepgram with API Key from .env
const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Parse incoming JSON and URL-encoded data (optional but good practice)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// WebSocket logic for streaming audio to Deepgram
wss.on('connection', ws => {
  console.log('✅ WebSocket connected');

  const audioStream = new Readable({
    read() {}
  });

  const dgLive = deepgram.transcription.live({
    punctuate: true,
    interim_results: false
  });

  dgLive.on('transcriptReceived', data => {
    const transcript = JSON.parse(data);
    const text = transcript.channel?.alternatives[0]?.transcript;
    if (text && text.length > 0) {
      console.log('📝 Heard:', text);

      // 🚧 NEXT STEP: Send `text` to OpenAI here and respond via ElevenLabs
    }
  });

  dgLive.on('error', err => {
    console.error('❌ Deepgram error:', err);
  });

  audioStream.pipe(dgLive);

  ws.on('message', message => {
    audioStream.push(message);
  });

  ws.on('close', () => {
    console.log('❌ WebSocket client disconnected');
    dgLive.finish();
  });
});

// Test home page
app.get('/', (req, res) => {
  res.send('🎉 AI Receptionist is running!');
});

// Twilio will request this endpoint
app.post('/twiml', (req, res) => {
  const response = new twilio.twiml.VoiceResponse();

  response.say("Hi! This is Kate from Vivid Smart. How may I help you today?");
  response.start().stream({
    url: `wss://${req.headers.host}/`
  });

  res.type('text/xml');
  res.send(response.toString());
});

// Start server on correct port
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
