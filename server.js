require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { Readable } = require('stream');
const { createClient } = require('@deepgram/sdk');
const twilio = require('twilio');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

wss.on('connection', ws => {
  console.log('✅ WebSocket connected');

  const audioStream = new Readable({ read() {} });

  deepgram.listen.live({ model: 'nova', language: 'en' })
    .then(deepgramLive => {
      audioStream.pipe(deepgramLive);

      deepgramLive.on('transcriptReceived', data => {
        const transcript = data.channel?.alternatives[0]?.transcript;
        if (transcript && transcript.length > 0) {
          console.log("📝 Heard:", transcript);
          // 🔜 You can call OpenAI and ElevenLabs here later
        }
      });

      deepgramLive.on('error', err => {
        console.error('❌ Deepgram error:', err);
      });

      ws.on('message', msg => {
        audioStream.push(msg);
      });

      ws.on('close', () => {
        console.log('❌ WebSocket client disconnected');
        deepgramLive.finish();
      });
    })
    .catch(err => {
      console.error('❌ Failed to connect to Deepgram:', err);
    });
});

app.get('/', (req, res) => {
  res.send('🎉 AI Receptionist is running!');
});

app.post('/twiml', (req, res) => {
  const response = new twilio.twiml.VoiceResponse();

  response.say("Hi! This is Kate from Vivid Smart. How may I help you today?");
  response.start().stream({
    url: `wss://${req.headers.host}/`
  });

  res.type('text/xml');
  res.send(response.toString());
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
