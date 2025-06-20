require('dotenv').config();
const express = require('express');
const expressWs = require('express-ws');
const { createClient } = require('@deepgram/sdk');
const axios = require('axios');
const { OpenAI } = require('openai');

const app = express();
expressWs(app);

const port = process.env.PORT || 8080;

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get('/', (req, res) => {
  res.send('🟢 AI Receptionist is running.');
});

// 🔁 TwiML endpoint for Twilio to get voice instructions
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

// 🔊 Handle audio stream from Twilio via WebSocket
app.ws('/media', async (ws, req) => {
  console.log('🔊 WebSocket connected from Twilio');

  const dgConnection = deepgram.listen.live({
    model: 'nova-2',
    language: 'en-US',
    smart_format: true,
    interim_results: false,
    vad_events: true,
  });

  console.log('🔗 Connected to Deepgram');

  dgConnection.on('transcriptReceived', async (data) => {
    const transcript = data.channel.alternatives[0]?.transcript;
    if (transcript) {
      console.log('📝 Transcription:', transcript);

      try {
        const aiResp = await openai.chat.completions.create({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content:
                'You are a helpful IT support receptionist. Greet and ask smart follow-up questions.',
            },
            { role: 'user', content: transcript },
          ],
        });

        const reply = aiResp.choices[0].message.content;
        console.log('🤖 AI:', reply);

        // 🔁 Send result to Make.com or any webhook
        await axios.post(process.env.MAKE_WEBHOOK_URL, {
          message: reply,
          original: transcript,
        });
      } catch (err) {
        console.error('❌ OpenAI or webhook error:', err.message);
      }
    }
  });

  dgConnection.on('error', (err) => {
    console.error('❌ Deepgram error:', err);
  });

  ws.on('message', (msg) => {
    const data = JSON.parse(msg);
    if (data.event === 'media') {
      const audio = Buffer.from(data.media.payload, 'base64');
      dgConnection.send(audio);
    } else if (data.event === 'stop') {
      console.log('🛑 Call ended by Twilio');
      dgConnection.finish();
      ws.close();
    }
  });

  ws.on('close', () => {
    console.log('🔌 Twilio WebSocket closed');
    dgConnection.finish();
  });
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});



