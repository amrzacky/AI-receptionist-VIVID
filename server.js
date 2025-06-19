// Catch and show any crash errors
process.on('uncaughtException', function (err) {
  console.error('UNCAUGHT EXCEPTION:', err.stack);
});

// Import libraries
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { Deepgram } = require('@deepgram/sdk');
const { Readable } = require('stream');
const twilio = require('twilio');
require('dotenv').config();

// Setup Deepgram
const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// WebSocket audio processing
wss.on('connection', ws => {
  console.log('✅ WebSocket connected');

  const audioStream = new Readable({ read() {} });

  const deepgramLive = deepgram.transcription.live({
    punctuate: true,
    interim_results: false
  });

  deepgramLive.on('transcriptReceived', data => {
    const transcript = JSON.parse(data);
    const text = transcript.channel?.alternatives[0]?.transcript;
    if (text && text.length > 0) {
      console.log('📝 Heard:', text);
    }
  });

  deepgramLive.on('error', err => {
    console.error('❌ Deepgram error:', err);
  });

  audioStream.pipe(deepgramLive);

  ws.on('message', message => {
    audioStream.push(message);
  });

  ws.on('close', () => {
    console.log('❌ WebSocket client disconnected');
    deepgramLive.finish();
  });
});

// Test home page
app.get('/', (req, res) => {
  res.send('🎉 AI Receptionist is running!');
});

// Twilio Voice stream
app.post('/twiml', (req, res) => {
  const response = new twilio.twiml.VoiceResponse();

  response.say("Hi! This is Kate from Vivid Smart. How may I help you today?");
  response.start().stream({
    url: `wss://${req.headers.host}/`
  });

  res.type('text/xml');
  res.send(response.toString());
});

// Start server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
