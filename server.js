// Catch and show any crash errors
process.on('uncaughtException', function (err) {
  console.error('UNCAUGHT EXCEPTION:', err.stack);
});

// Import libraries
require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { Deepgram } = require('@deepgram/sdk');
const { Readable } = require('stream');
const { OpenAI } = require('openai');
const twilio = require('twilio');
const axios = require('axios');

// Setup APIs
const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Create Express app and server
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// For parsing JSON and urlencoded requests
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// WebSocket audio handling
wss.on('connection', ws => {
  console.log('✅ WebSocket connected');

  const audioStream = new Readable({
    read() {}
  });

  const dgStream = deepgram.transcription.live({
    punctuate: true,
    interim_results: false
  });

  dgStream.on('transcriptReceived', async data => {
    const transcript = JSON.parse(data);
    const text = transcript.channel?.alternatives[0]?.transcript;

    if (text && text.length > 0) {
      console.log('📝 Heard:', text);

      // Send to OpenAI
      const aiReply = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You're Kate, a friendly AI receptionist for a tech support company." },
          { role: "user", content: text }
        ]
      });

      const replyText = aiReply.choices[0].message.content;
      console.log('🤖 AI says:', replyText);

      // Send data to Make.com
      await axios.post(process.env.MAKE_WEBHOOK_URL, {
        question: text,
        answer: replyText
      });
    }
  });

  dgStream.on('error', err => {
    console.error('❌ Deepgram error:', err);
  });

  audioStream.pipe(dgStream);

  ws.on('message', message => {
    audioStream.push(message);
  });

  ws.on('close', () => {
    console.log('❌ WebSocket client disconnected');
    dgStream.finish();
  });
});

// Twilio greeting + streaming
app.post('/twiml', (req, res) => {
  const response = new twilio.twiml.VoiceResponse();
  response.say("Hi! This is Kate from Vivid Smart. How may I help you today?");
  response.start().stream({
    url: `wss://${req.headers.host}/`
  });

  res.type('text/xml');
  res.send(response.toString());
});

// Home page test
app.get('/', (req, res) => {
  res.send('🎉 AI Receptionist is running!');
});

// Start server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
