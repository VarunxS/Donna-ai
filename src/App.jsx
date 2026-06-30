import { useState, useEffect, useCallback, useRef } from 'react';
import { loadTasks, saveTasks, addTask, updateTask, deleteTask, loadRecord, recordKept, recordBroken, removeTaskFromRecord } from './store';
import { getEscalationState } from './escalation';
import TaskInput from './components/TaskInput';
import TaskCard from './components/TaskCard';
import TaskDetail from './components/TaskDetail';
import Donna from './components/Donna';
import Login from './components/Login';
import { useSpeech } from './hooks/useSpeech';
import { createFullTask, parseDailySchedule } from './api';

const FOCUS_QUOTES = [
  "You do not rise to the level of your goals. You fall to the level of your systems.",
  "The cost of a thing is the amount of what I will call life which is required to be exchanged for it.",
  "Friction is the only thing standing between a plan and its execution. Start in the next 30 seconds.",
  "If you commit to nothing, you will be distracted by everything.",
  "Loss aversion is powerful. Avoid the pain of breaking your contract by taking action now.",
  "Protect your attention as your sovereign property. No remote server is allowed to harvest it."
];

export default function App() {
  // ── Auth session ──────────────────────────────────────────────────────────
  const [userEmail,    setUserEmail]    = useState(() => localStorage.getItem('momentum_user_email') || '');
  const [userPassword, setUserPassword] = useState(() => localStorage.getItem('momentum_user_pw') || '');
  const syncTimerRef = useRef(null);

  const [tasks, setTasks] = useState([]);
  const [record, setRecord] = useState({ kept: 0, broken: 0, history: [] });
  const [selectedTask, setSelectedTask] = useState(null);
  const [now, setNow] = useState(new Date());
  const [donnaHistory, setDonnaHistory] = useState([]);
  const [hasGreeted, setHasGreeted] = useState(false);
  const [celebrationMessage, setCelebrationMessage] = useState(null);
  
  // Navigation & session state
  const [showSplash, setShowSplash] = useState(() => {
    const shown = sessionStorage.getItem('donna_splash_shown');
    return shown ? false : true;
  });
  const [landingPageTab, setLandingPageTab] = useState('home'); // home | methodology | privacy

  // Onboarding conversational states
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(1); // 1: focus, 2: contact, 3: habits
  const [profileFocus, setProfileFocus] = useState('');
  const [profileDailyTarget, setProfileDailyTarget] = useState('');
  const [profileCheckInTime, setProfileCheckInTime] = useState('');
  const [profileHabits, setProfileHabits] = useState('');

  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard | calendar | donna
  const [currentQuoteIdx, setCurrentQuoteIdx] = useState(0);
  const rotateQuote = () => {
    setCurrentQuoteIdx((prev) => (prev + 1) % FOCUS_QUOTES.length);
  };
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [meetings, setMeetings] = useState([]);
  const [showDebug, setShowDebug] = useState(false);

  // Fast-forward debug control
  const [timeOffsetHours, setTimeOffsetHours] = useState(0);

  // Speech Hook for onboarding
  const { speak, stop: stopSpeech, isSpeaking } = useSpeech();

  // ── Login handler — called by <Login> on successful auth ─────────────────
  const handleLogin = useCallback(({ email, password, user }) => {
    localStorage.setItem('momentum_user_email', email);
    localStorage.setItem('momentum_user_pw', password);
    setUserEmail(email);
    setUserPassword(password);
    // Hydrate state from server data
    if (user.tasks  && user.tasks.length  > 0) { setTasks(user.tasks);   saveTasks(user.tasks); }
    else { setTasks(loadTasks()); }
    if (user.record && (user.record.kept > 0 || user.record.broken > 0)) setRecord(user.record);
    else setRecord(loadRecord());
    if (user.meetings && user.meetings.length > 0) setMeetings(user.meetings);
    else fetchMeetings();
    if (user.profile && Object.keys(user.profile).length > 0) {
      localStorage.setItem('donna_user_profile', JSON.stringify(user.profile));
    }
  }, []);

  // ── Logout handler ────────────────────────────────────────────────────────
  const handleLogout = useCallback(() => {
    localStorage.removeItem('momentum_user_email');
    localStorage.removeItem('momentum_user_pw');
    setUserEmail('');
    setUserPassword('');
  }, []);

  // ── Auto-sync: push changes to server 3 s after last edit ─────────────────
  useEffect(() => {
    if (!userEmail || !userPassword) return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(async () => {
      try {
        const profile = (() => { try { return JSON.parse(localStorage.getItem('donna_user_profile') || '{}'); } catch { return {}; } })();
        await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: userEmail, password: userPassword, tasks, record, meetings, profile }),
        });
      } catch { /* silent — sync is best-effort */ }
    }, 3000);
    return () => { if (syncTimerRef.current) clearTimeout(syncTimerRef.current); };
  }, [tasks, record, meetings, userEmail, userPassword]);

  // ── Initial load (when already logged in from a previous session) ─────────
  useEffect(() => {
    if (!userEmail || !userPassword) return; // will wait for login
    setTasks(loadTasks());
    setRecord(loadRecord());
    fetchMeetings();
  }, [userEmail, userPassword]);

  const fetchMeetings = async () => {
    try {
      const res = await fetch('/api/meetings');
      if (res.ok) {
        const data = await res.json();
        setMeetings(data.meetings || []);
      }
    } catch (err) {
      console.error('Failed to fetch meetings:', err);
    }
  };

  // Time tick and deadline checking
  useEffect(() => {
    const interval = setInterval(() => {
      const currentRealTime = new Date();
      const currentSimulatedTime = new Date(currentRealTime.getTime() + timeOffsetHours * 60 * 60 * 1000);
      setNow(currentSimulatedTime);
      
      // Auto-mark broken tasks if they pass the deadline without being completed
      setTasks(prevTasks => {
        let changed = false;
        const newTasks = prevTasks.map(t => {
          if (!t.isComplete && !t.recordedBroken) {
            const state = getEscalationState(t, currentSimulatedTime);
            if (state === 'overdue') {
              setRecord(prevRec => recordBroken(prevRec, t));
              changed = true;
              return { ...t, recordedBroken: true };
            }
          }
          return t;
        });
        
        if (changed) saveTasks(newTasks);
        return changed ? newTasks : prevTasks;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timeOffsetHours]);

  const handleTaskCreated = (newTask) => {
    setTasks(addTask(tasks, newTask));
  };

  const handleTaskUpdate = (taskId, updates) => {
    if (updates.isComplete) {
      const task = tasks.find(t => t.id === taskId);
      if (task && !task.isComplete) {
        const state = getEscalationState(task, now);
        if (state !== 'overdue') {
          setRecord(recordKept(record, task));
          // Trigger the avoided consequence celebration modal
          if (task.consequence_card) {
            setCelebrationMessage(task.consequence_card);
          }
        }
      }
    }
    setTasks(updateTask(tasks, taskId, updates));
    
    if (selectedTask && selectedTask.id === taskId) {
      setSelectedTask(prev => ({ ...prev, ...updates }));
    }
  };

  const handleTaskDelete = (taskId) => {
    const taskToDelete = tasks.find(t => t.id === taskId);
    if (taskToDelete) {
      setRecord(prevRecord => removeTaskFromRecord(prevRecord, taskToDelete));
    }
    setTasks(deleteTask(tasks, taskId));
    if (selectedTask && selectedTask.id === taskId) {
      setSelectedTask(null);
    }
  };

  // Schedule Import submit handler
  const handleImportSubmit = async (e) => {
    e.preventDefault();
    if (!importText.trim()) return;
    setIsImporting(true);
    try {
      const items = await parseDailySchedule(importText);
      const updatedTasks = [...tasks];
      
      await Promise.all(items.map(async (item) => {
        if (item.type === 'meeting') {
          try {
            await fetch('/api/meetings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: item.title,
                contactName: item.contactName || 'Team',
                time: item.time || 'Today',
                dateTime: item.dateTime
              })
            });
          } catch (err) {
            console.error('Failed to save imported meeting:', err);
          }
        } else {
          try {
            const task = await createFullTask(item.title);
            if (item.dateTime) {
              task.deadline = item.dateTime;
            }
            updatedTasks.push(task);
          } catch (err) {
            console.error('Failed to create imported task:', err);
          }
        }
      }));

      setTasks(updatedTasks);
      saveTasks(updatedTasks);
      fetchMeetings();
      setImportText('');
      setShowImportModal(false);
    } catch (err) {
      console.error('Import failed:', err);
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setImportText(event.target.result || '');
    };
    reader.readAsText(file);
  };

  // Triggers when user enters workspace from Landing Page
  const handleStartApp = () => {
    sessionStorage.setItem('donna_splash_shown', 'true');
    setShowSplash(false);

    // Check if user profile already exists
    const stored = localStorage.getItem('donna_user_profile');
    if (stored) {
      setShowOnboarding(false);
    } else {
      setShowOnboarding(true);
      setOnboardingStep(1);
      // Play conversational voice prompt for Step 1
      setTimeout(() => {
        speak("Hello there! I am Donna. Let's customize your profile. What is your primary focus or occupation?");
      }, 500);
    }
  };

  // Onboarding Step Handlers
  const handleOnboardingStep1 = (e) => {
    e.preventDefault();
    if (!profileFocus.trim()) return;
    stopSpeech();
    setOnboardingStep(2);
    setTimeout(() => {
      speak("Got it. Now, what is your daily focus target in hours, and what time should we begin focus check-ins?");
    }, 200);
  };

  const handleOnboardingStep2 = (e) => {
    e.preventDefault();
    if (!profileDailyTarget.trim() || !profileCheckInTime.trim()) return;
    stopSpeech();
    setOnboardingStep(3);
    setTimeout(() => {
      speak("Almost done. What is your biggest distraction when you procrastinate?");
    }, 200);
  };

  const handleOnboardingStep3 = (e) => {
    e.preventDefault();
    if (!profileHabits.trim()) return;
    stopSpeech();

    // Save profile to localStorage
    const profile = {
      occupation: profileFocus,
      dailyTarget: profileDailyTarget,
      checkInTime: profileCheckInTime,
      procrastinationHabits: profileHabits
    };
    localStorage.setItem('donna_user_profile', JSON.stringify(profile));
    
    speak("All set! Your focus profile is loaded. Welcome to DONNA.");
    setShowOnboarding(false);
  };

  // Generate rolling 7 days starting from yesterday
  const getWeekDays = () => {
    const days = [];
    for (let i = -1; i < 6; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      days.push(d);
    }
    return days;
  };
  const weekDays = getWeekDays();

  // Filter tasks based on selected day
  const isSameDay = (d1, d2) => {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  };

  const filteredTasks = tasks.filter(t => {
    const deadlineDate = new Date(t.deadline);
    return isSameDay(deadlineDate, selectedDate);
  });

  const filteredMeetings = meetings.filter(meet => {
    if (!meet.dateTime) return true; // keep old/legacy meetings
    const meetDate = new Date(meet.dateTime);
    return isSameDay(meetDate, selectedDate);
  });

  const sortedTasks = [...filteredTasks].sort((a, b) => {
    if (a.isComplete !== b.isComplete) return a.isComplete ? 1 : -1;
    const stateOrder = { overdue: 0, critical: 1, nudge: 2, calm: 3, done: 4 };
    const stateA = getEscalationState(a, now);
    const stateB = getEscalationState(b, now);
    if (stateOrder[stateA] !== stateOrder[stateB]) {
      return stateOrder[stateA] - stateOrder[stateB];
    }
    return new Date(a.deadline) - new Date(b.deadline);
  });

  // Calculate weighty Opal-style Focus Score
  const totalDeadlines = record.kept + record.broken;
  const focusScore = totalDeadlines > 0 ? Math.round((record.kept / totalDeadlines) * 100) : 100;

  // ── Show login screen if not authenticated ─────────────────────────────
  if (!userEmail || !userPassword) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-momentum-black flex flex-col md:flex-row font-sans select-none antialiased text-white relative">
      
      {/* Milestone Consequence Avoided Celebration Modal */}
      {celebrationMessage && (
        <div 
          className="fixed inset-0 bg-black/95 z-55 flex flex-col items-center justify-center p-6 animate-fade-in text-center"
          onClick={() => setCelebrationMessage(null)}
        >
          {/* Ambient background glows */}
          <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-[#E2C9FF]/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-[#8CFFDD]/20 rounded-full blur-3xl"></div>

          {/* Milestone Purple-Mint Gradient card */}
          <div 
            className="max-w-md w-full bg-gradient-to-br from-[#E2C9FF] to-[#8CFFDD] text-black p-8 rounded-[32px] shadow-2xl relative overflow-hidden scale-up-animation cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-16 h-16 bg-white/30 rounded-full flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
              </svg>
            </div>
            <h3 className="text-lg font-black uppercase tracking-wider mb-2">Consequence Avoided</h3>
            <p className="text-sm font-semibold leading-relaxed mb-6 px-2">
              "{celebrationMessage}"
            </p>
            <button
              onClick={() => setCelebrationMessage(null)}
              className="w-full py-3.5 bg-black hover:bg-stone-900 text-white font-bold text-xs uppercase tracking-wider rounded-2xl transition-all shadow-md active:scale-98"
            >
              Keep Moving
            </button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------
          CONVERSATIONAL ONBOARDING OVERLAY SCREEN
          --------------------------------------------------------------------- */}
      {showOnboarding && !showSplash && (
        <div className="fixed inset-0 bg-momentum-black z-50 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-momentum-card border border-momentum-border rounded-[32px] p-8 shadow-2xl relative overflow-hidden flex flex-col justify-between min-h-[460px]">
            {/* Close button in top-right corner */}
            <button 
              type="button"
              onClick={() => {
                setShowOnboarding(false);
                stopSpeech();
              }}
              className="absolute top-5 right-5 text-stone-500 hover:text-white text-[10px] uppercase tracking-widest font-black cursor-pointer z-10 transition-colors"
            >
              ✕ Close
            </button>

            {/* Ambient glows behind Donna's sphere */}
            <div className="absolute top-10 left-10 w-32 h-32 bg-white/5 rounded-full blur-2xl"></div>

            {/* Header info */}
            <div className="text-center shrink-0">
              <span className="text-[10px] text-momentum-muted font-bold uppercase tracking-widest block">Focus Onboarding</span>
              <h2 className="text-sm font-bold text-white mt-1 uppercase tracking-wider">Meet Donna AI</h2>
            </div>

            {/* Conversational Orb illustration in middle */}
            <div className="flex-1 flex flex-col justify-center items-center my-6">
              <div className={`w-28 h-28 rounded-full flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-stone-700 via-stone-900 to-black border border-white/10 shadow-lg ${isSpeaking ? 'animate-pulse shadow-white/15' : ''}`}>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(255,255,255,0.45)_0%,rgba(255,255,255,0)_60%)] rounded-full"></div>
                <svg className="w-10 h-10 text-stone-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                </svg>
              </div>

              {/* Donna conversational prompt */}
              <div className="mt-6 text-center px-2 min-h-[60px] flex items-center justify-center">
                <p className="text-sm text-stone-250 leading-relaxed font-medium">
                  {onboardingStep === 1 && "Hello there! I am Donna. Let's customize your profile. What is your primary focus or occupation?"}
                  {onboardingStep === 2 && "Got it. Now, what is your daily focus target in hours, and what time should we begin focus check-ins?"}
                  {onboardingStep === 3 && "Almost done. What is your biggest distraction when you find yourself procrastinating?"}
                </p>
              </div>

              {/* Form entries based on steps */}
              <div className="w-full mt-6">
                {onboardingStep === 1 && (
                  <form onSubmit={handleOnboardingStep1} className="w-full">
                    <input 
                      required
                      type="text" 
                      value={profileFocus} 
                      onChange={(e) => setProfileFocus(e.target.value)} 
                      placeholder="e.g., Software Engineer, CS Student" 
                      className="w-full px-4 py-3 bg-black/60 border border-momentum-border rounded-xl text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-white/20"
                    />
                    <button type="submit" className="w-full mt-3 py-3 bg-white text-black font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-stone-200 transition-all cursor-pointer">
                      Next
                    </button>
                  </form>
                )}

                {onboardingStep === 2 && (
                  <form onSubmit={handleOnboardingStep2} className="w-full space-y-3">
                    <input 
                      required
                      type="text" 
                      value={profileDailyTarget} 
                      onChange={(e) => setProfileDailyTarget(e.target.value)} 
                      placeholder="Daily Focus Target (e.g., 4 Hours)" 
                      className="w-full px-4 py-3 bg-black/60 border border-momentum-border rounded-xl text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-white/20"
                    />
                    <input 
                      required
                      type="text" 
                      value={profileCheckInTime} 
                      onChange={(e) => setProfileCheckInTime(e.target.value)} 
                      placeholder="Check-In Time (e.g., 9:00 AM)" 
                      className="w-full px-4 py-3 bg-black/60 border border-momentum-border rounded-xl text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-white/20"
                    />
                    <button type="submit" className="w-full py-3 bg-white text-black font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-stone-200 transition-all cursor-pointer">
                      Next
                    </button>
                  </form>
                )}

                {onboardingStep === 3 && (
                  <form onSubmit={handleOnboardingStep3} className="w-full">
                    <input 
                      required
                      type="text" 
                      value={profileHabits} 
                      onChange={(e) => setProfileHabits(e.target.value)} 
                      placeholder="e.g., Scrolling phone, watching YouTube videos" 
                      className="w-full px-4 py-3 bg-black/60 border border-momentum-border rounded-xl text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-white/20"
                    />
                    <button type="submit" className="w-full mt-3 py-3 bg-gradient-to-br from-[#E2C9FF] to-[#8CFFDD] text-black font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-lg active:scale-98">
                      Finish & Save
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------
          HIGH-FIDELITY FEATURE-RICH SaaS MARKETING LANDING PAGE
          --------------------------------------------------------------------- */}
      {showSplash && (
        <div className="flex-1 flex flex-col bg-momentum-black relative overflow-y-auto px-6 py-12 scrollbar-none">
          
          {/* Decorative ambient glowing grids behind content */}
          <div className="absolute top-10 left-10 w-96 h-96 bg-gradient-to-br from-orange-500/5 to-transparent rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-gradient-to-br from-purple-500/5 to-transparent rounded-full blur-3xl pointer-events-none"></div>

          {/* Logo Brand Header */}
          <header className="max-w-4xl mx-auto w-full flex flex-col sm:flex-row items-center justify-between shrink-0 mb-12 gap-6 pb-6 border-b border-white/5">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center text-black font-extrabold text-sm shadow-md">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="10" cy="10" r="3" fill="black"/>
                  <path d="M10 2 L10 5" stroke="black" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M10 15 L10 18" stroke="black" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M2 10 L5 10" stroke="black" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M15 10 L18 10" stroke="black" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M4.22 4.22 L6.34 6.34" stroke="black" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M13.66 13.66 L15.78 15.78" stroke="black" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M15.78 4.22 L13.66 6.34" stroke="black" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M6.34 13.66 L4.22 15.78" stroke="black" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div>
                <h1 className="text-sm font-black text-white tracking-widest uppercase leading-tight">DONNA</h1>
                <span className="text-[8px] font-bold text-stone-500 uppercase tracking-widest block">AI Focus Suite</span>
              </div>
            </div>

            {/* Premium Sub-Navigation Menu */}
            <nav className="flex items-center gap-6">
              <button 
                onClick={() => setLandingPageTab('home')}
                className={`text-[10px] font-bold uppercase tracking-widest cursor-pointer transition-all ${landingPageTab === 'home' ? 'text-white border-b border-white pb-1' : 'text-stone-500 hover:text-stone-300'}`}
              >
                Product
              </button>
              <button 
                onClick={() => setLandingPageTab('methodology')}
                className={`text-[10px] font-bold uppercase tracking-widest cursor-pointer transition-all ${landingPageTab === 'methodology' ? 'text-white border-b border-white pb-1' : 'text-stone-500 hover:text-stone-300'}`}
              >
                Methodology
              </button>
              <button 
                onClick={() => setLandingPageTab('privacy')}
                className={`text-[10px] font-bold uppercase tracking-widest cursor-pointer transition-all ${landingPageTab === 'privacy' ? 'text-white border-b border-white pb-1' : 'text-stone-500 hover:text-stone-300'}`}
              >
                Privacy & Security
              </button>
            </nav>

            <div>
              <span className="text-[10px] text-momentum-secondary font-bold uppercase tracking-wider bg-white/5 border border-white/5 px-3.5 py-1.5 rounded-full">
                v1.0.0 Stable
              </span>
            </div>
          </header>

          {/* PAGE 1: HOME (PRODUCT) */}
          {landingPageTab === 'home' && (
            <>
              {/* Hero Section */}
              <main className="max-w-4xl mx-auto w-full flex-1 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center my-10">
                <div className="lg:col-span-7">
                  <h2 className="text-4xl md:text-5xl font-black tracking-tight text-white uppercase leading-none">
                    Overcome <br />
                    <span className="bg-gradient-to-r from-white via-momentum-secondary to-stone-600 bg-clip-text text-transparent">Activation Energy.</span>
                  </h2>
                  <p className="text-sm text-momentum-secondary mt-5 leading-relaxed max-w-lg">
                    DONNA is a solo accountability companion designed around hard consequence loops, structured task outlines, and an AI voice-guided partner built for deep focus.
                  </p>
                  
                  <div className="mt-8 flex flex-col sm:flex-row gap-4">
                    <button 
                      onClick={handleStartApp}
                      className="px-8 py-4 bg-white text-black font-bold text-xs uppercase tracking-wider rounded-2xl hover:bg-stone-250 transition-all cursor-pointer shadow-lg active:scale-98 flex items-center justify-center gap-2"
                    >
                      Enter Deep Focus
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    </button>
                    <a 
                      href="#features" 
                      className="px-8 py-4 bg-white/5 border border-white/5 text-stone-300 font-bold text-xs uppercase tracking-wider rounded-2xl hover:bg-white/10 hover:text-white transition-all text-center flex items-center justify-center"
                    >
                      Explore Features
                    </a>
                  </div>
                </div>

                {/* Premium CSS App Mockup Visual */}
                <div className="lg:col-span-5 relative w-full h-[320px] flex items-center justify-center">
                  <div className="absolute w-72 h-72 rounded-full bg-gradient-to-br from-orange-500/10 to-purple-500/5 blur-3xl pointer-events-none"></div>

                  <div className="w-[280px] bg-[#161210] border border-white/5 rounded-3xl p-5 relative shadow-2xl overflow-hidden scale-up-animation">
                    <div className="flex justify-between items-center mb-4 pb-2 border-b border-white/5">
                      <span className="text-[8px] font-bold text-stone-500 uppercase tracking-widest">Workspace Preview</span>
                      <div className="flex gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#ff453a]/40"></div>
                        <div className="w-1.5 h-1.5 rounded-full bg-[#ff9f0a]/40"></div>
                        <div className="w-1.5 h-1.5 rounded-full bg-[#30d158]/40"></div>
                      </div>
                    </div>

                    <div className="p-3 bg-white/5 border border-white/5 rounded-xl flex items-center justify-between mb-3.5 shadow-sm">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full border border-white/15 bg-black flex items-center justify-center">
                          <span className="text-[10px] font-black text-white">85%</span>
                        </div>
                        <div>
                          <span className="text-[7px] text-stone-500 font-black uppercase tracking-wider block">Focus Score</span>
                          <span className="text-[9px] text-[#bcbbc0]">5 of 6 kept</span>
                        </div>
                      </div>
                      <span className="text-[7px] text-[#30d158] font-bold uppercase tracking-wider bg-[#30d158]/10 border border-[#30d158]/10 px-2 py-0.5 rounded-full">
                        On Track
                      </span>
                    </div>

                    <div className="p-3 bg-white/5 border border-white/5 rounded-xl space-y-2 mb-3.5 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-white truncate max-w-[130px]">Math Test Prep</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-[#ff453a] animate-pulse"></span>
                      </div>
                      <div className="text-[7px] text-[#bcbbc0] leading-relaxed border-l-2 border-white/10 pl-2 italic">
                        "Your grade drops to a C, disqualifying you from the scholarship."
                      </div>
                    </div>

                    <div className="p-3 bg-gradient-to-br from-[#E2C9FF]/5 to-[#8CFFDD]/5 border border-[#E2C9FF]/10 rounded-xl flex justify-between items-center shadow-sm">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px]">🔒</span>
                        <span className="text-[9px] font-bold text-white uppercase tracking-wider">Locked In</span>
                      </div>
                      <span className="text-[8px] text-black font-extrabold uppercase tracking-widest bg-gradient-to-br from-[#E2C9FF] to-[#8CFFDD] px-2 py-0.5 rounded-full shadow-sm">
                        Armed
                      </span>
                    </div>
                  </div>

                  <div className="absolute bottom-6 -right-6 w-44 bg-black/85 backdrop-blur-md border border-white/10 rounded-2xl p-3 shadow-2xl transform rotate-3 flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-[#ff453a]/15 border border-[#ff453a]/20 flex items-center justify-center text-[#ff453a] text-[10px]">
                      ⚠️
                    </div>
                    <div className="min-w-0">
                      <span className="text-[7px] text-stone-500 font-bold uppercase tracking-wider block">Consequence Avoided</span>
                      <span className="text-[9px] text-white font-medium truncate block">Forfeit email cancelled.</span>
                    </div>
                  </div>
                </div>
              </main>

              {/* Feature Grid Section */}
              <section id="features" className="max-w-4xl mx-auto w-full mt-20 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 bg-momentum-card border border-momentum-border rounded-3xl hover:border-momentum-border-hover transition-all duration-300 group flex flex-col sm:flex-row gap-5 items-start sm:items-center">
                  <div className="flex-1">
                    <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-4 text-stone-300 group-hover:text-white transition-colors">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-white">Donna AI Voice Companion</h3>
                    <p className="text-[11px] text-momentum-secondary mt-2.5 leading-relaxed">
                      Always-listening assistant that handles tasks scheduling, priorities management, and outlines review via speech. Remembers your profile parameters to guide choices.
                    </p>
                  </div>
                  <div className="w-full sm:w-44 h-28 bg-black/40 border border-white/5 rounded-2xl flex items-center justify-center relative overflow-hidden shrink-0">
                    <div className="absolute w-20 h-20 rounded-full border border-white/10 animate-ping"></div>
                    <div className="absolute w-12 h-12 rounded-full border border-white/20 animate-pulse bg-gradient-to-br from-orange-500/10 to-transparent"></div>
                    <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white relative z-10 shadow-lg">
                      🎙️
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-momentum-card border border-momentum-border rounded-3xl hover:border-momentum-border-hover transition-all duration-300 group flex flex-col sm:flex-row gap-5 items-start sm:items-center">
                  <div className="flex-1">
                    <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-4 text-stone-300 group-hover:text-white transition-colors">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-white">Material Consequence Projections</h3>
                    <p className="text-[11px] text-momentum-secondary mt-2.5 leading-relaxed">
                      Gemini projects realistic, slightly uncomfortable fallout (academic grades slip, loss of work reputation) to create genuine felt urgency instead of fake points.
                    </p>
                  </div>
                  <div className="w-full sm:w-44 h-28 bg-black/40 border border-white/5 rounded-2xl flex flex-col justify-center p-3 relative overflow-hidden shrink-0 select-none">
                    <div className="flex items-center gap-1 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#ff453a] animate-pulse"></span>
                      <span className="text-[6.5px] text-[#ff453a] font-bold uppercase tracking-wider">Consequence</span>
                    </div>
                    <p className="text-[8.5px] text-[#bcbbc0] leading-normal border-l border-[#ff453a]/30 pl-1.5 italic">
                      "Manager presents review without your inputs. VP asks about drop."
                    </p>
                  </div>
                </div>

                <div className="p-6 bg-momentum-card border border-momentum-border rounded-3xl hover:border-momentum-border-hover transition-all duration-300 group flex flex-col sm:flex-row gap-5 items-start sm:items-center">
                  <div className="flex-1">
                    <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-4 text-stone-300 group-hover:text-white transition-colors">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-white">Commitment Contracts (3 Levels)</h3>
                    <p className="text-[11px] text-momentum-secondary mt-2.5 leading-relaxed">
                      Choose your strictness: *Flexible* for simple alerts, *Committed* for armed email drafts, or *Locked In* to disable task deletion, locking the contract irreversibly.
                    </p>
                  </div>
                  <div className="w-full sm:w-44 h-28 bg-black/40 border border-white/5 rounded-2xl flex flex-col justify-center gap-1.5 p-3 relative overflow-hidden shrink-0">
                    <div className="flex gap-1 text-[7px] font-bold text-stone-500 uppercase tracking-wider justify-between">
                      <span>Strictness</span>
                      <span className="text-[#8CFFDD]">Armed</span>
                    </div>
                    <div className="h-4 bg-white/5 rounded flex items-center px-1.5 justify-between">
                      <span className="text-[7.5px] text-stone-400">Committed</span>
                      <span className="w-1 h-1 rounded-full bg-stone-700"></span>
                    </div>
                    <div className="h-4 bg-gradient-to-br from-[#E2C9FF] to-[#8CFFDD] rounded flex items-center px-1.5 justify-between shadow-sm">
                      <span className="text-[7.5px] text-black font-black">Locked In</span>
                      <span className="text-[7.5px]">🔒</span>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-momentum-card border border-momentum-border rounded-3xl hover:border-momentum-border-hover transition-all duration-300 group flex flex-col sm:flex-row gap-5 items-start sm:items-center">
                  <div className="flex-1">
                    <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-4 text-stone-300 group-hover:text-white transition-colors">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-white">Zero-Effort Head-Start Outlines</h3>
                    <p className="text-[11px] text-momentum-secondary mt-2.5 leading-relaxed">
                      Overcome blank-page syndrome. Get structured writing sessions or study breakdowns created by Gemini to help you start executing instantly.
                    </p>
                  </div>
                  <div className="w-full sm:w-44 h-28 bg-black/40 border border-white/5 rounded-2xl flex flex-col justify-center p-3 relative overflow-hidden shrink-0 space-y-1">
                    <div className="text-[7px] font-bold text-white tracking-wide border-b border-white/5 pb-0.5">
                      📄 study_plan.md
                    </div>
                    <div className="text-[6.5px] text-stone-400 leading-tight">
                      <span className="text-white font-bold block">## Session 1</span>
                      - Linear equations: 2x2<br />
                      - Quadratic formulas
                    </div>
                  </div>
                </div>
              </section>

              {/* Telemetry metrics dashboard */}
              <section className="max-w-4xl mx-auto w-full mt-24 border-t border-white/5 pt-16">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center sm:text-left">
                  <div className="space-y-2">
                    <span className="text-3xl font-black text-white block">{focusScore}%</span>
                    <span className="text-[9px] text-stone-500 font-extrabold uppercase tracking-widest block">Your Focus Score</span>
                    <p className="text-[10px] text-momentum-secondary leading-relaxed">
                      Calculated from your history of keeping {record.kept} and breaking {record.broken} contracts.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <span className="text-3xl font-black text-white block">{tasks.length} Active</span>
                    <span className="text-[9px] text-stone-500 font-extrabold uppercase tracking-widest block">Committed Deadlines</span>
                    <p className="text-[10px] text-momentum-secondary leading-relaxed">
                      The number of active priority contracts currently locked inside your workspace.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <span className="text-3xl font-black text-white block">100% Local</span>
                    <span className="text-[9px] text-stone-500 font-extrabold uppercase tracking-widest block">Focus Sandbox Memory</span>
                    <p className="text-[10px] text-momentum-secondary leading-relaxed">
                      All task outline briefs, profile preferences, and Donna conversation logs live strictly on your device.
                    </p>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* PAGE 2: METHODOLOGY */}
          {landingPageTab === 'methodology' && (
            <main className="max-w-4xl mx-auto w-full flex-1 flex flex-col justify-center my-6 space-y-12">
              <div className="max-w-2xl">
                <span className="text-[10px] text-stone-500 font-extrabold uppercase tracking-widest block">Sovereignty of Focus</span>
                <h2 className="text-3xl md:text-4xl font-black tracking-tight text-white uppercase leading-none mt-2">
                  The Science of Constraint.
                </h2>
                <p className="text-sm text-momentum-secondary mt-4 leading-relaxed">
                  DONNA shifts task management from gamified badges to behavioral constraints. Here is the psychological framework guiding our systems.
                </p>
              </div>

              <div className="space-y-6 mt-6">
                <div className="p-6 bg-momentum-card border border-momentum-border rounded-3xl hover:border-momentum-border-hover transition-all duration-300 group flex flex-col sm:flex-row gap-5 items-start sm:items-center">
                  <div className="flex-1">
                    <span className="text-xs font-bold text-white uppercase tracking-wider block">1. Overcoming Activation Energy</span>
                    <p className="text-[11px] text-momentum-secondary mt-2 leading-relaxed">
                      The highest friction in any task occurs right at the start (the "blank slate" effect). DONNA bypasses this state by automatically drafting structured, HTML outlines or drafts, reducing startup friction to under 30 seconds.
                    </p>
                  </div>
                  <div className="w-full sm:w-48 h-32 bg-black/40 border border-white/5 rounded-2xl flex flex-col justify-between p-3 relative overflow-hidden shrink-0 select-none">
                    <div className="text-[7px] text-stone-500 uppercase tracking-widest font-black mb-1">Activation Hill</div>
                    <div className="flex-1 flex items-end justify-between relative px-2 mb-2">
                      <div className="absolute inset-x-0 bottom-0 h-10 border-t-2 border-dashed border-stone-800"></div>
                      <div className="absolute left-2 bottom-0 w-3.5 h-3.5 rounded-full bg-stone-700 border border-white/10 flex items-center justify-center text-[5.5px] text-stone-400 font-bold">1</div>
                      <div className="absolute right-2 bottom-6 w-3.5 h-3.5 rounded-full bg-orange-500 flex items-center justify-center text-[5.5px] text-black font-bold animate-pulse">2</div>
                      <svg className="absolute inset-0 w-full h-full" fill="none">
                        <path d="M 15 35 Q 70 -5 145 15" stroke="#f97316" strokeWidth="1" strokeDasharray="3,3"/>
                      </svg>
                    </div>
                    <div className="flex justify-between items-center text-[6.5px] border-t border-white/5 pt-1">
                      <span className="text-stone-400">1. Blank Slate</span>
                      <span className="text-orange-500 font-bold">2. AI Outline -90% Friction</span>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-momentum-card border border-momentum-border rounded-3xl hover:border-momentum-border-hover transition-all duration-300 group flex flex-col sm:flex-row gap-5 items-start sm:items-center">
                  <div className="flex-1">
                    <span className="text-xs font-bold text-white uppercase tracking-wider block">2. Negative Framing & Loss Aversion</span>
                    <p className="text-[11px] text-momentum-secondary mt-2 leading-relaxed">
                      Behavioral psychology demonstrates that humans are 2.5x more motivated by avoiding loss than by achieving equivalent gains. By projecting real-world, uncomfortable consequences (academic grades dropping, loss of work rapport), we leverage loss aversion to create urgency.
                    </p>
                  </div>
                  <div className="w-full sm:w-48 h-32 bg-black/40 border border-white/5 rounded-2xl flex flex-col justify-center p-3 relative overflow-hidden shrink-0 space-y-2.5 select-none">
                    <div className="text-[7px] text-stone-500 uppercase tracking-widest font-black">Behavioral Motivation</div>
                    <div className="space-y-2">
                      <div>
                        <div className="flex justify-between text-[6.5px] text-stone-400 mb-0.5">
                          <span>Positive Gains (Points)</span>
                          <span>1.0x</span>
                        </div>
                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-stone-600 rounded-full" style={{ width: '40%' }}></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-[6.5px] text-orange-500 font-black mb-0.5">
                          <span>Loss Aversion (Consequences)</span>
                          <span>2.5x Urgency</span>
                        </div>
                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-orange-600 to-red-500 rounded-full" style={{ width: '100%' }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-momentum-card border border-momentum-border rounded-3xl hover:border-momentum-border-hover transition-all duration-300 group flex flex-col sm:flex-row gap-5 items-start sm:items-center">
                  <div className="flex-1">
                    <span className="text-xs font-bold text-white uppercase tracking-wider block">3. Pre-Commitment Contracts</span>
                    <p className="text-[11px] text-momentum-secondary mt-2 leading-relaxed">
                      A pre-commitment is the act of restricting future actions to guarantee success. Toggling a "Locked In" contract prevents task deletion and commands Donna to stand watch. You cannot delete the task, forcing you to execute.
                    </p>
                  </div>
                  <div className="w-full sm:w-48 h-32 bg-black/40 border border-white/5 rounded-2xl flex flex-col justify-center p-3 relative overflow-hidden shrink-0 select-none">
                    <div className="flex justify-between items-center text-[7px] text-stone-500 uppercase tracking-widest font-black mb-2">
                      <span>Contract Status</span>
                      <span className="text-red-400 font-bold uppercase tracking-wider text-[6.5px]">Locked</span>
                    </div>
                    <div className="p-2 bg-white/5 border border-red-500/20 rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[8px] text-white font-bold truncate">Draft API Spec</span>
                        <span className="text-[8px]">🔒</span>
                      </div>
                      <div className="flex gap-1.5">
                        <div className="flex-1 py-1 bg-white/5 text-stone-600 border border-white/5 rounded text-[6px] font-bold flex items-center justify-center gap-0.5">
                          <span>Complete</span>
                        </div>
                        <div className="flex-1 py-1 bg-red-950/20 text-red-500/30 border border-red-500/10 rounded text-[6px] font-bold flex items-center justify-center gap-0.5">
                          <span>Delete 🚫</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-10 flex justify-center">
                <button 
                  onClick={handleStartApp}
                  className="px-8 py-4 bg-white text-black font-bold text-xs uppercase tracking-wider rounded-2xl hover:bg-stone-250 transition-all cursor-pointer shadow-lg active:scale-98 flex items-center justify-center gap-2"
                >
                  Enter Deep Focus Workspace
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </button>
              </div>
            </main>
          )}

          {/* PAGE 3: PRIVACY & SECURITY */}
          {landingPageTab === 'privacy' && (
            <main className="max-w-4xl mx-auto w-full flex-1 flex flex-col justify-center my-6 space-y-12">
              <div className="max-w-2xl">
                <span className="text-[10px] text-stone-500 font-extrabold uppercase tracking-widest block">Sovereignty of Data</span>
                <h2 className="text-3xl md:text-4xl font-black tracking-tight text-white uppercase leading-none mt-2">
                  Zero-Cloud Privacy Guarantee.
                </h2>
                <p className="text-sm text-momentum-secondary mt-4 leading-relaxed">
                  We believe productivity tools should protect your personal focus profiles, not harvest them. Here is how we secure your workspace environment.
                </p>
              </div>

              <div className="space-y-6 mt-6">
                <div className="p-6 bg-momentum-card border border-momentum-border rounded-3xl hover:border-momentum-border-hover transition-all duration-300 group flex flex-col sm:flex-row gap-5 items-start sm:items-center">
                  <div className="flex-1">
                    <span className="text-xs font-bold text-white uppercase tracking-wider block">100% Local Storage</span>
                    <p className="text-[11px] text-momentum-secondary mt-2 leading-relaxed">
                      Your focus profiles, tasks, calendar meetings, and Donna dialogue records live exclusively inside your browser's local sandbox storage (`localStorage`). We maintain no remote servers to track your habits.
                    </p>
                  </div>
                  <div className="w-full sm:w-48 h-32 bg-black/40 border border-white/5 rounded-2xl flex flex-col justify-center p-3 relative overflow-hidden shrink-0 select-none">
                    <div className="text-[7px] text-stone-500 uppercase tracking-widest font-black mb-2">Data Sandboxing</div>
                    <div className="flex items-center justify-around gap-2 bg-white/5 border border-white/10 rounded-xl p-2.5">
                      <div className="text-center">
                        <div className="text-xs mb-0.5">💻</div>
                        <span className="text-[6.5px] text-stone-400 font-bold block">Your Device</span>
                        <span className="text-[5.5px] text-emerald-400 block font-mono">localStorage</span>
                      </div>
                      <div className="text-stone-700 animate-pulse text-xs">🔒</div>
                      <div className="text-center opacity-30">
                        <div className="text-xs mb-0.5">☁️</div>
                        <span className="text-[6.5px] text-stone-500 font-bold block">Cloud Servers</span>
                        <span className="text-[5.5px] text-red-500 block font-mono">Blocked</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-momentum-card border border-momentum-border rounded-3xl hover:border-momentum-border-hover transition-all duration-300 group flex flex-col sm:flex-row gap-5 items-start sm:items-center">
                  <div className="flex-1">
                    <span className="text-xs font-bold text-white uppercase tracking-wider block">Transparent Communication</span>
                    <p className="text-[11px] text-momentum-secondary mt-2 leading-relaxed">
                      Commitment forfeit email notifications are never transmitted automatically in the background. They are drafted locally inside your email client for your explicit review and confirmation before sending.
                    </p>
                  </div>
                  <div className="w-full sm:w-48 h-32 bg-black/40 border border-white/5 rounded-2xl flex flex-col justify-center p-3 relative overflow-hidden shrink-0 space-y-1.5 select-none">
                    <div className="flex justify-between items-center text-[7px] text-stone-500 uppercase tracking-widest font-black">
                      <span>Forfeit Queue</span>
                      <span className="text-amber-400 font-bold uppercase text-[6px]">Ready</span>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-1.5 text-[6.5px] text-stone-300 font-mono space-y-0.5">
                      <div>To: contact@partner.com</div>
                      <div className="truncate text-[5.5px]">Subj: Missed Contract: Draft spec</div>
                    </div>
                    <div className="w-full py-1 bg-white text-black text-[7px] font-bold uppercase rounded-lg flex items-center justify-center gap-1 shadow-sm">
                      <span>Draft Locally ↗</span>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-momentum-card border border-momentum-border rounded-3xl hover:border-momentum-border-hover transition-all duration-300 group flex flex-col sm:flex-row gap-5 items-start sm:items-center">
                  <div className="flex-1">
                    <span className="text-xs font-bold text-white uppercase tracking-wider block">Secure Audio Sandboxing</span>
                    <p className="text-[11px] text-momentum-secondary mt-2 leading-relaxed">
                      Donna's speech-to-text recognition relies on native Web Speech Browser APIs. Audio is never recorded, catalogued, or streamed to remote servers, safeguarding the privacy of your work environment.
                    </p>
                  </div>
                  <div className="w-full sm:w-48 h-32 bg-black/40 border border-white/5 rounded-2xl flex flex-col justify-center p-3 relative overflow-hidden shrink-0 select-none">
                    <div className="flex justify-between items-center text-[7px] text-stone-500 uppercase tracking-widest font-black mb-1.5">
                      <span>Voice Sandboxing</span>
                      <span className="text-emerald-400 flex items-center gap-0.5 font-bold uppercase text-[6px]">
                        <span className="w-1 h-1 rounded-full bg-emerald-400 animate-ping"></span>
                        Offline
                      </span>
                    </div>
                    <div className="flex items-center justify-center gap-1.5 h-10 px-2 bg-white/5 rounded-xl border border-white/5 relative overflow-hidden">
                      <span className="w-1 h-4 bg-orange-500/60 rounded-full"></span>
                      <span className="w-1 h-7 bg-orange-500 rounded-full animate-pulse"></span>
                      <span className="w-1 h-5 bg-orange-500/80 rounded-full"></span>
                      <span className="w-1 h-8 bg-orange-500 rounded-full"></span>
                      <span className="w-1 h-6 bg-orange-500/90 rounded-full"></span>
                      <span className="w-1 h-4 bg-orange-500/60 rounded-full"></span>
                      <div className="absolute bottom-1 right-2 text-[5px] text-stone-500 font-bold uppercase tracking-wider">
                        Web Speech API
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-10 flex justify-center">
                <button 
                  onClick={handleStartApp}
                  className="px-8 py-4 bg-white text-black font-bold text-xs uppercase tracking-wider rounded-2xl hover:bg-stone-250 transition-all cursor-pointer shadow-lg active:scale-98 flex items-center justify-center gap-2"
                >
                  Enter Deep Focus Workspace
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </button>
              </div>
            </main>
          )}

          {/* Footer */}
          <footer className="max-w-4xl mx-auto w-full text-center shrink-0 border-t border-white/5 pt-8 mt-16">
            <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest">
              DONNA — Restraint as Luxury. © {new Date().getFullYear()} DONNA Inc. All rights reserved.
            </p>
          </footer>

        </div>
      )}

      {/* 1. SIDEBAR FOR DESKTOP */}
      {!showSplash && !showOnboarding && (
        <div className="hidden md:flex flex-col w-64 bg-black p-6 shrink-0 border-r border-white/5">
          {/* Sidebar Header */}
          <button 
            onClick={() => setShowSplash(true)}
            className="flex items-center gap-3 mb-8 text-left cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl bg-white group-hover:bg-stone-200 flex items-center justify-center shadow-sm transition-all">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="10" cy="10" r="3" fill="black"/>
                <path d="M10 2 L10 5" stroke="black" strokeWidth="2" strokeLinecap="round"/>
                <path d="M10 15 L10 18" stroke="black" strokeWidth="2" strokeLinecap="round"/>
                <path d="M2 10 L5 10" stroke="black" strokeWidth="2" strokeLinecap="round"/>
                <path d="M15 10 L18 10" stroke="black" strokeWidth="2" strokeLinecap="round"/>
                <path d="M4.22 4.22 L6.34 6.34" stroke="black" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M13.66 13.66 L15.78 15.78" stroke="black" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M15.78 4.22 L13.66 6.34" stroke="black" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M6.34 13.66 L4.22 15.78" stroke="black" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-black tracking-wider text-white uppercase leading-tight group-hover:text-stone-300 transition-colors">DONNA</h1>
              <span className="text-[9px] font-bold text-stone-500 uppercase tracking-widest block">Accountability</span>
            </div>
          </button>

          {/* Sidebar Navigation */}
          <nav className="flex-1 space-y-1.5">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-white text-black shadow-sm'
                  : 'text-stone-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Home
            </button>

            <button
              onClick={() => {
                setActiveTab('calendar');
                fetchMeetings();
              }}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'calendar'
                  ? 'bg-white text-black shadow-sm'
                  : 'text-stone-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Schedule
            </button>

            <button
              onClick={() => setActiveTab('donna')}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer relative ${
                activeTab === 'donna'
                  ? 'bg-white text-black shadow-sm'
                  : 'text-stone-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Donna AI
              {activeTab !== 'donna' && (
                <span className="absolute top-1/2 -translate-y-1/2 right-4 w-2 h-2 bg-white rounded-full animate-ping"></span>
              )}
            </button>
          </nav>

          {/* Time Machine Debug Trigger */}
          <button 
            onClick={() => setShowDebug(!showDebug)}
            className="w-full mt-4 flex items-center justify-center gap-2 py-2 border border-white/5 bg-white/5 hover:bg-white/10 text-stone-400 hover:text-white text-[10px] font-bold uppercase rounded-xl transition-all cursor-pointer"
          >
            Time Machine
          </button>

          {/* Profile Card — live email + logout */}
          <div className="p-4 bg-stone-900 border border-white/5 rounded-2xl mt-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-orange-900/30 border border-orange-500/20 flex items-center justify-center text-orange-300 font-bold shrink-0 text-xs">
                {userEmail.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-white truncate">{userEmail}</h4>
                <span className="text-[9px] text-stone-500 uppercase block mt-0.5 font-bold">Synced • All local</span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full py-2 text-[10px] font-bold text-stone-500 hover:text-red-400 uppercase tracking-wider border border-white/5 hover:border-red-500/20 rounded-xl transition-all cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* 2. MAIN APPLICATION WORKSPACE */}
      {!showSplash && !showOnboarding && (
        <div className="flex-1 flex flex-col min-h-screen relative overflow-hidden bg-black">
          
          {/* Mobile Header */}
          <div className="md:hidden flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/5 bg-black shrink-0">
            <button 
              onClick={() => setShowSplash(true)}
              className="flex items-center gap-2.5 cursor-pointer text-left active:opacity-75"
            >
              <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center shadow-sm">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="10" cy="10" r="3" fill="black"/>
                  <path d="M10 2 L10 5" stroke="black" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M10 15 L10 18" stroke="black" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M2 10 L5 10" stroke="black" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M15 10 L18 10" stroke="black" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M4.22 4.22 L6.34 6.34" stroke="black" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M13.66 13.66 L15.78 15.78" stroke="black" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M15.78 4.22 L13.66 6.34" stroke="black" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M6.34 13.66 L4.22 15.78" stroke="black" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <h1 className="text-sm font-black text-white tracking-widest uppercase">DONNA</h1>
            </button>
            {activeTab !== 'donna' && (
              <button 
                onClick={() => setShowDebug(!showDebug)}
                className="p-2 rounded-xl bg-white/5 border border-white/5 text-stone-400 hover:text-white cursor-pointer transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
                </svg>
              </button>
            )}
          </div>

          <div className="flex-1 flex flex-col pb-24 md:pb-6 overflow-y-auto relative scrollbar-none">
            
            {/* Time Machine Debug Panel */}
            {showDebug && (
              <div className="m-4 p-3 bg-stone-900 border border-white/5 rounded-2xl text-xs z-10 shrink-0">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-white">Time Machine Controls</span>
                  <span className="text-[10px] text-stone-500 font-bold uppercase">{now.toLocaleTimeString()}</span>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => setTimeOffsetHours(0)} className="flex-1 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-white font-bold cursor-pointer">Reset</button>
                  <button onClick={() => setTimeOffsetHours(p => p + 1)} className="flex-1 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-white font-bold cursor-pointer">+1h</button>
                  <button onClick={() => setTimeOffsetHours(p => p + 6)} className="flex-1 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-white font-bold cursor-pointer">+6h</button>
                  <button onClick={() => setTimeOffsetHours(p => p + 24)} className="flex-1 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-white font-bold cursor-pointer">+24h</button>
                </div>
              </div>
            )}

            {/* TAB CONTENT: DASHBOARD (Home) */}
            {activeTab === 'dashboard' && (
              <div className="p-5 flex-1 flex flex-col md:flex-row gap-6 min-h-0 overflow-y-auto md:overflow-hidden">
                {/* Left Side: Tasks & Timeline */}
                <div className="flex-1 flex flex-col min-h-0">
                  {/* Greeting Block */}
                  <div className="flex items-center gap-3.5 mb-5 mt-1 shrink-0">
                    <div className="w-10 h-10 rounded-full bg-white/5 border border-white/5 flex items-center justify-center text-stone-300 font-bold shrink-0">
                      U
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-[9px] text-stone-500 font-extrabold uppercase tracking-wider block">Commitment Contract</span>
                      <h2 className="text-sm font-bold text-white">Robert Fox</h2>
                    </div>
                  </div>

                  {/* Weighty Focus Score Counter */}
                  <div className="mb-5 shrink-0">
                    <div className="p-4 bg-stone-900 border border-white/5 rounded-2xl flex items-center justify-between shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full border border-white/10 bg-white/5 flex items-center justify-center">
                          <span className="text-base font-black text-white tracking-tighter">
                            {focusScore}%
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] text-stone-500 font-extrabold uppercase tracking-widest block">Focus Score</span>
                          <span className="text-[10px] text-[#bcbbc0] font-light">Based on avoided failures.</span>
                        </div>
                      </div>
                      <div className="text-right flex flex-col justify-center">
                        <span className="text-[9px] text-[#bcbbc0] block font-bold uppercase tracking-wider">{record.kept} Kept</span>
                        <span className="text-[9px] text-stone-500 block font-bold uppercase tracking-wider mt-0.5">{record.broken} Broken</span>
                      </div>
                    </div>
                  </div>

                  {/* Day strip Calendar */}
                  <div className="mb-5 shrink-0">
                    <div className="flex justify-between gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                      {weekDays.map((day, idx) => {
                        const active = isSameDay(day, selectedDate);
                        const todayLabel = isSameDay(day, now);
                        return (
                          <button
                            key={idx}
                            onClick={() => setSelectedDate(day)}
                            className={`flex-1 py-2 px-1 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all duration-200 ${
                              active
                                ? 'bg-white text-black shadow-sm'
                                : 'bg-stone-900 border border-white/5 text-stone-400 hover:text-white hover:bg-stone-850'
                            }`}
                          >
                            <span className="text-[9px] uppercase font-bold tracking-wider mb-1">
                              {day.toLocaleString([], { weekday: 'short' }).slice(0, 1)}
                            </span>
                            <span className="text-xs font-black">{day.getDate()}</span>
                            {todayLabel && !active && (
                              <span className="w-1 h-1 rounded-full bg-white mt-1"></span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Task Search Input */}
                  <div className="mb-5 shrink-0">
                    <TaskInput onTaskCreated={handleTaskCreated} />
                  </div>

                  {/* Deadlines Listing */}
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex justify-between items-center mb-2.5 shrink-0 px-1">
                      <h3 className="text-[9px] font-bold text-stone-500 uppercase tracking-widest">
                        Deadlines for {selectedDate.getDate() === now.getDate() ? 'Today' : selectedDate.toLocaleDateString([], { day: 'numeric', month: 'short' })}
                      </h3>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto space-y-3.5 scrollbar-none pb-4 md:pb-2">
                      {sortedTasks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 px-6 text-center border border-white/5 bg-[#161210]/40 rounded-3xl p-10 select-none relative overflow-hidden group">
                          {/* Pulsing visual glow effect */}
                          <div className="absolute -top-32 -left-32 w-64 h-64 bg-orange-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-orange-500/10 transition-all duration-700"></div>
                          <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-[#E2C9FF]/5 rounded-full blur-3xl pointer-events-none group-hover:bg-[#E2C9FF]/10 transition-all duration-700"></div>

                          {/* Interactive Focus Orb */}
                          <button 
                            type="button"
                            onClick={rotateQuote}
                            className="w-32 h-32 rounded-full bg-gradient-to-tr from-orange-600/20 via-[#201b17] to-amber-500/20 border border-orange-500/30 flex items-center justify-center shadow-xl cursor-pointer hover:scale-105 active:scale-95 transition-all duration-300 relative group/orb"
                          >
                            <div className="absolute inset-2.5 rounded-full bg-gradient-to-br from-orange-500/10 to-[#161210] animate-pulse"></div>
                            <div className="z-10 text-4xl group-hover/orb:rotate-12 transition-transform duration-300">🎯</div>
                            <div className="absolute -inset-2.5 rounded-full border border-orange-500/10 animate-ping opacity-30" style={{ animationDuration: '3s' }}></div>
                          </button>

                          <h4 className="text-lg font-bold text-white uppercase tracking-widest mt-6">Clear Horizon</h4>
                          <p className="text-xs text-stone-500 font-light max-w-sm mx-auto mt-2 leading-relaxed">
                            Your schedule for today is fully resolved. Keep your focus locked and avoid distractions.
                          </p>

                          {/* Dynamic interactive quote panel */}
                          <div className="mt-8 p-6 bg-black/40 border border-white/5 rounded-2xl max-w-md w-full transition-all duration-300">
                            <span className="text-[9px] text-orange-500 font-extrabold uppercase tracking-widest block mb-1.5">Donna Focus Reminder</span>
                            <p className="text-xs md:text-sm font-medium text-stone-250 leading-relaxed italic transition-opacity duration-300">
                              "{FOCUS_QUOTES[currentQuoteIdx]}"
                            </p>
                            <button 
                              type="button"
                              onClick={rotateQuote}
                              className="text-[10px] text-stone-500 hover:text-white uppercase tracking-widest font-black block mx-auto mt-3 transition-colors cursor-pointer"
                            >
                              Next Prompt ↗
                            </button>
                          </div>

                          {/* Quick Action Profile Summary */}
                          <div className="mt-6 flex flex-wrap gap-2 justify-center text-[9px] font-bold text-stone-400">
                            {profileFocus ? (
                              <>
                                <span className="px-3 py-1 bg-white/5 border border-white/5 rounded-lg">Focus: {profileFocus}</span>
                                <span className="px-3 py-1 bg-white/5 border border-white/5 rounded-lg">Shield: {profileHabits}</span>
                              </>
                            ) : (
                              <button 
                                type="button"
                                onClick={() => {
                                  setShowOnboarding(true);
                                  setOnboardingStep(1);
                                }}
                                className="px-3.5 py-2 bg-[#161210] border border-white/10 hover:border-white/20 text-[#fffdfa] rounded-lg uppercase tracking-wider hover:bg-stone-850 transition-colors"
                              >
                                Customize Focus Profile
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 gap-3">
                          {sortedTasks.map((task, idx) => (
                            <TaskCard 
                              key={task.id} 
                              task={task} 
                              now={now}
                              onClick={setSelectedTask} 
                              index={idx}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Side: Persistent Docked Donna AI */}
                <div className="hidden md:flex flex-col w-80 shrink-0 border border-white/5 bg-stone-955 rounded-3xl overflow-hidden">
                  <Donna 
                    inline={true} 
                    tasks={tasks}
                    onTaskCreated={handleTaskCreated}
                    onTaskUpdate={handleTaskUpdate}
                    onTaskDelete={handleTaskDelete}
                    onScheduleUpdate={fetchMeetings} 
                    active={activeTab === 'dashboard'} 
                    history={donnaHistory}
                    setHistory={setDonnaHistory}
                    hasGreeted={hasGreeted}
                    setHasGreeted={setHasGreeted}
                  />
                </div>
              </div>
            )}

            {/* TAB CONTENT: CALENDAR (Upcoming meetings) */}
            {activeTab === 'calendar' && (
              <div className="p-5 flex-1 flex flex-col md:flex-row gap-6 min-h-0 overflow-y-auto md:overflow-hidden">
                {/* Left Side: Meetings Timeline */}
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="flex justify-between items-center mb-5 mt-1 shrink-0">
                    <div>
                      <h2 className="text-base font-bold text-white uppercase tracking-wider">Schedule</h2>
                      <p className="text-[10px] text-stone-550 mt-0.5">Upcoming commitments</p>
                    </div>
                    <div className="flex gap-2 items-center">
                      <button 
                        onClick={() => setShowImportModal(true)}
                        className="px-3.5 py-2 bg-[#161210] border border-white/10 hover:border-white/20 text-[#fffdfa] font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-sm active:scale-98"
                      >
                        Import Schedule
                      </button>
                      <button 
                        onClick={fetchMeetings}
                        className="p-2 rounded-xl bg-stone-900 border border-white/5 text-stone-400 hover:text-white shadow-sm cursor-pointer shrink-0 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Day strip Calendar timeline */}
                  <div className="mb-5 shrink-0">
                    <div className="flex justify-between gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                      {weekDays.map((day, idx) => {
                        const active = isSameDay(day, selectedDate);
                        return (
                          <button
                            key={idx}
                            onClick={() => setSelectedDate(day)}
                            className={`flex-1 py-2 px-1 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all duration-200 ${
                              active
                                ? 'bg-white text-black shadow-sm'
                                : 'bg-stone-900 border border-white/5 text-stone-400 hover:text-white hover:bg-stone-855'
                            }`}
                          >
                            <span className="text-[9px] uppercase font-bold tracking-wider mb-0.5">
                              {day.toLocaleString([], { weekday: 'short' }).slice(0, 1)}
                            </span>
                            <span className="text-xs font-black">{day.getDate()}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Meetings List */}
                  <div className="flex-1 min-h-0 overflow-y-auto space-y-3.5 scrollbar-none pb-4 md:pb-2">
                    {filteredMeetings.length === 0 ? (
                      <div className="text-center py-12 px-4 bg-stone-955 border border-white/5 border-dashed rounded-2xl">
                        <h4 className="text-xs font-bold text-stone-450 mb-1">Clear Schedule</h4>
                        <p className="text-[10px] text-stone-500 max-w-[200px] mx-auto leading-relaxed">
                          No meetings scheduled for this day. Ask Donna to add one.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 gap-3">
                        {filteredMeetings.map((meet, idx) => (
                          <div 
                            key={meet.id || idx}
                            onClick={() => {
                              const correspondingTask = tasks.find(t => 
                                t.title.toLowerCase().includes(meet.title.toLowerCase()) ||
                                meet.title.toLowerCase().includes(t.title.toLowerCase()) ||
                                t.title.toLowerCase().includes(meet.contactName.toLowerCase())
                              );
                              if (correspondingTask) {
                                setSelectedTask(correspondingTask);
                              } else {
                                setSelectedTask({
                                  title: meet.title ? `Meeting: ${meet.title}` : `Meeting with ${meet.contactName}`,
                                  deadline: meet.dateTime || new Date().toISOString(),
                                  task_type: 'admin_email',
                                  consequence_card: `You miss the scheduled meeting '${meet.title}' with ${meet.contactName}, damaging professional rapport.`,
                                  head_start_artifact: `# Preparation for ${meet.title}\n\n- Write down 3 key discussion points\n- Draft meeting summary template\n- Follow up on previous actions`
                                });
                              }
                            }}
                            className="p-4 bg-stone-900 border border-white/5 rounded-2xl flex items-center gap-4 hover:border-white/10 hover:bg-stone-850 transition-all shadow-sm cursor-pointer"
                          >
                            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white shrink-0">
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.109A3.318 3.318 0 0112 22.5c-1.253 0-2.382-.693-3-1.743a3.318 3.318 0 01-3-3.228v-.109m0-11.25a2.25 2.25 0 114.5 0 2.25 2.25 0 01-4.5 0zm-3 11.25h10.5a2.25 2.25 0 002.25-2.25v-.183a6.75 6.75 0 00-12-3.84v.183a2.25 2.25 0 002.25 2.25z" />
                              </svg>
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="font-semibold text-sm text-white truncate">{meet.title}</h4>
                              <p className="text-[11px] text-stone-450 mt-0.5">With {meet.contactName}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              <span className="text-[9px] font-bold text-[#bcbbc0] bg-white/5 border border-white/5 px-2 py-0.5 rounded-full">
                                {meet.time}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Side: Persistent Docked Donna AI */}
                <div className="hidden md:flex flex-col w-80 shrink-0 border border-white/5 bg-stone-955 rounded-3xl overflow-hidden">
                  <Donna 
                    inline={true} 
                    tasks={tasks}
                    onTaskCreated={handleTaskCreated}
                    onTaskUpdate={handleTaskUpdate}
                    onTaskDelete={handleTaskDelete}
                    onScheduleUpdate={fetchMeetings} 
                    active={activeTab === 'calendar'} 
                    history={donnaHistory}
                    setHistory={setDonnaHistory}
                    hasGreeted={hasGreeted}
                    setHasGreeted={setHasGreeted}
                  />
                </div>
              </div>
            )}

            {/* TAB CONTENT: DONNA AI */}
            {activeTab === 'donna' && (
              <div className="flex-1 flex flex-col h-full min-h-0">
                <Donna 
                  inline={true} 
                  tasks={tasks}
                  onTaskCreated={handleTaskCreated}
                  onTaskUpdate={handleTaskUpdate}
                  onTaskDelete={handleTaskDelete}
                  onScheduleUpdate={fetchMeetings} 
                  active={activeTab === 'donna'} 
                  history={donnaHistory}
                  setHistory={setDonnaHistory}
                  hasGreeted={hasGreeted}
                  setHasGreeted={setHasGreeted}
                />
              </div>
            )}

            {/* MOBILE FLOATING BOTTOM DOCK */}
            <div className="md:hidden absolute bottom-4 left-4 right-4 h-16 bg-stone-900 border border-white/5 rounded-2xl shadow-lg flex justify-around items-center px-4 z-20 shrink-0">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all cursor-pointer ${
                  activeTab === 'dashboard' ? 'text-white font-bold' : 'text-stone-400 hover:text-white'
                }`}
              >
                <span className="text-[9px] font-bold tracking-wider uppercase">Home</span>
              </button>

              <button
                onClick={(() => {
                  setActiveTab('calendar');
                  fetchMeetings();
                })}
                className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all cursor-pointer ${
                  activeTab === 'calendar' ? 'text-white font-bold' : 'text-stone-400 hover:text-white'
                }`}
              >
                <span className="text-[9px] font-bold tracking-wider uppercase">Schedule</span>
              </button>

              <button
                onClick={() => setActiveTab('donna')}
                className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all cursor-pointer ${
                  activeTab === 'donna' ? 'text-white font-bold' : 'text-stone-400 hover:text-white'
                }`}
              >
                <div className="relative">
                  <span className="text-[9px] font-bold tracking-wider uppercase">Donna AI</span>
                  {activeTab !== 'donna' && (
                    <span className="absolute top-0 -right-2 w-1.5 h-1.5 bg-white rounded-full animate-ping"></span>
                  )}
                </div>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Floating Donna Voice Trigger (only active on mobile and outside Donna tab) */}
      {!showSplash && !showOnboarding && activeTab !== 'donna' && (
        <div className="md:hidden">
          <Donna 
            inline={false} 
            tasks={tasks}
            onTaskCreated={handleTaskCreated}
            onTaskUpdate={handleTaskUpdate}
            onTaskDelete={handleTaskDelete}
            onScheduleUpdate={fetchMeetings} 
            active={activeTab !== 'donna'} 
            history={donnaHistory}
            setHistory={setDonnaHistory}
            hasGreeted={hasGreeted}
            setHasGreeted={setHasGreeted}
          />
        </div>
      )}

      {/* Task Detail Slide-in Drawer */}
      {selectedTask && (
        <TaskDetail 
          task={selectedTask}
          now={now}
          onUpdate={handleTaskUpdate}
          onDelete={handleTaskDelete}
          onClose={() => setSelectedTask(null)}
          isFirstTask={tasks.length === 1}
        />
      )}

      {/* Import Daily Schedule Modal Overlay */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-fade-in">
          <div className="w-full max-w-md bg-momentum-card border border-momentum-border rounded-[32px] p-6 shadow-2xl relative">
            <button 
              onClick={() => {
                setShowImportModal(false);
                setImportText('');
              }}
              className="absolute top-5 right-5 text-stone-500 hover:text-white text-xs uppercase tracking-widest font-bold cursor-pointer"
            >
              Close
            </button>

            <span className="text-[9px] text-stone-500 font-bold uppercase tracking-widest block mb-1">Schedule Import</span>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Paste or Upload Day Plan</h3>

            <form onSubmit={handleImportSubmit} className="space-y-4">
              <div>
                <label className="text-[9px] text-stone-500 font-bold uppercase tracking-wider block mb-1.5">
                  Paste Raw Schedule Text
                </label>
                <textarea
                  required
                  rows={6}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder="e.g.&#10;10:00 AM Team Standup&#10;12:00 PM Code Review with Jane&#10;3:30 PM Write slides presentation"
                  className="w-full px-4 py-3 bg-black/60 border border-momentum-border rounded-xl text-xs text-white placeholder:text-stone-500 focus:outline-none focus:border-white/20 leading-relaxed"
                />
              </div>

              <div className="border-t border-white/5 pt-3">
                <label className="text-[9px] text-stone-500 font-bold uppercase tracking-wider block mb-1.5">
                  Or Upload a Schedule File (.txt, .json)
                </label>
                <input 
                  type="file"
                  accept=".txt,.json"
                  onChange={handleFileUpload}
                  className="w-full text-xs text-stone-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:uppercase file:bg-white/5 file:text-white hover:file:bg-white/10 file:cursor-pointer"
                />
              </div>

              <button
                type="submit"
                disabled={isImporting || !importText.trim()}
                className="w-full mt-2 py-3.5 bg-white hover:bg-stone-250 disabled:bg-stone-800 disabled:text-stone-500 text-black font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {isImporting ? 'Processing with Donna...' : 'Process and Schedule'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
