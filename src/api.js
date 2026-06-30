// ============================================================================
// API Service — Client-side layer for Gemini calls via the Express proxy.
// Handles DEMO_MODE, timeouts, fallbacks, and structured generation.
// ============================================================================

import {
  DEMO_MODE,
  DEMO_RESPONSES,
  DEMO_CRITICAL_NUDGE,
  DEMO_FORFEIT_MESSAGE,
  FALLBACK_ARTIFACT_TEMPLATES,
  FALLBACK_CONSEQUENCE,
  parseDateFallback,
  guessTaskType,
} from './demoMode';

import {
  TASK_PARSE_PROMPT,
  ARTIFACT_PROMPTS,
  CONSEQUENCE_PROMPT,
  CRITICAL_NUDGE_PROMPT,
  FORFEIT_PROMPT,
  PARSE_SCHEDULE_PROMPT,
} from './prompts';

const TIMEOUT_MS = 20000;

// ---------------------------------------------------------------------------
// Profile Memory Helpers
// ---------------------------------------------------------------------------
function getUserProfile() {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem('donna_user_profile');
    return stored ? JSON.parse(stored) : null;
  } catch (e) {
    console.warn('Failed to parse user profile:', e);
    return null;
  }
}

function injectUserProfile(promptText) {
  const profile = getUserProfile();
  if (!profile) return promptText;

  const profileStr = `
[USER PERSONALIZATION MEMORY PROFILE]
- User Focus/Occupation: ${profile.occupation}
- Accountability Contact: ${profile.accountabilityName} (Email: ${profile.accountabilityEmail})
- Procrastination Tendency/Distraction: ${profile.procrastinationHabits}
*Instruction: Customize all outputs based on this profile. Reference the distraction tendency in consequences, tailor outlines to the occupation, and use the accountability contact details if relevant.*
`;
  return `${promptText}\n${profileStr}`;
}

// ---------------------------------------------------------------------------
// Low-level: call the proxy with timeout
// ---------------------------------------------------------------------------
async function callGemini({ prompt, systemPrompt, jsonMode = false }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const personalizedSystemPrompt = systemPrompt ? injectUserProfile(systemPrompt) : systemPrompt;

  try {
    const res = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        prompt, 
        systemPrompt: personalizedSystemPrompt, 
        jsonMode 
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error('Gemini request timed out (8s)');
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Inject current timestamp into prompt templates
// ---------------------------------------------------------------------------
function injectNow(prompt) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const date = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  const localIso = `${year}-${month}-${date}T${hours}:${minutes}:${seconds}`;
  
  const offsetMinutes = now.getTimezoneOffset();
  const offsetSign = offsetMinutes <= 0 ? '+' : '-';
  const absOffsetMinutes = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absOffsetMinutes / 60)).padStart(2, '0');
  const offsetMins = String(absOffsetMinutes % 60).padStart(2, '0');
  const timezoneStr = `${offsetSign}${offsetHours}:${offsetMins}`;

  const localTimeStr = `${localIso} (Local Time, GMT${timezoneStr})`;
  return prompt.replace('{{NOW}}', localTimeStr);
}

// ---------------------------------------------------------------------------
// 1. PARSE TASK — Takes messy input, returns structured task data
// ---------------------------------------------------------------------------
export async function parseTask(rawInput) {
  // DEMO_MODE: pick the best matching demo response
  if (DEMO_MODE) {
    const type = guessTaskType(rawInput);
    const demo = DEMO_RESPONSES[type] || DEMO_RESPONSES.generic;
    return { ...demo, id: crypto.randomUUID() };
  }

  try {
    const result = await callGemini({
      prompt: `Parse this task:\n"${rawInput}"`,
      systemPrompt: injectNow(TASK_PARSE_PROMPT),
      jsonMode: true,
    });

    if (result.json) {
      return {
        ...result.json,
        id: crypto.randomUUID(),
      };
    }

    // If JSON parsing failed on the server, try to parse the text
    if (result.text) {
      try {
        const parsed = JSON.parse(result.text);
        return { ...parsed, id: crypto.randomUUID() };
      } catch {
        // Fall through to fallback
      }
    }

    throw new Error('Invalid response format');
  } catch (err) {
    console.warn('parseTask Gemini call failed, using fallback:', err.message);
    return fallbackParse(rawInput);
  }
}

// ---------------------------------------------------------------------------
// 2. GENERATE HEAD START ARTIFACT — Uses task-type-specific prompt
// ---------------------------------------------------------------------------
export async function generateArtifact(task) {
  if (DEMO_MODE) {
    const demo = DEMO_RESPONSES[task.task_type] || DEMO_RESPONSES.generic;
    return demo.head_start_artifact;
  }

  const artifactPrompt = ARTIFACT_PROMPTS[task.task_type] || ARTIFACT_PROMPTS.generic;

  try {
    const result = await callGemini({
      prompt: `Generate a head-start artifact for this task:\nTitle: "${task.title}"\nDeadline: ${task.deadline}\nTask type: ${task.task_type}\n\nOriginal user input context: The user needs to complete "${task.title}" by ${task.deadline}.`,
      systemPrompt: injectNow(artifactPrompt),
    });

    return result.text || fallbackArtifact(task);
  } catch (err) {
    console.warn('generateArtifact failed, using fallback:', err.message);
    return fallbackArtifact(task);
  }
}

// ---------------------------------------------------------------------------
// 3. GENERATE CONSEQUENCE CARD — Separate call, specific and realistic
// ---------------------------------------------------------------------------
export async function generateConsequence(task) {
  if (DEMO_MODE) {
    const demo = DEMO_RESPONSES[task.task_type] || DEMO_RESPONSES.generic;
    return demo.consequence_card;
  }

  try {
    const result = await callGemini({
      prompt: `Generate a consequence projection for this task:\nTitle: "${task.title}"\nDeadline: ${task.deadline}\nTask type: ${task.task_type}\n\nWhat specifically, concretely happens if the user misses this deadline?`,
      systemPrompt: injectNow(CONSEQUENCE_PROMPT),
    });

    return result.text || FALLBACK_CONSEQUENCE;
  } catch (err) {
    console.warn('generateConsequence failed, using fallback:', err.message);
    return FALLBACK_CONSEQUENCE;
  }
}

// ---------------------------------------------------------------------------
// 4. GENERATE CRITICAL NUDGE — References consequence card content
// ---------------------------------------------------------------------------
export async function generateCriticalNudge(task) {
  if (DEMO_MODE) {
    return DEMO_CRITICAL_NUDGE;
  }

  const hoursLeft = Math.max(0, (new Date(task.deadline) - new Date()) / (1000 * 60 * 60));
  const timeRemaining = hoursLeft < 1
    ? `${Math.round(hoursLeft * 60)} minutes`
    : `${Math.round(hoursLeft * 10) / 10} hours`;

  const prompt = CRITICAL_NUDGE_PROMPT
    .replace('{{TASK_TITLE}}', task.title)
    .replace(/\{\{TIME_REMAINING\}\}/g, timeRemaining)
    .replace('{{HAS_STARTED}}', task.hasStarted ? 'true' : 'false')
    .replace('{{CONSEQUENCE_CARD}}', task.consequence_card || '');

  try {
    const result = await callGemini({
      prompt: `Generate a critical-state nudge for the task "${task.title}" with ${timeRemaining} remaining.`,
      systemPrompt: injectNow(prompt),
    });

    return result.text || `You have ${timeRemaining} left. Open the artifact above and start with the very first item — that's all you need to do right now.`;
  } catch (err) {
    console.warn('generateCriticalNudge failed, using fallback:', err.message);
    return `You have ${timeRemaining} left. Open the artifact above and start with the very first item — that's all you need to do right now.`;
  }
}

// ---------------------------------------------------------------------------
// 5. GENERATE FORFEIT MESSAGE — For commitment contract
// ---------------------------------------------------------------------------
export async function generateForfeitMessage(task, contactName, userNote) {
  if (DEMO_MODE) {
    return DEMO_FORFEIT_MESSAGE;
  }

  const deadlineStr = new Date(task.deadline).toLocaleString();
  const prompt = FORFEIT_PROMPT
    .replace('{{TASK_TITLE}}', task.title)
    .replace('{{DEADLINE}}', deadlineStr)
    .replace('{{CONTACT_NAME}}', contactName)
    .replace('{{USER_NOTE}}', userNote || 'No additional note provided.');

  try {
    const result = await callGemini({
      prompt: `Draft a forfeit/accountability message for the task "${task.title}" (due ${deadlineStr}) to be sent to ${contactName}.${userNote ? ` User's note: "${userNote}"` : ''}`,
      systemPrompt: injectNow(prompt),
    });

    return result.text || `Hi ${contactName} — I committed to finishing "${task.title}" by ${deadlineStr} and I didn't make it. I'm holding myself accountable. I'll have it done within 24 hours.`;
  } catch (err) {
    console.warn('generateForfeitMessage failed, using fallback:', err.message);
    return `Hi ${contactName} — I committed to finishing "${task.title}" by ${deadlineStr} and I didn't make it. I'm holding myself accountable. I'll have it done within 24 hours.`;
  }
}

// ---------------------------------------------------------------------------
// FULL TASK CREATION — Parse + artifact + consequence in parallel
// ---------------------------------------------------------------------------
export async function createFullTask(rawInput) {
  // Step 1: Parse the task
  const parsed = await parseTask(rawInput);

  // Step 2: Generate artifact and consequence in parallel
  const [artifact, consequence] = await Promise.all([
    generateArtifact(parsed),
    generateConsequence(parsed),
  ]);

  return {
    ...parsed,
    head_start_artifact: artifact,
    consequence_card: consequence,
    hasStarted: false,
    isComplete: false,
    createdAt: new Date().toISOString(),
    commitment: null, // { contactName, contactEmail, userNote, forfeitMessage }
    criticalNudge: null,
  };
}

// ---------------------------------------------------------------------------
// FALLBACK: local parsing when Gemini is unavailable
// ---------------------------------------------------------------------------
function fallbackParse(rawInput) {
  const taskType = guessTaskType(rawInput);
  const deadline = parseDateFallback(rawInput);

  // Calculate urgency from deadline
  const hoursLeft = (new Date(deadline) - new Date()) / (1000 * 60 * 60);
  let urgencyScore = 0;
  if (hoursLeft < 6) urgencyScore = 85;
  else if (hoursLeft < 24) urgencyScore = 60;
  else if (hoursLeft < 72) urgencyScore = 35;
  else urgencyScore = 15;

  // Adjust for task complexity
  if (taskType === 'writing' || taskType === 'interview_prep') urgencyScore += 10;
  if (taskType === 'study') urgencyScore += 5;
  urgencyScore = Math.min(100, urgencyScore);

  // Clean up title: remove filler words, capitalize
  const title = rawInput
    .replace(/^(ugh|oh no|crap|shoot|man|dude|okay|ok|so|well|um|hmm),?\s*/i, '')
    .replace(/\b(I have|I need to|I gotta|I've got|I should|I must|I have to)\b/i, '')
    .replace(/\b(and haven't started|and I haven't|but I haven't|haven't started)\b/i, '')
    .replace(/\b(due|by)\s+(tomorrow|today|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d).*$/i, '')
    .replace(/^\s+|\s+$/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 60) || rawInput.slice(0, 60);

  return {
    id: crypto.randomUUID(),
    title: title.charAt(0).toUpperCase() + title.slice(1),
    deadline,
    urgency_score: urgencyScore,
    task_type: taskType,
  };
}

function fallbackArtifact(task) {
  const template = FALLBACK_ARTIFACT_TEMPLATES[task.task_type] || FALLBACK_ARTIFACT_TEMPLATES.generic;
  return template.replace(/\[Task Title\]/g, task.title);
}

export async function parseDailySchedule(scheduleText) {
  if (DEMO_MODE) {
    return [
      {
        type: 'meeting',
        title: 'Project Sync with Jane',
        time: '11:00 AM',
        dateTime: new Date(new Date().setHours(11, 0, 0, 0)).toISOString(),
        contactName: 'Jane',
        contactEmail: 'jane@example.com'
      },
      {
        type: 'task',
        title: 'Complete marketing report',
        time: null,
        dateTime: new Date(new Date().setHours(17, 0, 0, 0)).toISOString(),
        contactName: null,
        contactEmail: null
      }
    ];
  }

  try {
    const result = await callGemini({
      prompt: `Parse this schedule:\n"${scheduleText}"`,
      systemPrompt: injectNow(PARSE_SCHEDULE_PROMPT),
      jsonMode: true,
    });

    if (result.json && Array.isArray(result.json.items)) {
      return result.json.items;
    }

    if (result.text) {
      try {
        const parsed = JSON.parse(result.text);
        if (Array.isArray(parsed.items)) return parsed.items;
      } catch {}
    }
    return [];
  } catch (err) {
    console.error('parseDailySchedule failed:', err.message);
    return [];
  }
}
