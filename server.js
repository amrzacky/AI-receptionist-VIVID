const express = require('express');
const expressWs = require('express-ws');
const { Deepgram } = require('@deepgram/sdk');
const { MessagingResponse, VoiceResponse } = require('twilio').twiml;
require('dotenv').config();

const app = express();
expressWs(app);

const PORT = process.env.PORT || 3000;
const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);

// 🔊 WebSocket handler for Twilio <Stream>
app.ws('/media', async (ws, req) => {
  console.log('🔊 WebSocket connected from Twilio');

  const dgConnection = await deepgram.transcription.live({
    model: 'nova-2',
    language: 'en-US',
    smart_format: true,
    interim_results: false,
    vad_events: true,
  });

  console.log('🔗 Connected to Deepgram');

  dgConnection.on('transcriptReceived', (data) => {
    const transcript = JSON.parse(data);
    if (
      transcript.channel &&
      transcript.channel.alternatives &&
      transcript.channel.alternatives[0].transcript
    ) {
      console.log('📝 Transcript:', transcript.channel.alternatives[0].transcript);
    }
  });

  ws.on('message', (msg) => {
    const message = JSON.parse(msg);

    if (message.event === 'start') {
      console.log('📞 Call started');
    } else if (message.event === 'media') {
      const media = Buffer.from(message.media.payload, 'base64');
      dgConnection.send(media);
    } else if (message.event === 'stop') {
      console.log('🛑 Call ended by Twilio');
      dgConnection.finish();
    }
  });

  ws.on('close', () => {
    console.log('🔌 Twilio WebSocket closed');
    dgConnection.finish();
  });
});

// 📞 TwiML response for incoming calls
app.post('/twiml', (req, res) => {
  const twiml = new VoiceResponse();

  twiml.say('Hello, this is Kate from Vivid Smart. How may I help you today?');

  twiml.connect().stream({
    url: `${process.env.BASE_URL}/media`,
    track: 'inbound_track',
    name: 'kate-stream',
  });

  res.type('text/xml');
  res.send(twiml.toString());
});

// ✅ Health check
app.get('/', (req, res) => {
  res.send('AI Receptionist is running!');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});



