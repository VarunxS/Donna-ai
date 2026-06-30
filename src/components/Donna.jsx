import { useState, useEffect, useRef, useCallback } from 'react';
import { useSpeech } from '../hooks/useSpeech';
import { createFullTask } from '../api';

// ============================================================================
// Donna — AI Voice & Text Assistant Component
// Restyled to match the Opal-inspired Grayscale "Restraint as Luxury" theme.
// ============================================================================

export default function Donna({ 
  inline = false, 
  onScheduleUpdate, 
  active = true, 
  tasks = [], 
  onTaskCreated, 
  onTaskUpdate, 
  onTaskDelete,
  history: propHistory,
  setHistory: propSetHistory,
  hasGreeted: propHasGreeted,
  setHasGreeted: propSetHasGreeted
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | listening | thinking | speaking
  const [localHistory, setLocalHistory] = useState([]);
  const history = propHistory !== undefined ? propHistory : localHistory;
  const setHistory = propSetHistory !== undefined ? propSetHistory : setLocalHistory;
  const [transcript, setTranscript] = useState('');
  const [lastResponse, setLastResponse] = useState('');
  const [customKeyInput, setCustomKeyInput] = useState('');
  const lastResponseRef = useRef('');
  
  useEffect(() => {
    lastResponseRef.current = lastResponse;
  }, [lastResponse]);

  const [localHasGreeted, setLocalHasGreeted] = useState(false);
  const hasGreeted = propHasGreeted !== undefined ? propHasGreeted : localHasGreeted;
  const setHasGreeted = propSetHasGreeted !== undefined ? propSetHasGreeted : setLocalHasGreeted;

  const [textInput, setTextInput] = useState('');

  const { speak, stop: stopSpeech, isSpeaking } = useSpeech();

  const recognitionRef = useRef(null);
  const shouldAutoListenRef = useRef(false);
  const isOpenRef = useRef(false);
  const activeRef = useRef(true);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.start();
    } catch {
      // Already listening
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('Speech Recognition not supported in this browser. Please try Chrome.');
      return;
    }

    if (status === 'listening') {
      recognitionRef.current.stop();
      shouldAutoListenRef.current = false;
      setStatus('idle');
    } else if (status === 'speaking') {
      stopSpeech();
      shouldAutoListenRef.current = true;
      setTimeout(() => startListening(), 200);
    } else {
      shouldAutoListenRef.current = true;
      startListening();
    }
  };

  // Sync refs with state
  useEffect(() => {
    isOpenRef.current = isOpen || inline;
  }, [isOpen, inline]);

  useEffect(() => {
    activeRef.current = active;
    if (!active) {
      // If tab switches away, stop speaking and listening
      stopSpeech();
      shouldAutoListenRef.current = false;
      if (recognitionRef.current) recognitionRef.current.abort();
      setStatus('idle');
    }
  }, [active, stopSpeech]);

  const handleUserMessageRef = useRef(null);
  useEffect(() => {
    handleUserMessageRef.current = handleUserMessage;
  });

  // Initialize Speech Recognition
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Speech Recognition not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setStatus('listening');
      setTranscript('');
    };

    recognition.onresult = (event) => {
      const current = event.resultIndex;
      const result = event.results[current];
      const text = result[0].transcript;
      setTranscript(text);

      if (result.isFinal) {
        // Safety guard: prevent acoustic feedback loop where Donna records her own spoken output.
        const cleanText = text.trim().toLowerCase();
        const cleanLastResponse = lastResponseRef.current ? lastResponseRef.current.trim().toLowerCase() : '';
        if (
          cleanLastResponse &&
          (cleanLastResponse.includes(cleanText) || cleanText.includes(cleanLastResponse)) &&
          cleanText.length > 3
        ) {
          console.log('🔇 Suppressing feedback loop transcript:', text);
          setTranscript('');
          return;
        }
        handleUserMessageRef.current?.(text);
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'no-speech' && shouldAutoListenRef.current && isOpenRef.current && activeRef.current) {
        setTimeout(() => startListening(), 300);
      } else if (event.error !== 'aborted') {
        setStatus('idle');
      }
    };

    recognition.onend = () => {
      setStatus((prev) => {
        if (prev === 'listening' && shouldAutoListenRef.current && isOpenRef.current && activeRef.current) {
          setTimeout(() => startListening(), 300);
        }
        return prev === 'listening' ? 'idle' : prev;
      });
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [startListening]);

  // Sync speaking status
  useEffect(() => {
    if (isSpeaking) {
      setStatus('speaking');
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    } else if (status === 'speaking') {
      setStatus('idle');
      if (shouldAutoListenRef.current && isOpenRef.current && activeRef.current) {
        setTimeout(() => startListening(), 1000);
      }
    }
  }, [isSpeaking, status, startListening]);

  // Greet on first activation
  useEffect(() => {
    if (active && (isOpen || inline) && !hasGreeted) {
      const alreadyGreeted = sessionStorage.getItem('donna_session_greeted');
      if (alreadyGreeted) {
        setHasGreeted(true);
        return;
      }
      
      sessionStorage.setItem('donna_session_greeted', 'true');
      setHasGreeted(true);
      
      const hour = new Date().getHours();
      let greeting;
      if (hour < 12) greeting = "Good morning! I'm Donna. Let me know what you'd like to schedule or complete today.";
      else if (hour < 17) greeting = "Good afternoon! I'm Donna. What are we scheduling or working on next?";
      else greeting = "Good evening! I'm Donna. How can I help you wrap up your day?";
      
      setLastResponse(greeting);
      speak(greeting, () => {
        shouldAutoListenRef.current = true;
        startListening();
      });
    }
  }, [isOpen, inline, active, hasGreeted, speak, startListening, setHasGreeted]);

  const handleUserMessage = async (text) => {
    if (!text.trim()) return;
    setStatus('thinking');
    shouldAutoListenRef.current = false;

    // Explicitly abort active speech recognition to prevent feedback loops from Donna's voice output
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
    }

    const newUserMessage = { role: 'user', parts: [{ text }] };
    const newHistory = [...history, newUserMessage];
    setHistory(newHistory);

    try {
      const nowTime = new Date();
      const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      
      const dayName = daysOfWeek[nowTime.getDay()];
      const monthName = months[nowTime.getMonth()];
      const dateNum = nowTime.getDate();
      const year = nowTime.getFullYear();
      
      const hours24 = nowTime.getHours();
      const ampm = hours24 >= 12 ? 'PM' : 'AM';
      const hours12 = hours24 % 12 || 12;
      const minutes = String(nowTime.getMinutes()).padStart(2, '0');
      const seconds = String(nowTime.getSeconds()).padStart(2, '0');

      const offsetMinutes = nowTime.getTimezoneOffset();
      const offsetSign = offsetMinutes <= 0 ? '+' : '-';
      const absOffsetMinutes = Math.abs(offsetMinutes);
      const offsetHours = String(Math.floor(absOffsetMinutes / 60)).padStart(2, '0');
      const offsetMins = String(absOffsetMinutes % 60).padStart(2, '0');
      const timezoneStr = `GMT${offsetSign}${offsetHours}:${offsetMins}`;
      const now = `${dayName}, ${monthName} ${dateNum}, ${year}, ${hours12}:${minutes}:${seconds} ${ampm} (Local Time, ${timezoneStr})`;

      const tasksStr = tasks && tasks.length > 0 
        ? tasks.map(t => `- "${t.title}" (Due: ${t.deadline}, Status: ${t.isComplete ? 'Completed' : 'Active'})`).join('\n')
        : 'No tasks currently scheduled.';

      const systemPrompt = `You are Donna, a brilliant, warm, and efficient personal AI assistant. 
You manage the user's deadlines, schedule, and priorities. 
The current date and time is ${now}.

The user's current deadlines and tasks are:
${tasksStr}

Keep your responses short (1-3 sentences max) because they will be read aloud via Text-to-Speech. 
Do not use markdown like **bold** or asterisks. No bullet points or numbered lists.
Just plain, natural conversational text as if you're talking to a friend.

Available tools:
- Create a new deadline task with 'create_deadline'.
- Mark a task as completed with 'complete_deadline'.
- Delete a task with 'delete_deadline'.
- Schedule a meeting with 'schedule_meeting'.
- Retrieve scheduled meetings with 'get_schedule'.

CRITICAL INSTRUCTIONS FOR SCHEDULING:
1. When the user asks to schedule a meeting and mentions a time (e.g. "schedule a meeting tomorrow at 6:30 pm"), check the history. Do NOT ask them "what time is it" or "when is the meeting". You already have the local date and time (${now}).
2. If any required arguments (like contactName or title) are missing, ask for them directly (e.g., "Whom are you meeting with and what is the title?").
3. Once they provide the missing info, call the 'schedule_meeting' tool immediately. Use the timeString they previously specified (e.g., "Tomorrow at 6:30 PM"). DO NOT ask for the time again.
4. If they say "remind me to..." or "set a reminder", call 'create_deadline'. If they say "schedule a meeting", call 'schedule_meeting'.

Be proactive — if you notice something relevant, mention it. 
Always sound confident and supportive.`;

      const customKey = localStorage.getItem('donna_user_gemini_key') || '';
      const headers = { 'Content-Type': 'application/json' };
      if (customKey.trim()) {
        headers['x-gemini-key'] = customKey.trim();
      }

      const response = await fetch('/api/donna', {
        method: 'POST',
        headers,
        body: JSON.stringify({ history: newHistory, systemPrompt })
      });

      if (!response.ok) {
        let details = '';
        try {
          const errData = await response.json();
          details = errData.details || '';
        } catch {}
        throw new Error(details || `API Error ${response.status}`);
      }

      const data = await response.json();
      setHistory(data.history);

      // Process task management actions from Donna
      if (data.actions && data.actions.length > 0) {
        for (const action of data.actions) {
          if (action.type === 'create_deadline') {
            try {
              const newTask = await createFullTask(`${action.title} by ${action.deadline}`);
              if (onTaskCreated) onTaskCreated(newTask);
            } catch (err) {
              console.error('Failed to create task via Donna action:', err);
            }
          } else if (action.type === 'complete_deadline') {
            const taskToComplete = tasks.find(t => 
              t.title.toLowerCase().includes(action.title.toLowerCase()) ||
              action.title.toLowerCase().includes(t.title.toLowerCase())
            );
            if (taskToComplete && onTaskUpdate) {
              onTaskUpdate(taskToComplete.id, { isComplete: true });
            }
          } else if (action.type === 'delete_deadline') {
            const taskToDelete = tasks.find(t => 
              t.title.toLowerCase().includes(action.title.toLowerCase()) ||
              action.title.toLowerCase().includes(t.title.toLowerCase())
            );
            if (taskToDelete && onTaskDelete) {
              onTaskDelete(taskToDelete.id);
            }
          }
        }
      }

      if (data.text) {
        setLastResponse(data.text);
        shouldAutoListenRef.current = true;
        speak(data.text);
        if (onScheduleUpdate) onScheduleUpdate();
      } else {
        setStatus('idle');
        shouldAutoListenRef.current = true;
        startListening();
      }
    } catch (err) {
      console.error('Donna API error:', err);
      const isQuota = err.message.includes('Quota') || err.message.includes('limit') || err.message.includes('429');
      const errorMsg = isQuota
        ? "I have exceeded the Gemini Free Tier limit of 20 requests per day. Please retry in a bit or check your plan details."
        : "Sorry, I'm having trouble connecting right now. Make sure the backend server is running.";
      setLastResponse(errorMsg);
      speak(errorMsg);
      shouldAutoListenRef.current = true;
    }
  };

  const handleTextSubmit = (e) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    const msg = textInput;
    setTextInput('');
    stopSpeech();
    handleUserMessage(msg);
  };

  const handleClose = () => {
    setIsOpen(false);
    stopSpeech();
    shouldAutoListenRef.current = false;
    if (recognitionRef.current) recognitionRef.current.abort();
    setStatus('idle');
  };

  const suggestions = [
    "What is my schedule?",
    "What are my deadlines?",
    "Tell me what to do next"
  ];

  // Colors based on state for Grayscale Dark Theme (Opal-inspired)
  const statusColors = {
    idle: {
      bg: 'from-stone-950 via-stone-900 to-black',
      orb: 'radial-gradient(circle at 30% 30%, #555555, #2c2c2e, #111111)',
      glow: 'shadow-[0_15px_45px_rgba(255,255,255,0.05)] border border-white/5',
      label: 'Tap orb or speak',
      textColor: 'text-[#bcbbc0]'
    },
    listening: {
      bg: 'from-stone-900 via-stone-950 to-black',
      orb: 'radial-gradient(circle at 30% 30%, #ffffff, #8e8e93, #3a3a3c)',
      glow: 'shadow-[0_15px_55px_rgba(255,255,255,0.15)] scale-105 border border-white/10',
      label: 'Listening...',
      textColor: 'text-white'
    },
    thinking: {
      bg: 'from-stone-950 to-black',
      orb: 'radial-gradient(circle at 30% 30%, #888888, #444444, #1c1c1e)',
      glow: 'shadow-[0_15px_35px_rgba(255,255,255,0.08)] border border-white/5',
      label: 'Thinking...',
      textColor: 'text-[#bcbbc0]'
    },
    speaking: {
      bg: 'from-stone-900 via-stone-950 to-black',
      orb: 'radial-gradient(circle at 30% 30%, #ffffff, #aeaeae, #2c2c2e)',
      glow: 'shadow-[0_15px_50px_rgba(255,255,255,0.2)] scale-102 border border-white/15',
      label: 'Speaking...',
      textColor: 'text-white'
    }
  };

  const config = statusColors[status] || statusColors.idle;

  // ---------------------------------------------------------------------------
  // 1. INLINE SCREEN MODE (Tab Content)
  // ---------------------------------------------------------------------------
  if (inline) {
    return (
      <div className={`flex flex-col h-full bg-gradient-to-b ${config.bg} text-white transition-all duration-700`}>
        {/* Top header */}
        <div className="flex items-center justify-between px-5 pt-6 pb-2 shrink-0">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Donna AI</h2>
            <p className="text-[10px] text-momentum-secondary mt-0.5">Always Listening Focus Partner</p>
          </div>
          <div className="flex gap-2 items-center">
            <span className={`w-1.5 h-1.5 rounded-full bg-[#30d158] animate-pulse`}></span>
            <span className="text-[9px] text-[#bcbbc0] font-bold uppercase tracking-wider">Online</span>
          </div>
        </div>

        {/* Orb and response section */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 relative overflow-hidden">
          {/* Main 3D Orb */}
          <div className="relative mb-8 mt-4 shrink-0">
            {/* Pulsing rings */}
            {status === 'listening' && (
              <>
                <div className="absolute inset-[-20px] rounded-full border border-white/10 animate-ping"></div>
                <div className="absolute inset-[-40px] rounded-full border border-white/5 animate-pulse"></div>
              </>
            )}
            {status === 'speaking' && (
              <div className="absolute inset-[-30px] rounded-full bg-white/5 blur-xl animate-pulse"></div>
            )}
            {status === 'thinking' && (
              <div className="absolute inset-[-15px] rounded-full border border-dashed border-white/10 animate-spin"></div>
            )}

            {/* Glassmorphic 3D Orb Sphere */}
            <button
              onClick={toggleListening}
              style={{ background: config.orb }}
              className={`w-36 h-36 rounded-full flex items-center justify-center cursor-pointer transition-all duration-500 relative overflow-hidden ${config.glow}`}
            >
              {/* Gloss Highlight overlay for 3D glass look */}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(255,255,255,0.4)_0%,rgba(255,255,255,0)_60%)] rounded-full"></div>
              <div className="absolute bottom-1 right-1 w-16 h-8 bg-[radial-gradient(circle_at_50%_100%,rgba(255,255,255,0.1)_0%,rgba(255,255,255,0)_70%)] rounded-full blur-sm transform rotate-45"></div>

              {/* Inner UI based on state */}
              {status === 'listening' && (
                <div className="flex gap-1.5 items-center z-10">
                  <div className="w-1.5 h-8 bg-black/85 rounded-full animate-[donna-bar1_0.8s_ease-in-out_infinite]"></div>
                  <div className="w-1.5 h-12 bg-black/85 rounded-full animate-[donna-bar2_0.8s_ease-in-out_infinite_0.15s]"></div>
                  <div className="w-1.5 h-10 bg-black/85 rounded-full animate-[donna-bar3_0.8s_ease-in-out_infinite_0.3s]"></div>
                  <div className="w-1.5 h-8 bg-black/85 rounded-full animate-[donna-bar1_0.8s_ease-in-out_infinite_0.45s]"></div>
                </div>
              )}
              {status === 'thinking' && (
                <div className="flex gap-2 z-10">
                  <div className="w-2.5 h-2.5 rounded-full bg-white/90 animate-bounce"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-white/90 animate-bounce delay-150"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-white/90 animate-bounce delay-300"></div>
                </div>
              )}
              {status === 'speaking' && (
                <div className="flex gap-1.5 items-center z-10">
                  <div className="w-1.5 h-10 bg-black rounded-full animate-[donna-speak1_0.6s_ease-in-out_infinite]"></div>
                  <div className="w-1.5 h-14 bg-black rounded-full animate-[donna-speak2_0.6s_ease-in-out_infinite_0.1s]"></div>
                  <div className="w-1.5 h-8 bg-black rounded-full animate-[donna-speak3_0.6s_ease-in-out_infinite_0.2s]"></div>
                  <div className="w-1.5 h-12 bg-black rounded-full animate-[donna-speak2_0.6s_ease-in-out_infinite_0.3s]"></div>
                  <div className="w-1.5 h-9 bg-black rounded-full animate-[donna-speak1_0.6s_ease-in-out_infinite_0.4s]"></div>
                </div>
              )}
              {status === 'idle' && (
                <svg className="w-12 h-12 text-white/95 z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                </svg>
              )}
            </button>
          </div>

          {/* Status Label */}
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 animate-pulse mb-6">
            {config.label}
          </span>

          {/* Transcript / Response Card */}
          <div className="w-full max-w-sm bg-momentum-card border border-momentum-border rounded-2xl p-5 min-h-[110px] flex flex-col justify-center relative z-10">
            {status === 'listening' && transcript ? (
              <p className="text-sm text-white font-medium italic leading-relaxed text-center">
                "{transcript}"
              </p>
            ) : lastResponse ? (
              <p className="text-xs text-momentum-secondary leading-relaxed font-normal text-center">
                {lastResponse}
              </p>
            ) : (
              <p className="text-xs text-momentum-muted text-center italic">
                Ask Donna to schedule a meeting, prioritize tasks, or explain tradeoffs.
              </p>
            )}
          </div>
        </div>

        {/* Suggestion Chips */}
        <div className="px-5 py-4 shrink-0">
          <h4 className="text-[9px] font-bold text-stone-500 uppercase tracking-widest mb-2 px-1">Try Saying</h4>
          <div className="flex flex-col gap-2">
            {suggestions.map((sug, idx) => (
              <button
                key={idx}
                onClick={() => {
                  stopSpeech();
                  handleUserMessage(sug);
                }}
                className="w-full text-left px-3.5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-xs text-momentum-secondary font-medium transition-all cursor-pointer active:scale-99"
              >
                {sug}
              </button>
            ))}
          </div>
        </div>

        {/* Bottom Text Input Field */}
        <form onSubmit={handleTextSubmit} className="flex gap-2 p-4 border-t border-white/5 bg-black/40 shrink-0">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 px-4 py-3 bg-white/5 border border-white/5 rounded-xl text-xs text-white focus:outline-none focus:border-white/20 placeholder:text-stone-500"
          />
          <button
            type="submit"
            disabled={!textInput.trim()}
            className="w-10 h-10 rounded-xl bg-white hover:bg-stone-250 flex items-center justify-center text-black disabled:opacity-40 disabled:hover:bg-white transition-all cursor-pointer shadow-md"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </form>

        <style>{`
          @keyframes donna-bar1 { 0%, 100% { height: 28px; } 50% { height: 12px; } }
          @keyframes donna-bar2 { 0%, 100% { height: 48px; } 50% { height: 16px; } }
          @keyframes donna-bar3 { 0%, 100% { height: 40px; } 50% { height: 14px; } }
          @keyframes donna-speak1 { 0%, 100% { height: 40px; } 50% { height: 20px; } }
          @keyframes donna-speak2 { 0%, 100% { height: 56px; } 50% { height: 24px; } }
          @keyframes donna-speak3 { 0%, 100% { height: 32px; } 50% { height: 48px; } }
        `}</style>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 2. FLOATING VOICE OVERLAY MODE (translucent dark siri-style window)
  // ---------------------------------------------------------------------------
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-5 w-14 h-14 rounded-full bg-stone-900 border border-white/10 shadow-lg flex items-center justify-center cursor-pointer transition-all duration-200 z-40 hover:bg-stone-850 hover:scale-105"
        title="Talk to Donna"
      >
        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
        </svg>
      </button>
    );
  }

  // Dark overlay style config (Siri/Assistant overlay look)
  const overlayColors = {
    idle: {
      bg: 'bg-stone-950/98',
      orb: 'radial-gradient(circle at 30% 30%, #555555, #2c2c2e, #111111)',
      glow: 'shadow-[0_0_60px_rgba(255,255,255,0.05)] border border-white/5',
      label: 'Tap orb to talk'
    },
    listening: {
      bg: 'bg-stone-950/99',
      orb: 'radial-gradient(circle at 30% 30%, #ffffff, #8e8e93, #3a3a3c)',
      glow: 'shadow-[0_0_80px_rgba(255,255,255,0.15)] scale-105 border border-white/10',
      label: 'Listening...'
    },
    thinking: {
      bg: 'bg-stone-950/98',
      orb: 'radial-gradient(circle at 30% 30%, #888888, #444444, #1c1c1e)',
      glow: 'shadow-[0_0_50px_rgba(255,255,255,0.08)] border border-white/5',
      label: 'Thinking...'
    },
    speaking: {
      bg: 'bg-stone-950/99',
      orb: 'radial-gradient(circle at 30% 30%, #ffffff, #aeaeae, #2c2c2e)',
      glow: 'shadow-[0_0_80px_rgba(255,255,255,0.2)] scale-102 border border-white/15',
      label: 'Speaking...'
    }
  };

  const overlayConfig = overlayColors[status] || overlayColors.idle;

  return (
    <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center ${overlayConfig.bg} backdrop-blur-md p-6 font-sans text-stone-100 transition-all duration-500`}>
      {/* Close button */}
      <button
        onClick={handleClose}
        className="absolute top-6 right-6 p-2 rounded-full text-stone-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer border border-white/10"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Assistant Title */}
      <div className="absolute top-8 text-center">
        <h2 className="text-sm font-bold uppercase tracking-wider text-white">Donna</h2>
        <p className="text-[9px] text-stone-500 mt-1 uppercase tracking-wider font-bold">Voice Assistant</p>
      </div>

      {/* Main interactive Orb */}
      <div className="relative mb-12">
        {status === 'listening' && (
          <>
            <div className="absolute inset-[-24px] rounded-full border border-white/10 animate-ping"></div>
            <div className="absolute inset-[-48px] rounded-full border border-white/5 animate-pulse"></div>
          </>
        )}
        {status === 'speaking' && (
          <div className="absolute inset-[-30px] rounded-full bg-white/5 blur-xl animate-pulse"></div>
        )}
        {status === 'thinking' && (
          <div className="absolute inset-[-15px] rounded-full border border-dashed border-white/10 animate-spin"></div>
        )}

        <button
          onClick={toggleListening}
          style={{ background: overlayConfig.orb }}
          className={`w-36 h-36 rounded-full flex items-center justify-center cursor-pointer transition-all duration-500 relative overflow-hidden ${overlayConfig.glow}`}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(255,255,255,0.45)_0%,rgba(255,255,255,0)_60%)] rounded-full"></div>
          
          {status === 'listening' && (
            <div className="flex gap-1 items-center z-10">
              <div className="w-1 h-8 bg-black/85 rounded-full animate-[donna-bar1_0.8s_ease-in-out_infinite]"></div>
              <div className="w-1 h-12 bg-black/85 rounded-full animate-[donna-bar2_0.8s_ease-in-out_infinite_0.15s]"></div>
              <div className="w-1 h-10 bg-black/85 rounded-full animate-[donna-bar3_0.8s_ease-in-out_infinite_0.3s]"></div>
              <div className="w-1 h-8 bg-black/85 rounded-full animate-[donna-bar1_0.8s_ease-in-out_infinite_0.45s]"></div>
            </div>
          )}
          {status === 'thinking' && (
            <div className="flex gap-2 z-10">
              <div className="w-2.5 h-2.5 rounded-full bg-white/80 animate-bounce"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-white/80 animate-bounce delay-150"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-white/80 animate-bounce delay-300"></div>
            </div>
          )}
          {status === 'speaking' && (
            <div className="flex gap-1 items-center z-10">
              <div className="w-1.5 h-10 bg-black rounded-full animate-[donna-speak1_0.6s_ease-in-out_infinite]"></div>
              <div className="w-1.5 h-14 bg-black rounded-full animate-[donna-speak2_0.6s_ease-in-out_infinite_0.1s]"></div>
              <div className="w-1.5 h-8 bg-black rounded-full animate-[donna-speak3_0.6s_ease-in-out_infinite_0.2s]"></div>
              <div className="w-1.5 h-12 bg-black rounded-full animate-[donna-speak2_0.6s_ease-in-out_infinite_0.3s]"></div>
            </div>
          )}
          {status === 'idle' && (
            <svg className="w-12 h-12 text-white/95 z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
            </svg>
          )}
        </button>
      </div>

      {/* Speech transcript overlay */}
      <div className="text-center w-full max-w-md px-6">
        <p className="text-stone-500 text-xs font-bold uppercase tracking-wider mb-4">
          {overlayConfig.label}
        </p>

        {transcript && status === 'listening' ? (
          <p className="text-xl text-white font-light italic leading-relaxed">
            "{transcript}"
          </p>
        ) : lastResponse ? (
          <div className="space-y-4">
            <p className="text-base text-stone-300 leading-relaxed font-normal">
              {lastResponse}
            </p>
            {(lastResponse.includes('Quota') || lastResponse.includes('limit') || lastResponse.includes('quota') || lastResponse.includes('429')) && (
              <div className="mt-4 p-4 bg-stone-900 border border-white/5 rounded-2xl max-w-sm mx-auto space-y-3 animate-fade-in">
                <input
                  type="password"
                  placeholder="Paste your Gemini API Key (AIzaSy...)"
                  value={customKeyInput}
                  onChange={(e) => setCustomKeyInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-black/60 border border-white/10 rounded-xl text-xs text-white placeholder:text-stone-600 focus:outline-none focus:border-white/20"
                />
                <button
                  onClick={() => {
                    if (customKeyInput.trim()) {
                      localStorage.setItem('donna_user_gemini_key', customKeyInput.trim());
                      setLastResponse("Thank you! Your custom Gemini API Key has been saved locally. Let's try again!");
                      speak("Your custom key is saved. Let's try again.");
                      setCustomKeyInput('');
                    }
                  }}
                  className="w-full py-2 bg-white text-black font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-stone-200 transition-colors cursor-pointer"
                >
                  Apply Key
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>

      <style>{`
        @keyframes donna-bar1 { 0%, 100% { height: 28px; } 50% { height: 12px; } }
        @keyframes donna-bar2 { 0%, 100% { height: 48px; } 50% { height: 16px; } }
        @keyframes donna-bar3 { 0%, 100% { height: 40px; } 50% { height: 14px; } }
        @keyframes donna-speak1 { 0%, 100% { height: 40px; } 50% { height: 20px; } }
        @keyframes donna-speak2 { 0%, 100% { height: 56px; } 50% { height: 24px; } }
        @keyframes donna-speak3 { 0%, 100% { height: 32px; } 50% { height: 48px; } }
      `}</style>
    </div>
  );
}
