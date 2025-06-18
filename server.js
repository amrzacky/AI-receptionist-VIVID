// Catch and log any unexpected crash errors
process.on('uncaughtException', function (err) {
  console.error('UNCAUGHT EXCEPTION:', err.stack);
});

// Import core libraries
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const twilio = require('twilio');

// Setup express app and HTTP server
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Log WebSocket connection and incoming messages
wss.on('connection', ws => {
  console.log('✅ WebSocket connected');

  ws.on('message', message => {
    console.log('🎤 Audio message:', message.toString());
    // Later we'll process this with Deepgram + OpenAI
  });

  ws.on('close', () => {
    console.log('❌ WebSocket disconnected');
  });
});

// Home route to check if the app is running
app.get('/', (req, res) => {
  res.send('🎉 AI Receptionist is running on Heroku!');
});

// Twilio voice response route
app.post('/twiml', (req, res) => {
  const response = new twilio.twiml.VoiceResponse();

  response.say("Hi! This is Kate from Vivid Smart. How may I help you today?");
  response.start().stream({
    url: 'wss://ai-receptionist-kate-7fb462c595f0.herokuapp.com' // 🔁 Change this if your Heroku app URL is different
  });

  res.type('text/xml');
  res.send(response.toString());
});

// Start the server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
