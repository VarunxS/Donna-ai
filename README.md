# Momentum — AI-Powered Deadline Activation Engine

Productivity tools rely on passive reminders. Reminders address neither of the two real reasons people miss deadlines: high activation energy, and no felt consequence.

**Momentum** is an AI assistant that, instead of reminding you, immediately generates a concrete "head start" artifact (so starting requires near-zero effort) and a realistic "what happens if you don't" consequence projection. As the deadline approaches, it escalates behavior, optionally arming a real forfeit message to a contact to make inaction feel like it has actual weight.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up your Gemini API key:
   ```bash
   cp .env.example .env
   # Edit .env and paste your GEMINI_API_KEY from https://aistudio.google.com/apikey
   ```

3. Start both the Express proxy and Vite dev server:
   ```bash
   npm run dev:all
   ```

4. Open [http://localhost:5173](http://localhost:5173).

## Demo Script (2-3 Minutes)

> **Note**: If venue Wi-Fi is unreliable, ensure `DEMO_MODE = true` in `src/demoMode.js` before starting. The app is fully functional in Demo Mode using cached, high-quality responses for 5 distinct task types.

**1. The Problem & Task Entry (0:30)**
- "To-do lists are passive. Momentum is an activation engine. Let's add a task using voice or text."
- Type: *"I have that marketing report due Friday 5pm and haven't started"* and hit **Add**.
- *What happens*: Gemini parses the messy input, infers the deadline, and immediately generates two things: a **Head Start Artifact** and a **Consequence Card**.

**2. The Calm State (0:45)**
- Click the task to open the Task Detail view.
- Show the **Head Start Artifact**: "Instead of a reminder, the AI did the first 10% of the work. It wrote a structured outline specifically for a marketing report. Starting now takes zero effort—just edit the text."
- Show the **Consequence Card**: "It also generated a specific, realistic projection of what happens if I miss this. Not generic guilt, but a plausible chain of events."

**3. Escalation & Commitment Contract (1:00)**
- Scroll down to the **Commitment Contract**.
- "I can arm a forfeit message to someone I don't want to let down."
- Enter a name (e.g., "Sarah") and their email, and click **Arm Contract**. The AI drafts an accountability message.

**4. The Critical State (Fast-Forward) (0:45)**
- Close the modal. Use the **Simulated Time** debug controls at the top of the main screen to `+24h` or `+6h` until the task dot turns red (Critical State).
- Re-open the task.
- "Now we're under 6 hours. The AI generated a **Critical Nudge** that explicitly references the consequence card to wake me up."
- Scroll down. "The Commitment Contract is now armed and ready to send. If I fail, I click 'Send Forfeit Message'—a human-in-the-loop mailto link."
- Click **Mark Done**. The counter in the header updates, showing a "Deadline Kept."

## Tech Stack
- Frontend: React + Vite + Tailwind CSS v4
- Backend: Minimal Express proxy server (to protect the API key)
- AI: Google Gemini API (gemini-2.5-flash) with structured JSON parsing
- Data: LocalStorage (No DB required)
- Features: Web Speech API for voice input
