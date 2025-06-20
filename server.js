require('dotenv').config();
const express = require('express');
const expressWs = require('express-ws');
const { Deepgram } = require('@deepgram/sdk');
const axios = require('axios');
const { OpenAI } = require('openai');
const { Twilio } = require('twilio');
const { Readable } = require('stream');

const app = express();
expressWs(app);

const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const port = process.env.PORT || 8080;

app.get('/', (req, res) => {
  res.send('🟢 AI Receptionist is running.');
});

app.post('/twiml', express.text({ type: '*/*' }), (req, res) => {
  const response = `
    <Response>
      <Start>
        <Stream url="wss://${req.headers.host}/media" />
      </Start>
      <Say voice="Polly.Joanna">Hi, this is Kate from Vivid Smart. How may I help you today?</Say>
    </Response>
  `;
  res.type('text/xml');
  res.send(response);
});

app.ws('/media', (ws, req) => {
  console.log('🔊 WebSocket connected');

  let dgConnection;

  const handleTranscript = async (text) => {
    console.log('📝 Transcription:', text);

    const aiResp = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a friendly IT support receptionist. Greet and ask helpful follow-up questions.' },
        { role: 'user', content: text }
      ],
    });

    const reply = aiResp.choices[0].message.content;
    console.log('🤖 AI:', reply);

    await axios.post(process.env.MAKE_WEBHOOK_URL, {
      message: reply,
      original: text
    });
  };

  const stream = deepgram.listen.live({
    model: 'nova-2',
    language: 'en-US',
    interim_results: false,
    smart_format: true,
    vad_events: true
  });

  stream.on('transcriptReceived', (msg) => {
    const transcript = msg.channel.alternatives[0]?.transcript;
    if (transcript) {
      handleTranscript(transcript);
    }
  });

  stream.on('error', console.error);

  ws.on('message', (data) => {
    const msg = JSON.parse(data);

    if (msg.event === 'media') {
      const audio = Buffer.from(msg.media.payload, 'base64');
      stream.send(audio);
    } else if (msg.event === 'stop') {
      console.log('🛑 Call ended');
      stream.finish();
      ws.close();
    }
  });

  ws.on('close', () => {
    console.log('🔌 WebSocket disconnected');
    stream.finish();
  });
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
