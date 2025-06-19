// Catch and show crash errors
process.on('uncaughtException', function (err) {
  console.error('UNCAUGHT EXCEPTION:', err.stack);
});

// Load environment variables
require('dotenv').config();

// Import libraries
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { Deepgram } = require('@deepgram/sdk');
const { Readable } = require('stream');
const twilio = require('twilio');

// Setup Deepgram
const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// WebSocket audio processing
wss.on('connection', ws => {
  console.log('✅ WebSocket connected');

  const audioStream = new Readable({
    read() {}
  });

  const dgConnection = deepgram.listen.live({
    model: 'general',
    language: 'en-US',
    smart_format: true,
    interim_results: false
  });

  dgConnection.addListener('transcriptReceived', (data) => {
    const transcript = JSON.parse(data);
    const text = transcript.channel?.alternatives[0]?.transcript;
    if (text && text.length > 0) {
      console.log('📝 Heard:', text);
      // 🚧 Later: Send to OpenAI + ElevenLabs here
    }
  });

  dgConnection.addListener('error', err => {
    console.error('❌ Deepgram error:', err);
  });

  audioStream.pipe(dgConnection);

  ws.on('message', message => {
    audioStream.push(message);
  });

  ws.on('close', () => {
    console.log('❌ WebSocket client disconnected');
    dgConnection.finish();
  });
});

// Test home page
app.get('/', (req, res) => {
  res.send('🎉 AI Receptionist is running!');
});

// Twilio voice response
app.post('/twiml', (req, res) => {
  const response = new twilio.twiml.VoiceResponse();

  response.say("Hi! This is Kate from Vivid Smart. How may I help you today?");
  response.start().stream({
    url: `wss://${req.headers.host}/`
  });

  res.type('text/xml');
  res.send(response.toString());
});

// Start the server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

