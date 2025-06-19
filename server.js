const express = require('express');
const { Deepgram } = require('@deepgram/sdk');
const { Twilio } = require('twilio');
const bodyParser = require('body-parser');
const { Readable } = require('stream');
const axios = require('axios');
const WebSocket = require('ws');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;

app.post('/twiml', (req, res) => {
  const response = `
    <Response>
      <Start>
        <Stream url="wss://${req.headers.host}/media"/>
      </Start>
      <Say voice="Polly.Joanna">Hello, this is Kate from Zyvai Tech. How may I help you today?</Say>
    </Response>
  `;
  res.set('Content-Type', 'text/xml');
  res.send(response);
});

app.ws('/media', (ws, req) => {
  let deepgramSocket;

  ws.on('message', async (msg) => {
    const message = JSON.parse(msg);

    if (message.event === 'start') {
      const { stream } = await deepgram.listen.live({
        model: 'nova',
        punctuate: true,
        language: 'en-US',
        interim_results: false,
      });

      deepgramSocket = stream;

      deepgramSocket.on('transcriptReceived', async (data) => {
        const transcript = data.channel.alternatives[0].transcript;
        if (transcript) {
          console.log('🎤 Caller:', transcript);

          // Send to OpenAI for understanding
          const aiResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4',
            messages: [
              { role: 'system', content: 'You are a helpful AI receptionist for an IT support and toner sales company.' },
              { role: 'user', content: transcript }
            ]
          }, {
            headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }
          });

          const aiText = aiResponse.data.choices[0].message.content;
          console.log('🤖 AI:', aiText);

          // Send AI response to ElevenLabs to generate audio
          const elevenResponse = await axios.post('https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL/stream', {
            text: aiText,
            model_id: "eleven_monolingual_v1",
            voice_settings: { stability: 0.5, similarity_boost: 0.75 }
          }, {
            headers: {
              'xi-api-key': ELEVENLABS_API_KEY,
              'Content-Type': 'application/json'
            },
            responseType: 'arraybuffer'
          });

          // Send to Make.com webhook (optional)
          await axios.post(MAKE_WEBHOOK_URL, {
            question: transcript,
            response: aiText
          });

          // TODO: Play audio back via Twilio Media Streams (future step)
        }
      });

      deepgramSocket.on('error', console.error);
      deepgramSocket.on('close', () => console.log('Deepgram closed.'));
    }

    if (message.event === 'media' && deepgramSocket) {
      const audioData = Buffer.from(message.media.payload, 'base64');
      deepgramSocket.send(audioData);
    }

    if (message.event === 'stop' && deepgramSocket) {
      deepgramSocket.finish();
    }
  });

  ws.on('close', () => {
    if (deepgramSocket) deepgramSocket.finish();
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

