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
const deepgram = new Deepgram({ apiKey: process.env.DEEPGRAM_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

wss.on('connection', ws => {
  console.log('✅ WebSocket connected');

  const audioStream = new Readable({
    read() {}
  });

  const dgConnection = deepgram.listen.live({
    model: 'nova',
    language: 'en-US',
    smart_format: true,
    interim_results: false
  });

  dgConnection.addListener('transcriptReceived', async data => {
    const transcript = data.channel?.alternatives[0]?.transcript;
    if (transcript) {
      console.log('📝 Heard:', transcript);

      // Send transcript to OpenAI
      const aiReply = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are Kate, a helpful AI receptionist.' },
          { role: 'user', content: transcript }
        ]
      });

      const replyText = aiReply.choices[0].message.content;
      console.log('🤖 AI says:', replyText);

      // Send both question and answer to Make.com
      await axios.post(process.env.MAKE_WEBHOOK_URL, {
        question: transcript,
        answer: replyText
      });
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
    console.log('❌ WebSocket disconnected');
    dgConnection.finish();
  });
});

app.post('/twiml', (req, res) => {
  const response = new twilio.twiml.VoiceResponse();
  response.say("Hi! This is Kate from Vivid Smart. How may I help you today?");
  response.start().stream({ url: `wss://${req.headers.host}/` });

  res.type('text/xml');
  res.send(response.toString());
});

app.get('/', (req, res) => {
  res.send('🎉 AI Receptionist is running!');
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
