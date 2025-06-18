// Catch and show any crash errors
process.on('uncaughtException', function (err) {
  console.error('UNCAUGHT EXCEPTION:', err.stack);
});

// Import libraries
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const twilio = require('twilio');

// Create server and app
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// WebSocket logic
wss.on('connection', ws => {
  console.log('✅ WebSocket connected');

  ws.on('message', message => {
    console.log('🎤 Received audio message:', message.toString());
    // You’ll process audio here with Deepgram/OpenAI later
  });

  ws.on('close', () => {
    console.log('❌ WebSocket client disconnected');
  });
});

// Home page for testing
app.get('/', (req, res) => {
  res.send('🎉 AI Receptionist is running!');
});

// Twilio voice response endpoint
app.post('/twiml', (req, res) => {
  const response = new twilio.twiml.VoiceResponse();

  response.say("Hi! This is Kate from Vivid Smart. How may I help you today?");
  response.start().stream({
    url: 'wss://ai-receptionist-kate.herokuapp.com' // Replace with your app name
  });

  res.type('text/xml');
  res.send(response.toString());
});

// Start server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
