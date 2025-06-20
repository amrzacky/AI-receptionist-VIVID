require('dotenv').config();
const express = require('express');
const expressWs = require('express-ws');
const { Deepgram } = require('@deepgram/sdk');
const axios = require('axios');
const { OpenAI } = require('openai');
const { Readable } = require('stream');

const app = express();
expressWs(app);

const port = process.env.PORT || 8080;

const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get('/', (req, res) => {
  res.send('🟢 AI Receptionist is running.');
});

// 🧠 TwiML endpoint for Twilio call response
app.post('/twiml', express.text({ type: '*/*' }), (req, res) => {
  const response = `
    <Response>
      <Start>
        <Stream url="wss://${req.headers.host}/media" />
      </Start>
      <Say voice="Polly.Joanna">Hi, this is Kate from Vivid Smart. How may I help you today?</Say>
      <Pause length="60" />
      <Redirect>/twiml</Redirect>
    </Response>
  `;
  res.type('text/xml');
  res.send(response);
});

// 🎙️ WebSocket endpoint for Twilio <Stream>
app.ws('/media', (ws, req) => {
  console.log('🔊 WebSocket connected');

  let dgStream = deepgram.listen.live({
    model: 'nova-2',
    language: 'en-US',
    interim_results: false,
    smart_format: true,
    vad_events: true
  });

  dgStream.on('transcriptReceived', async (msg) => {
    try {
      const transcript = msg.channel.alternatives[0]?.transcript;
      if (transcript) {
        console.log('📝 Transcript:', transcript);

        const aiResp = await openai.chat.completions.create({
          model: 'gpt-4',
          messages: [
            { role: 'system', content: 'You are a helpful IT support receptionist named Kate. Greet customers, ask questions to understand their issue, and confirm their business name.' },
            { role: 'user', content: transcript }
          ]
        });

        const reply = aiResp.choices[0].message.content;
        console.log('🤖 AI:', reply);

        await axios.post(process.env.MAKE_WEBHOOK_URL, {
          message: reply,
          original: transcript
        });
      }
    } catch (err) {
      console.error('❌ Error in transcript processing:', err);
    }
  });

  dgStream.on('error', (err) => {
    console.error('❌ Deepgram stream error:', err);
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data);

    if (msg.event === 'media') {
      const audio = Buffer.from(msg.media.payload, 'base64');
      dgStream.send(audio);
    } else if (msg.event === 'stop') {
      console.log('🛑 Call ended by Twilio');
      dgStream.finish();
      ws.close();
    }
  });

  ws.on('close', () => {
    console.log('🔌 WebSocket closed');
    dgStream.finish();
  });
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});

