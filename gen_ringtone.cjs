const fs = require('fs');

function generateRingtoneWav(filename) {
  const sampleRate = 44100;
  const ringDuration = 1.5;   // tone: 1.5 sec
  const silenceDuration = 1.5; // pause: 1.5 sec
  const totalDuration = (ringDuration + silenceDuration) * 2; // 2 cycles = 6 sec
  const numSamples = Math.floor(sampleRate * totalDuration);

  const buffer = Buffer.alloc(44 + numSamples * 2);

  // WAV header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);  // PCM
  buffer.writeUInt16LE(1, 22);  // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);

  const cycle = ringDuration + silenceDuration;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const pos = t % cycle;

    let sample = 0;
    if (pos < ringDuration) {
      const env = Math.min(1, Math.min(pos * 30, (ringDuration - pos) * 30));
      sample = Math.round(32767 * 0.55 * env * (
        Math.sin(2 * Math.PI * 440 * t) * 0.5 +
        Math.sin(2 * Math.PI * 480 * t) * 0.5
      ));
    }

    buffer.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), 44 + i * 2);
  }

  fs.writeFileSync(filename, buffer);
  console.log('Ringtone generated:', filename);
}

generateRingtoneWav('public/ringtone.wav');
