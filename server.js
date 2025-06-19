// Catch any crash errors
process.on('uncaughtException', function (err) {
  console.error('UNCAUGHT EXCEPTION:', err.stack);
});

// Import required libraries
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { Deepgram } = require('@deepgram/sdk');
const { Readable } = require('stream');
const twilio = require('twilio');
const OpenAI = require('openai');
require('dotenv').config();

// Init Deepgram + OpenAI
const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Setup Express + WebSocket
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// WebSocket audio handling
wss.on('connection', ws => {
  console.log('✅ WebSocket connected');

  const audioStream = new Readable({
    read() {}
  });

  const dgConnection = deepgram.transcription.live({
    punctuate: true,
    interim_results: false
  });

  dgConnection.on('transcriptReceived', async data => {
    const transcript = JSON.parse(data);
    const text = transcript.channel?.alternatives[0]?.transcript;
    if (text && text.length > 0) {
      console.log('📝 Heard:', text);

      // Optional: Get OpenAI response (future step)
      // const aiResponse = await openai.chat.completions.create({
      //   model: 'gpt-4',
      //   messages: [{ role: 'user', content: text }]
      // });
      // console.log('🤖 AI:', aiResponse.choices[0].message.content);
    }
  });

  dgConnection.on('error', err => {
    console.error('❌ Deepgram error:', err);
  });

  audioStream.pipe(dgConnection);

  ws.on('message', msg => {
    audioStream.push(msg);
  });

  ws.on('close', () => {
    console.log('❌ WebSocket client disconnected');
    dgConnection.finish();
  });
});

// Home test endpoint
app.get('/', (req, res) => {
  res.send('🎉 AI Receptionist is running!');
});

// TwiML endpoint
app.post('/twiml', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say("Hi! This is Kate from Vivid Smart. How may I help you today?");
  twiml.start().stream({
    url: `wss://${req.headers.host}/`
  });

  res.type('text/xml');
  res.send(twiml.toString());
});

// Start server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
