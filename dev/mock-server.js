// Minimal Reherza backend mock — mirrors the API reference shapes so the
// mobile app's realtime flows can be exercised without the real backend.
const http = require('http');

const PORT = 4000;
const users = new Map(); // email -> user
const projects = new Map();
const sessions = new Map();
const projectVoices = new Map(); // projectId -> [{speaker,voiceId,voiceName}]
let nextId = 1;
const uuid = (p) => `${p}-${String(nextId++).padStart(4, '0')}`;

// 1.2s of soft 440Hz sine, 16kHz mono 16-bit WAV → base64 (audible TTS stand-in)
function makeWav() {
  const rate = 16000, secs = 1.2, n = Math.floor(rate * secs);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const env = Math.min(1, i / 800, (n - i) / 800);
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 6000 * env), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]).toString('base64');
}
const WAV_B64 = makeWav();

const DEMO_LINES = [
  { speaker: 'CAB DRIVER', text: 'Where to, friend? You look like a man in a hurry.', emotion: 'wry' },
  { speaker: 'OSWALD', text: "North Beckley. And no — I've got all the time in the world.", emotion: 'guarded' },
  { speaker: 'CAB DRIVER', text: 'Everybody says that. Then the meter starts running.', emotion: 'knowing' },
  { speaker: 'OSWALD', text: 'Some things are worth the fare.', emotion: 'resolute' },
];

function parseLines(raw) {
  const out = [];
  (raw || '').split(/\n+/).forEach((l) => {
    const m = l.match(/^\s*([A-Z][A-Z .'-]{1,30}):\s*(.+)$/);
    if (m) out.push({ speaker: m[1].trim(), text: m[2].trim(), emotion: 'neutral' });
  });
  return out.length ? out : DEMO_LINES;
}

function buildProject(userId, title, lines, status = 'ready') {
  const speakers = [...new Set(lines.map((l) => l.speaker))];
  const p = {
    id: uuid('proj'), userId, title,
    rawScript: lines.map((l) => `${l.speaker}: ${l.text}`).join('\n'),
    parsedLines: lines.map((l, i) => ({
      speaker: l.speaker, text: l.text, lineIndex: i, type: 'dialogue',
      role: l.speaker === speakers[1] || speakers.length === 1 ? 'user' : 'ai',
      emotion: l.emotion, intensity: 0.5, spoken: true, confidence: 0.98,
    })),
    speakers, selectedCharacter: null, selectedCharacters: [],
    parseSource: 'gpt-text', parseModel: 'gpt-5-mini', parsedAt: new Date().toISOString(),
    parseStatus: status, parseError: null, sessionCount: 0, lastSessionAt: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  projects.set(p.id, p);
  return p;
}

const send = (res, code, body) => {
  const data = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(data);
};

http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch {}
    const u = new URL(req.url, 'http://x');
    const path = u.pathname.replace(/^\/api/, '');
    const seg = path.split('/').filter(Boolean);
    const authed = (req.headers.authorization || '').startsWith('Bearer ');
    console.log(`${req.method} ${path}`);

    // ── auth ──
    if (path === '/auth/register' && req.method === 'POST') {
      if (users.has(body.email)) return send(res, 400, { error: 'Email already in use' });
      const user = { id: uuid('user'), name: body.name, email: body.email, role: 'user', createdAt: new Date().toISOString() };
      users.set(body.email, { ...user, password: body.password });
      return send(res, 201, { user, token: `tok-${user.id}` });
    }
    if (path === '/auth/login' && req.method === 'POST') {
      const rec = users.get(body.email);
      if (!rec || rec.password !== body.password) return send(res, 401, { error: 'Invalid credentials' });
      const { password, ...user } = rec;
      return send(res, 200, { user, token: `tok-${user.id}` });
    }
    if (path === '/auth/me') {
      if (!authed) return send(res, 401, { error: 'Unauthorized' });
      const first = [...users.values()][0];
      if (!first) return send(res, 401, { error: 'User not found' });
      const { password, ...user } = first;
      return send(res, 200, user);
    }
    if (path === '/auth/logout') return send(res, 200, { message: 'Logged out' });

    // Signed-URL upload target (no bearer header on a signed PUT).
    if (seg[0] === 'put' && req.method === 'PUT') {
      console.log(`  received upload: ${raw.length} bytes`);
      return send(res, 200, {});
    }

    // Test asset: a real MP4 for exercising TakeReview on the emulator.
    if (path === '/sample.mp4') {
      const buf = require('fs').readFileSync(__dirname + '/sample.mp4');
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': buf.length });
      return res.end(buf);
    }

    if (!authed && !['/demo-scenes', '/voices/available', '/billing/plans', '/healthz'].includes(path))
      return send(res, 401, { error: 'Unauthorized' });

    // ── storage & self-tapes ──
    if (path === '/storage/uploads/request-url' && req.method === 'POST') {
      const key = uuid('obj');
      return send(res, 200, {
        uploadURL: `http://10.0.2.2:${PORT}/put/${key}`,
        objectPath: `/objects/uploads/u/${key}`,
        metadata: body,
      });
    }
    if (seg[0] === 'projects' && seg[2] === 'selftapes') {
      if (req.method === 'POST')
        return send(res, 201, { id: uuid('take'), projectId: seg[1], ...body, createdAt: new Date().toISOString() });
      return send(res, 200, []);
    }

    // ── projects ──
    if (path === '/projects' && req.method === 'GET')
      return send(res, 200, [...projects.values()].reverse());
    if (path === '/scripts/import' && req.method === 'POST') {
      const p = buildProject('u', body.title || 'Untitled', parseLines(body.rawScript), 'processing');
      const lines = p.parsedLines; p.parsedLines = []; p.speakers = [];
      setTimeout(() => { p.parsedLines = lines; p.speakers = [...new Set(lines.map((l) => l.speaker))]; p.parseStatus = 'ready'; }, 4000);
      return send(res, 201, p);
    }
    if (seg[0] === 'projects' && seg.length === 2) {
      const p = projects.get(seg[1]);
      if (!p) return send(res, 404, { error: 'Not found' });
      if (req.method === 'GET') return send(res, 200, p);
      if (req.method === 'PATCH') { Object.assign(p, body, { updatedAt: new Date().toISOString() }); return send(res, 200, p); }
      if (req.method === 'DELETE') { projects.delete(p.id); return send(res, 200, { message: 'Deleted' }); }
    }
    if (seg[0] === 'projects' && seg[3] === undefined && seg[2] === 'sessions') {
      const p = projects.get(seg[1]);
      if (!p) return send(res, 404, { error: 'Not found' });
      if (req.method === 'POST') {
        const s = { id: uuid('sess'), projectId: p.id, userId: p.userId, completedLines: 0, redoCount: 0, duration: 0,
          feedback: { linesCompleted: 0, totalLines: p.parsedLines.length, redoCount: 0, durationSeconds: 0, confidenceScore: 0, notes: '' },
          createdAt: new Date().toISOString() };
        sessions.set(s.id, s); p.sessionCount++; p.lastSessionAt = s.createdAt;
        return send(res, 201, s);
      }
      if (req.method === 'GET') return send(res, 200, [...sessions.values()].filter((s) => s.projectId === p.id));
    }
    if (seg[0] === 'projects' && seg[2] === 'sessions' && seg[3]) {
      const s = sessions.get(seg[3]);
      if (!s) return send(res, 404, { error: 'Not found' });
      if (req.method === 'PATCH') { Object.assign(s, body); return send(res, 200, s); }
      return send(res, 200, s);
    }
    if (seg[0] === 'projects' && seg[2] === 'voices') {
      const list = projectVoices.get(seg[1]) || [];
      if (req.method === 'POST') {
        const v = { id: uuid('v'), projectId: seg[1], ...body };
        projectVoices.set(seg[1], [...list.filter((x) => x.speaker !== body.speaker), v]);
        return send(res, 200, v);
      }
      return send(res, 200, list);
    }

    // ── demo scenes ──
    if (path === '/demo-scenes')
      return send(res, 200, [
        { slug: 'oswald-cab', title: 'The Cab Ride', genre: 'Drama', difficulty: 'Intermediate',
          synopsis: 'A tense two-hander between a passenger and a cab driver.', characterCount: 2, lineCount: 4, estimatedDuration: '2 min' },
        { slug: 'table-for-one', title: 'Table for One', genre: 'Comedy', difficulty: 'Beginner',
          synopsis: 'A waiter and a very indecisive diner negotiate the longest dinner order in history.', characterCount: 2, lineCount: 4, estimatedDuration: '2 min' },
      ]);
    if (seg[0] === 'demo-scenes' && seg[2] === 'instantiate') {
      const title = seg[1] === 'oswald-cab' ? 'The Cab Ride' : 'Table for One';
      const existing = [...projects.values()].find((p) => p.title === title);
      if (existing) return send(res, 200, { ...existing, reused: true });
      return send(res, 201, buildProject('u', title, DEMO_LINES));
    }

    // ── voices / tts / speech ──
    if (path === '/voices/available')
      return send(res, 200, [
        { voiceId: 'v-josh', name: 'Josh', description: 'deep, steady', gender: 'male', accent: 'american' },
        { voiceId: 'v-rachel', name: 'Rachel', description: 'warm, natural', gender: 'female', accent: 'american' },
      ]);
    if (path === '/tts') return send(res, 200, { audioBase64: WAV_B64, mimeType: 'audio/wav', mock: true, cached: false });
    if (path === '/tts/pregenerate') return send(res, 200, { total: (body.lines || []).length, generated: (body.lines || []).length, cached: 0, limitReached: false });
    if (path === '/transcribe') return send(res, 200, { transcript: "North Beckley and no I've got all the time in the world", confidence: 0.95 });

    // ── usage / billing ──
    if (path === '/usage/me')
      return send(res, 200, { costMicrosUsed: 1830000, costLimitMicros: 5000000, charsUsed: 42150, charLimit: 100000,
        analysesUsed: 12, analysisLimit: 30, exceeded: false, analysesExceeded: false, isMasterAdmin: false });
    if (path === '/billing/plans')
      return send(res, 200, [
        { id: 'pro', name: 'Pro', priceAmount: 1500, currency: 'usd', billingPeriod: 'month', voiceCharacterLimit: 100000, analysisLimit: 30, features: ['Priority support'], purchasable: true },
        { id: 'studio', name: 'Studio', priceAmount: 3900, currency: 'usd', billingPeriod: 'month', voiceCharacterLimit: 400000, analysisLimit: null, features: ['Everything unlimited'], purchasable: true },
      ]);
    if (path === '/billing/subscription' && req.method === 'GET') return send(res, 200, null);
    if (path === '/healthz') return send(res, 200, { status: 'ok' });

    send(res, 404, { error: 'Not found' });
  });
}).listen(PORT, '0.0.0.0', () => console.log(`mock backend on :${PORT}`));
