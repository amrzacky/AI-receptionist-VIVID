// Catch unexpected errors early
process.on('uncaughtException', function (err) {
  console.error('UNCAUGHT EXCEPTION:', err.stack);
});

// Import required modules
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const twilio = require('twilio');
require('dotenv').config();

// Create Express app and server
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// WebSocket logic (for Deepgram + OpenAI later)
wss.on('connection', ws => {
  console.log('🔌 WebSocket client connected');

  ws.on('message', message => {
    console.log('🎤 Received audio:', message.toString());
    // TODO: Add Deepgram + OpenAI handling here
  });

  ws.on('close', () => {
    console.log('❌ WebSocket client disconnected');
  });
});

// Default route for testing
app.get('/', (req, res) => {
  res.send('🎉 AI Receptionist is running!');
});

// Twilio call route
app.post('/twiml', (req, res) => {
  const response = new twilio.twiml.VoiceResponse();

  response.say("Hi! This is Kate from Vivid Smart. How may I help you today?");
  response.start().stream({
    url: 'wss://ai-receptionist-kate.herokuapp.com' // Replace with your Heroku app URL if different
  });

  res.type('text/xml');
  res.send(response.toString());
});

// Start the server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
