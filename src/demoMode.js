// ============================================================================
// DEMO_MODE — Live-demo insurance against bad venue wifi.
// When true, all Gemini calls return pre-written example responses.
// Toggle this constant to switch between live AI and cached responses.
// ============================================================================

export const DEMO_MODE = false;

// ---------------------------------------------------------------------------
// Pre-written demo responses covering all 5 task types
// ---------------------------------------------------------------------------

export const DEMO_RESPONSES = {
  // --- WRITING task ---
  writing: {
    title: 'Q3 Marketing Performance Report',
    deadline: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(), // ~26hrs from now
    urgency_score: 55,
    task_type: 'writing',
    head_start_artifact: `# Q3 Marketing Performance Report — Outline

## 1. Executive Summary
Write 2-3 sentences: overall campaign performance vs targets, top win, biggest miss.

## 2. Channel Performance Breakdown
- **Paid Search**: Spend, CPC, conversion rate, ROAS — compare to Q2.
- **Social Media**: Engagement rate, follower growth, top-performing posts.
- **Email**: Open rate, click-through, unsubscribe trend.
- **Content/SEO**: Organic traffic change, top landing pages, keyword rankings moved.

## 3. Campaign Highlights
Pick 2-3 standout campaigns. For each: objective, what was tried, result, what you'd repeat or change.

## 4. Budget vs Actual
Table: planned spend per channel vs actual, variance %. Flag any overspend with explanation.

## 5. Key Learnings & Recommendations for Q4
3-5 bullet points. Be specific — "Increase Instagram Reels budget by 15% based on 2.3x ROAS" not "do more social."

## 6. Appendix
Raw data tables, links to dashboards.`,
    consequence_card: `Your manager presents the Q3 review to the VP Monday morning without your data. She improvises with last quarter's numbers. When the VP asks about the paid search ROAS drop, she turns to you — and you have nothing prepared. The project timeline slips a week while you scramble, and the Q4 budget request goes in without your recommendations.`,
  },

  // --- STUDY task ---
  study: {
    title: 'Distributed Systems Final Exam Prep',
    deadline: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    urgency_score: 40,
    task_type: 'study',
    head_start_artifact: `# Distributed Systems — 3-Session Study Plan

## Session 1: Fundamentals & Consensus (90 min)
- **CAP Theorem**: Define each property, draw the triangle, list which real systems choose which pair (Cassandra = AP, HBase = CP, etc.)
- **Paxos & Raft**: Walk through the leader election steps for Raft. Be able to explain why majority quorum matters.
- **Practice**: Sketch a Raft log replication diagram for a 5-node cluster with one node failing mid-commit.

## Session 2: Consistency Models & Replication (90 min)
- **Linearizability vs Eventual Consistency**: Write one concrete example of each that could appear on the exam.
- **Vector Clocks**: Work through 3 example message exchanges by hand, determine causal ordering.
- **Quorum Systems**: Calculate R + W > N for different configurations. Know when strict quorum guarantees strong consistency.

## Session 3: Fault Tolerance & Real Systems (60 min)
- **Byzantine Fault Tolerance**: Know the 3f+1 rule and why it exists.
- **MapReduce / GFS / Spanner**: One paragraph summary of each — what problem it solves, key design choice.
- **Practice Exam Questions**: Do the 2023 past paper under timed conditions.`,
    consequence_card: `The exam is worth 40% of your final grade. Without structured prep, you'll walk in relying on half-remembered lecture slides. The consensus and vector clock questions — which appear every year — require working through examples by hand, not just reading. Students who skip practice problems historically score 15-20 points lower. A poor grade here drops your GPA below the internship eligibility threshold.`,
  },

  // --- INTERVIEW PREP task ---
  interview_prep: {
    title: 'Senior Frontend Engineer Interview at Stripe',
    deadline: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    urgency_score: 75,
    task_type: 'interview_prep',
    head_start_artifact: `# Stripe Senior Frontend Interview — Likely Questions & Draft Answers

## 1. "Walk us through how you'd architect a complex payment form with real-time validation."
- **Key points**: Controlled components, debounced validation, field-level error states, PCI compliance (never log raw card numbers), progressive disclosure for optional fields.
- **Stripe-specific angle**: Mention Stripe Elements and how you'd integrate vs build custom.

## 2. "Tell us about a time you significantly improved frontend performance."
- **Draft answer bullets**: Identify the project, the specific metric (e.g., LCP from 4.2s → 1.8s), the technique (code splitting, lazy loading, image optimization), how you measured before/after.
- **Follow-up prep**: Be ready to explain why you chose that approach over alternatives.

## 3. "How do you handle state management in a large React application?"
- **Key points**: Context API for simple shared state, Zustand/Redux for complex flows, server state with React Query/SWR, why you'd choose one over another — not "I always use Redux."
- **Stripe angle**: Their dashboard is React-heavy — emphasize scalability.

## 4. "Describe your approach to component API design."
- **Draft answer bullets**: Props should be minimal, composable (compound components), accessible by default, follow the principle of least surprise. Give a concrete example of a component you redesigned.

## 5. "How do you ensure accessibility in your frontend work?"
- **Key points**: Semantic HTML first, ARIA only when necessary, keyboard navigation testing, screen reader testing workflow, automated a11y checks in CI.
- **Concrete example**: "I added focus trapping to our modal component and caught that our date picker was unusable with VoiceOver."`,
    consequence_card: `The Stripe interview is in 8 hours. Without reviewing likely questions, you'll be formulating answers on the spot while nervous. The technical questions will probe depth — generic answers like "I use React" won't cut it for a senior role. The recruiter mentioned they're evaluating 3 finalists this week. Showing up underprepared means losing a role that pays $45K more than your current position, and Stripe's 12-month cooldown period means you can't re-apply until next year.`,
  },

  // --- ADMIN EMAIL task ---
  admin_email: {
    title: 'Reschedule Thursday client meeting to next week',
    deadline: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    urgency_score: 80,
    task_type: 'admin_email',
    head_start_artifact: `Subject: Reschedule: Thursday Strategy Meeting → Next Week

Hi [Client Name],

I hope you're doing well. I wanted to reach out about our strategy meeting scheduled for this Thursday.

Due to a scheduling conflict that's come up on our end, I'd like to propose moving our meeting to next week. Would any of the following times work for you?

- Tuesday [Date] at 2:00 PM
- Wednesday [Date] at 10:00 AM
- Thursday [Date] at the same time (3:00 PM)

The agenda remains the same — we'll cover the Q3 roadmap review and your feedback on the latest mockups. I want to make sure we have adequate time to give your project the attention it deserves.

Apologies for the change, and please let me know which slot works best. Happy to adjust if none of these times work.

Best regards,
[Your Name]`,
    consequence_card: `If you don't send this by end of day, the client shows up Thursday expecting a prepared meeting. You'll either no-show (damaging trust with a key account) or scramble through an unprepared meeting (wasting their time). The client's PM specifically mentioned they're evaluating whether to expand the contract next quarter — disorganization right now directly affects that decision.`,
  },

  // --- GENERIC task ---
  generic: {
    title: 'Organize home office before in-laws visit Saturday',
    deadline: new Date(Date.now() + 52 * 60 * 60 * 1000).toISOString(),
    urgency_score: 30,
    task_type: 'generic',
    head_start_artifact: `# Smallest Possible First Actions — Office Cleanup

## Step 1: The 5-Minute Surface Sweep (do this RIGHT NOW)
Clear your desk surface completely. Everything goes into one pile on the floor. Wipe the desk with a damp cloth. Put back ONLY: monitor, keyboard, mouse, one pen. This takes 5 minutes and creates immediate visual progress that motivates the rest.

## Step 2: The Three-Box Sort (30 min)
Get three bags/boxes. Label them: KEEP HERE, RELOCATE, TRASH. Go shelf by shelf, drawer by drawer. Don't organize yet — just sort. The "relocate" box goes to the garage after this step.

## Step 3: Quick Wins That Guests Notice (20 min)
- Vacuum/sweep the floor (especially corners and under desk)
- Hide cable clutter (one zip tie behind the desk does 80% of the work)
- Empty the trash can and put in a fresh bag
- Close all browser tabs before Saturday (yes, really — 47 open tabs looks chaotic if anyone sees your screen)`,
    consequence_card: `Your in-laws arrive Saturday and the office — which doubles as the guest room — has three weeks of clutter piled on every surface. Your partner has asked twice already. The pullout couch is buried under boxes. Either you do a frantic 2-hour cleanup Saturday morning (stressful, incomplete) or the in-laws sleep in a room that looks like a storage unit, which becomes a recurring joke at family dinners for the next six months.`,
  },
};

// ---------------------------------------------------------------------------
// Demo critical-state nudge (references consequence card content)
// ---------------------------------------------------------------------------
export const DEMO_CRITICAL_NUDGE = `You have 2 hours and 17 minutes left, and you haven't marked this as started yet. Remember — if this doesn't get done, your manager presents Monday without your data and the Q4 budget request goes in without your recommendations. That's real. Open the outline above, fill in just the Executive Summary — that's 10 minutes of work and it breaks the seal on the whole thing.`;

// ---------------------------------------------------------------------------
// Demo forfeit message (for commitment contract)
// ---------------------------------------------------------------------------
export const DEMO_FORFEIT_MESSAGE = `Hi Sarah — I made a commitment to finish my Q3 marketing report before the Friday 5pm deadline, and I'm writing to let you know I didn't make it. I'm asking you to hold me accountable. I'll have it done by Monday 9am. Sorry for the delay.`;

// ---------------------------------------------------------------------------
// Fallback templates for when Gemini fails (non-demo-mode)
// ---------------------------------------------------------------------------
export const FALLBACK_ARTIFACT_TEMPLATES = {
  writing: `# [Task Title] — Quick Outline\n\n## 1. Introduction\nBriefly state the purpose and scope.\n\n## 2. Main Points\n- Point A: [fill in]\n- Point B: [fill in]\n- Point C: [fill in]\n\n## 3. Conclusion\nSummarize key takeaways and next steps.`,
  study: `# [Task Title] — Study Plan\n\n## Session 1 (45 min): Core Concepts\n- Review fundamental definitions and principles\n- Take notes on key formulas/frameworks\n\n## Session 2 (45 min): Practice Problems\n- Work through 3-5 practice questions\n- Identify weak areas\n\n## Session 3 (30 min): Review & Self-Test\n- Flash-card review of weak areas\n- One timed practice question`,
  interview_prep: `# [Task Title] — Interview Prep\n\n## Likely Questions\n1. "Tell me about yourself" — prepare a 90-second version\n2. "Why this role/company?" — research 2-3 specific reasons\n3. "Describe a challenging project" — use STAR format\n4. "What's your biggest weakness?" — pick a real one with a growth story\n5. "Do you have questions for us?" — prepare 3 thoughtful questions`,
  admin_email: `Subject: [Topic]\n\nHi [Name],\n\n[State the purpose in one sentence.]\n\n[Provide necessary details or options.]\n\n[Clear call to action — what do you need from them and by when?]\n\nBest regards,\n[Your Name]`,
  generic: `# [Task Title] — First Steps\n\n## Step 1: Smallest possible action (5 min)\n[What's the tiniest thing you can do right now to start?]\n\n## Step 2: Next concrete step (15-30 min)\n[What naturally follows from step 1?]\n\n## Step 3: Checkpoint\n[What does "meaningfully started" look like for this task?]`,
};

export const FALLBACK_CONSEQUENCE = `If you don't complete this by the deadline, you'll need to explain the delay, and the people depending on this work will need to adjust their plans around your miss. The longer you wait, the more rushed and lower-quality the result will be.`;

// ---------------------------------------------------------------------------
// Regex-based date parsing fallback
// ---------------------------------------------------------------------------
export function parseDateFallback(input) {
  const now = new Date();
  const lower = input.toLowerCase();
  const d = new Date(now);

  // Try to extract time anywhere in the string: e.g. "6:30", "6 pm", "14:00"
  let targetHours = 17; // default 5pm
  let targetMinutes = 0;
  let timeFound = false;

  const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    const period = timeMatch[3] ? timeMatch[3].toLowerCase() : null;

    if (period === 'pm' && hours !== 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;
    
    // If no am/pm specified, infer logically (e.g., if it's 5pm and they say 6:30, they mean 6:30pm)
    if (!period) {
      if (hours < 12 && hours + 12 > now.getHours()) {
        hours += 12; // Infer PM
      }
    }

    targetHours = hours;
    targetMinutes = minutes;
    timeFound = true;
  }

  // "tomorrow"
  if (/\btomorrow\b/.test(lower)) {
    d.setDate(d.getDate() + 1);
    d.setHours(targetHours, targetMinutes, 0, 0);
    return d.toISOString();
  }

  // "in X days"
  const inDaysMatch = lower.match(/\bin\s+(\d+)\s+days?\b/);
  if (inDaysMatch) {
    d.setDate(d.getDate() + parseInt(inDaysMatch[1]));
    d.setHours(targetHours, targetMinutes, 0, 0);
    return d.toISOString();
  }

  // "in X hours"
  const inHoursMatch = lower.match(/\bin\s+(\d+)\s+hours?\b/);
  if (inHoursMatch) {
    d.setHours(d.getHours() + parseInt(inHoursMatch[1]));
    return d.toISOString();
  }

  // Day names: "monday", "tuesday", etc.
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < days.length; i++) {
    if (lower.includes(days[i])) {
      const currentDay = d.getDay();
      let daysUntil = i - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      d.setDate(d.getDate() + daysUntil);
      d.setHours(targetHours, targetMinutes, 0, 0);
      return d.toISOString();
    }
  }

  // "today"
  if (/\btoday\b/.test(lower)) {
    if (timeFound) {
      d.setHours(targetHours, targetMinutes, 0, 0);
    } else {
      d.setHours(23, 59, 0, 0);
    }
    return d.toISOString();
  }

  // "tonight"
  if (/\btonight\b/.test(lower)) {
    if (timeFound) {
      d.setHours(targetHours, targetMinutes, 0, 0);
    } else {
      d.setHours(23, 0, 0, 0);
    }
    return d.toISOString();
  }

  // Default: 24 hours from now if no specific day is mentioned
  if (timeFound) {
    d.setHours(targetHours, targetMinutes, 0, 0);
    if (d < now) d.setDate(d.getDate() + 1); // if time is past, assume tomorrow
    return d.toISOString();
  }

  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Guess task type from input text (fallback when Gemini is unavailable)
// ---------------------------------------------------------------------------
export function guessTaskType(input) {
  const lower = input.toLowerCase();
  if (/\b(report|essay|write|writing|blog|article|paper|draft|document)\b/.test(lower)) return 'writing';
  if (/\b(study|exam|test|quiz|midterm|final|review|flashcard|chapter)\b/.test(lower)) return 'study';
  if (/\b(interview|hiring|recruiter|job|position|role)\b/.test(lower)) return 'interview_prep';
  if (/\b(email|message|reply|respond|send|schedule|reschedule|meeting|call)\b/.test(lower)) return 'admin_email';
  return 'generic';
}
