const express = require('express');
const app = express();
const http = require('http').createServer(app);
const WebSocket = require('ws');
const twilio = require('twilio');
require('dotenv').config();

const wss = new WebSocket.Server({ server: http });

// Handle incoming WebSocket connections
wss.on('connection', ws => {
  console.log('WebSocket connected');

  ws.on('message', message => {
    console.log('Received message:', message.toString());
    // 🔄 This is where we’ll later add Deepgram/OpenAI logic
  });

  ws.on('close', () => {
    console.log('WebSocket closed');
  });
});

// Basic route to confirm app is working
app.get('/', (req, res) => {
  res.send('AI Receptionist is running!');
});

// 🚨 Add this TwiML route for Twilio call handling
app.post('/twiml', (req, res) => {
  const response = new twilio.twiml.VoiceResponse();

  response.say("Hi! This is Kate from Vivid Smart. How may I help you today?");
  response.start().stream({
    url: 'wss://ai-receptionist-kate.herokuapp.com'
  });

  res.type('text/xml');
  res.send(response.toString());
});

// Start server
const PORT = process.env.PORT || 8080;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
