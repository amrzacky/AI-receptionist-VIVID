require('dotenv').config();
const express = require('express');
const expressWs = require('express-ws');
const { createClient } = require('@deepgram/sdk');
const { OpenAI } = require('openai');
const axios = require('axios');

const app = express();
expressWs(app);

const port = process.env.PORT || 8080;

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get('/', (req, res) => {
  res.send('🟢 AI Receptionist is running.');
});

// ✅ Twilio TwiML endpoint
app.post('/twiml', express.text({ type: '*/*' }), (req, res) => {
  const response = `
    <Response>
      <Start>
        <Stream url="wss://${req.headers.host}/media" />
      </Start>
      <Say voice="Polly.Joanna">Hi, this is Kate from Vivid Smart. How may I help you today?</Say>
      <Pause length="60" />
    </Response>
  `;
  res.type('text/xml');
  res.send(response);
});

// ✅ WebSocket endpoint for Twilio Media Stream
app.ws('/media', async (ws) => {
  console.log('🔊 WebSocket connected');

  const dgConnection = await deepgram.listen.live.v("1").transcribe({
    model: 'nova-2',
    language: 'en-US',
    smart_format: true,
    interim_results: false,
    vad_events: true,
  });

  dgConnection.on('transcriptReceived', async (data) => {
    const transcript = data.channel.alternatives[0]?.transcript;
    if (transcript) {
      console.log('📝 Transcription:', transcript);

      const aiResp = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful IT support receptionist. Greet the caller and ask smart follow-up questions based on the issue.',
          },
          {
            role: 'user',
            content: transcript,
          },
        ],
      });

      const reply = aiResp.choices[0].message.content;
      console.log('🤖 AI:', reply);

      // Send transcription + AI reply to Make.com
      await axios.post(process.env.MAKE_WEBHOOK_URL, {
        message: reply,
        original: transcript,
      });
    }
  });

  dgConnection.on('error', console.error);

  ws.on('message', (msg) => {
    const data = JSON.parse(msg);
    if (data.event === 'media') {
      const audio = Buffer.from(data.media.payload, 'base64');
      dgConnection.send(audio);
    } else if (data.event === 'stop') {
      console.log('🛑 Call ended');
      dgConnection.finish();
      ws.close();
    }
  });

  ws.on('close', () => {
    console.log('🔌 WebSocket closed');
    dgConnection.finish();
  });
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});


