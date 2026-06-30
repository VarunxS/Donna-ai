import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { scheduleMeeting, getSchedule } from './mockCalendar.js';

const DB_FILE = process.env.PERSISTENT_DB_PATH || path.resolve('donna_db.json');

function loadDatabase() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Failed to load database, returning empty:', err.message);
  }
  return { users: {} };
}

function saveDatabase(db) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save database:', err.message);
  }
}

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// ---------------------------------------------------------------------------
// Gemini client — reads GEMINI_API_KEY from environment
// ---------------------------------------------------------------------------
const apiKey = process.env.GEMINI_API_KEY;
let ai = null;

if (apiKey) {
  ai = new GoogleGenAI({ apiKey });
  console.log('✅ Gemini API key loaded');
} else {
  console.warn('⚠️  GEMINI_API_KEY not set — all requests will return 503');
}

function getAiClient(req) {
  const customKey = req.headers['x-gemini-key'];
  if (customKey && customKey.trim()) {
    return new GoogleGenAI({ apiKey: customKey.trim() });
  }
  return ai;
}

// ---------------------------------------------------------------------------
// POST /api/gemini
// Body: { prompt: string, systemPrompt?: string, jsonMode?: boolean }
// Returns: { text: string } or { json: object } when jsonMode is true
// ---------------------------------------------------------------------------
app.post('/api/gemini', async (req, res) => {
  const clientAi = getAiClient(req);
  if (!clientAi) {
    return res.status(503).json({ error: 'Gemini API key not configured' });
  }

  const { prompt, systemPrompt, jsonMode } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  try {
    const config = {};

    if (systemPrompt) {
      config.systemInstruction = systemPrompt;
    }

    if (jsonMode) {
      config.responseMimeType = 'application/json';
    }

    const response = await clientAi.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config,
    });

    const text = response.text;

    if (jsonMode) {
      try {
        const parsed = JSON.parse(text);
        return res.json({ json: parsed });
      } catch {
        // If JSON parsing fails, return the raw text so client can handle it
        return res.json({ text, jsonParseError: true });
      }
    }

    return res.json({ text });
  } catch (err) {
    console.error('Gemini API error:', err.message);
    return res.status(502).json({ error: 'Gemini API call failed', details: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/donna
// Body: { history: Array<{role: string, parts: Array<{text: string}>}>, systemPrompt: string }
// Handles multi-turn chat + Function Calling for Donna
// ---------------------------------------------------------------------------
const donnaTools = [{
  functionDeclarations: [
    {
      name: 'schedule_meeting',
      description: 'Schedules a meeting with someone.',
      parameters: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', description: 'The title or topic of the meeting' },
          contactName: { type: 'STRING', description: 'The person to meet with' },
          timeString: { type: 'STRING', description: 'The time of the meeting, e.g. Tomorrow at 3 PM' },
          dateTime: { type: 'STRING', description: 'The ISO 8601 local datetime of the meeting, e.g. 2026-06-27T18:30:00. Use the local timezone of the current time.' }
        },
        required: ['title', 'contactName', 'timeString', 'dateTime']
      }
    },
    {
      name: 'get_schedule',
      description: 'Gets a list of all currently scheduled meetings.',
      parameters: { type: 'OBJECT', properties: {} }
    },
    {
      name: 'create_deadline',
      description: 'Creates a new deadline/reminder task for the user.',
      parameters: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', description: 'The title of the task/deadline' },
          deadline: { type: 'STRING', description: 'The date and time of the deadline, e.g. today at 6:30 PM, tomorrow 5 PM, Friday' }
        },
        required: ['title', 'deadline']
      }
    },
    {
      name: 'complete_deadline',
      description: 'Marks an existing deadline/reminder task as complete.',
      parameters: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', description: 'The exact or approximate title of the task to complete' }
        },
        required: ['title']
      }
    },
    {
      name: 'delete_deadline',
      description: 'Deletes or removes a deadline/reminder task.',
      parameters: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', description: 'The title of the task to delete' }
        },
        required: ['title']
      }
    }
  ]
}];

app.post('/api/donna', async (req, res) => {
  const clientAi = getAiClient(req);
  if (!clientAi) return res.status(503).json({ error: 'Gemini API key not configured' });

  let { history, systemPrompt } = req.body;
  if (!history || !Array.isArray(history)) return res.status(400).json({ error: 'history array is required' });

  console.log('\n=== DONNA REQUEST ===');
  console.log('Incoming History:', JSON.stringify(history, null, 2));

  try {
    const config = {
      tools: donnaTools,
      systemInstruction: systemPrompt || "You are Donna, a highly capable AI assistant.",
    };

    // First call to Gemini
    let response = await clientAi.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: history,
      config,
    });

    console.log('Gemini first response functionCalls:', response.functionCalls);

    let actions = [];

    // Check if Gemini wants to call a function
    if (response.functionCalls && response.functionCalls.length > 0) {
      const call = response.functionCalls[0];
      const functionName = call.name;
      const args = call.args || {};
      
      console.log(`Executing tool "${functionName}" with args:`, args);

      let functionResult;
      if (functionName === 'schedule_meeting') {
        functionResult = scheduleMeeting(args.title, args.contactName, args.timeString, args.dateTime);
        // Also push a create_deadline action so that a corresponding task card is created on the home screen!
        actions.push({ 
          type: 'create_deadline', 
          title: `Meeting with ${args.contactName}: ${args.title}`, 
          deadline: args.dateTime 
        });
      } else if (functionName === 'get_schedule') {
        functionResult = getSchedule();
      } else if (functionName === 'create_deadline') {
        functionResult = { status: 'success', message: `Requested creation of deadline "${args.title}" due ${args.deadline}` };
        actions.push({ type: 'create_deadline', title: args.title, deadline: args.deadline });
      } else if (functionName === 'complete_deadline') {
        functionResult = { status: 'success', message: `Requested completion of deadline "${args.title}"` };
        actions.push({ type: 'complete_deadline', title: args.title });
      } else if (functionName === 'delete_deadline') {
        functionResult = { status: 'success', message: `Requested deletion of deadline "${args.title}"` };
        actions.push({ type: 'delete_deadline', title: args.title });
      }

      console.log('Tool Execution Result:', functionResult);

      // Add the model's function call to history (with matching call id if present)
      const fcPart = { name: functionName, args };
      if (call.id) fcPart.id = call.id;

      history.push({
        role: 'model',
        parts: [{ functionCall: fcPart }]
      });

      // Add the function response to history (with matching call id if present)
      const frPart = { name: functionName, response: functionResult };
      if (call.id) frPart.id = call.id;

      history.push({
        role: 'user',
        parts: [{ functionResponse: frPart }]
      });

      // Second call to Gemini to get the text response after executing the function
      response = await clientAi.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: history,
        config,
      });
      console.log('Gemini second response text:', response.text);
    }

    const text = response.text;
    console.log('Final Text Response:', text);
    console.log('Actions Returned:', actions);
    
    // Add the final response to history
    history.push({
      role: 'model',
      parts: [{ text }]
    });

    return res.json({ text, history, actions });
  } catch (err) {
    console.error('Donna API error:', err);
    const errMsg = err.message || '';
    if (errMsg.includes('Quota exceeded') || errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
      return res.status(429).json({ 
        error: 'Quota Exceeded', 
        details: 'You have exceeded the Gemini API Free Tier daily limit (20 requests/day). Please wait a bit or upgrade your AI Studio plan.' 
      });
    }
    return res.status(502).json({ error: 'Donna API call failed', details: errMsg });
  }
});

// ---------------------------------------------------------------------------
// GET /api/meetings
// ---------------------------------------------------------------------------
app.get('/api/meetings', (_req, res) => {
  res.json(getSchedule());
});

// ---------------------------------------------------------------------------
// POST /api/meetings
// ---------------------------------------------------------------------------
app.post('/api/meetings', (req, res) => {
  const { title, contactName, time, dateTime } = req.body;
  if (!title || !contactName) {
    return res.status(400).json({ error: 'title and contactName are required' });
  }
  const result = scheduleMeeting(title, contactName, time || 'Today', dateTime);
  res.json(result);
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// Body: { email: string, password: string }
// Returns: { success: true, user: { email, profile, tasks, record, meetings } }
//          or { success: false, error: string }
// ---------------------------------------------------------------------------
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'email and password are required' });
  }

  const key = email.toLowerCase().trim();
  const hash = crypto.createHash('sha256').update(password).digest('hex');
  const db = loadDatabase();

  if (!db.users[key]) {
    // New user — register them
    db.users[key] = {
      email: key,
      passwordHash: hash,
      profile: {},
      tasks: [],
      record: { kept: 0, broken: 0, history: [] },
      meetings: [],
      createdAt: new Date().toISOString(),
    };
    saveDatabase(db);
    console.log(`✅ New user registered: ${key}`);
    return res.json({ success: true, isNew: true, user: db.users[key] });
  }

  // Existing user — validate password
  if (db.users[key].passwordHash !== hash) {
    return res.status(401).json({ success: false, error: 'Incorrect password' });
  }

  console.log(`✅ User logged in: ${key}`);
  return res.json({ success: true, isNew: false, user: db.users[key] });
});

// ---------------------------------------------------------------------------
// POST /api/sync
// Body: { email: string, password: string, tasks, record, meetings, profile }
// Returns: { success: true } or { success: false, error: string }
// ---------------------------------------------------------------------------
app.post('/api/sync', (req, res) => {
  const { email, password, tasks, record, meetings, profile } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'email and password are required' });
  }

  const key = email.toLowerCase().trim();
  const hash = crypto.createHash('sha256').update(password).digest('hex');
  const db = loadDatabase();

  if (!db.users[key] || db.users[key].passwordHash !== hash) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  // Merge updates — only overwrite fields that are provided
  if (tasks !== undefined)   db.users[key].tasks    = tasks;
  if (record !== undefined)  db.users[key].record   = record;
  if (meetings !== undefined) db.users[key].meetings = meetings;
  if (profile !== undefined) db.users[key].profile  = profile;
  db.users[key].lastSyncAt = new Date().toISOString();

  saveDatabase(db);
  return res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    geminiConfigured: !!ai,
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Serve built React frontend (production)
// ---------------------------------------------------------------------------
const DIST_DIR = path.resolve('dist');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  // SPA catch-all — let React Router handle client-side routes
  app.get(/^\/(.*)/, (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`🚀 DONNA proxy server running on http://localhost:${PORT}`);
});
