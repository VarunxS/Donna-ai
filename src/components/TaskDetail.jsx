import { useState, useEffect } from 'react';
import { getEscalationState, getTimeRemaining } from '../escalation';
import { generateCriticalNudge, generateForfeitMessage } from '../api';
import { useSpeech } from '../hooks/useSpeech';

const renderFormattedOutline = (text) => {
  if (!text) return null;
  const lines = text.split('\n');
  return (
    <div className="space-y-3 font-sans select-text">
      {lines.map((line, idx) => {
        let cleanLine = line.replace(/\*\*/g, '').trim();
        if (!cleanLine) return null;

        // Check if heading (starts with ## or ### or Session)
        if (cleanLine.startsWith('##') || cleanLine.startsWith('###') || /^session\s*\d+/i.test(cleanLine)) {
          const headingText = cleanLine.replace(/^#+\s*/, '');
          return (
            <h5 key={idx} className="text-[11px] font-black text-white uppercase tracking-wider mt-4 first:mt-0 mb-1.5 border-b border-white/5 pb-1 select-none">
              {headingText}
            </h5>
          );
        }

        // Check if bullet point (starts with *, -, •)
        if (cleanLine.startsWith('*') || cleanLine.startsWith('-') || cleanLine.startsWith('•')) {
          const bulletText = cleanLine.replace(/^[*\-•]\s*/, '');
          return (
            <div key={idx} className="flex items-start gap-2 text-[11px] text-[#bcbbc0] leading-relaxed pl-1">
              <span className="text-orange-500 font-bold shrink-0 mt-0.5">•</span>
              <span>{bulletText}</span>
            </div>
          );
        }

        // Standard paragraph
        return (
          <p key={idx} className="text-[10px] text-stone-400 leading-normal pl-1">
            {cleanLine}
          </p>
        );
      })}
    </div>
  );
};

export default function TaskDetail({ task, onUpdate, onDelete, onClose, now, isFirstTask = false }) {
  const [artifactContent, setArtifactContent] = useState(task.head_start_artifact);
  const [isEditing, setIsEditing] = useState(false);
  const [showCommitment, setShowCommitment] = useState(false);

  // Commitment contract options
  const [strictness, setStrictness] = useState('committed'); // flexible | committed | locked
  const [contactName, setContactName] = useState(() => {
    try {
      const stored = localStorage.getItem('donna_user_profile');
      if (stored) {
        const profile = JSON.parse(stored);
        return profile.accountabilityName || '';
      }
    } catch {}
    return '';
  });
  const [contactEmail, setContactEmail] = useState(() => {
    try {
      const stored = localStorage.getItem('donna_user_profile');
      if (stored) {
        const profile = JSON.parse(stored);
        return profile.accountabilityEmail || '';
      }
    } catch {}
    return '';
  });
  const [userNote, setUserNote] = useState('');
  const [isArming, setIsArming] = useState(false);
  const [hapticStep, setHapticStep] = useState('none'); // none | pressing | confirming

  // Local state for dynamic generation
  const [localCriticalNudge, setLocalCriticalNudge] = useState(task.criticalNudge);
  const [nudgeLoading, setNudgeLoading] = useState(false);
  const [hasAutoSpoken, setHasAutoSpoken] = useState(false);

  // TTS Hook
  const { speak, stop, isSpeaking, supported } = useSpeech();

  const state = getEscalationState(task, now);
  const timeStr = getTimeRemaining(task.deadline, now);

  // Stop speech when modal closes
  useEffect(() => {
    return () => stop();
  }, [stop]);

  // Generate critical nudge dynamically if we hit critical state and don't have one
  useEffect(() => {
    let isMounted = true;
    
    async function loadNudge() {
      if ((state === 'critical' || state === 'overdue') && !task.isComplete) {
        let currentNudge = task.criticalNudge;
        
        if (!currentNudge && !nudgeLoading) {
          setNudgeLoading(true);
          const nudge = await generateCriticalNudge(task);
          if (isMounted) {
            setLocalCriticalNudge(nudge);
            onUpdate(task.id, { criticalNudge: nudge });
            currentNudge = nudge;
            setNudgeLoading(false);
          }
        }
        
        // Auto-speak the nudge if we haven't yet for this session
        if (currentNudge && !hasAutoSpoken && supported && isMounted && !nudgeLoading) {
          setHasAutoSpoken(true);
          speak(currentNudge);
        }
      }
    }
    
    loadNudge();
    return () => { isMounted = false; };
  }, [state, task.criticalNudge, task, nudgeLoading, onUpdate, hasAutoSpoken, supported, speak]);

  // Auto-save artifact edits on blur
  const handleArtifactBlur = () => {
    setIsEditing(false);
    if (artifactContent !== task.head_start_artifact) {
      onUpdate(task.id, { head_start_artifact: artifactContent });
    }
  };

  // Toggle Started state
  const handleToggleStarted = () => {
    onUpdate(task.id, { hasStarted: !task.hasStarted });
  };

  // Mark Done
  const handleMarkDone = () => {
    onUpdate(task.id, { isComplete: true });
    stop();
    onClose();
  };

  // Arm Commitment Contract (Haptic Trigger Wrapper)
  const handleArmCommitmentSubmit = async (e) => {
    e.preventDefault();
    if (strictness !== 'flexible' && (!contactName || !contactEmail)) return;

    if (strictness === 'locked') {
      setHapticStep('pressing');
      setTimeout(() => {
        setHapticStep('confirming');
        setTimeout(() => {
          executeArmCommitment();
          setHapticStep('none');
        }, 1200);
      }, 300);
    } else {
      executeArmCommitment();
    }
  };

  const executeArmCommitment = async () => {
    setIsArming(true);
    let message = '';
    if (strictness !== 'flexible') {
      message = await generateForfeitMessage(task, contactName, userNote);
    }
    
    onUpdate(task.id, {
      commitment: {
        strictness,
        contactName: strictness !== 'flexible' ? contactName : '',
        contactEmail: strictness !== 'flexible' ? contactEmail : '',
        userNote: strictness !== 'flexible' ? userNote : '',
        forfeitMessage: message,
        armedAt: new Date().toISOString()
      }
    });
    
    setIsArming(false);
    setShowCommitment(false);
  };
  
  // Send Forfeit Action
  const handleSendForfeit = () => {
    if (!task.commitment) return;
    
    const subject = encodeURIComponent(`Missed deadline: ${task.title}`);
    const body = encodeURIComponent(task.commitment.forfeitMessage);
    const mailto = `mailto:${task.commitment.contactEmail}?subject=${subject}&body=${body}`;
    
    window.location.href = mailto;
  };

  // TTS Handlers
  const handleReadConsequence = () => {
    if (isSpeaking) {
      stop();
    } else {
      speak(task.consequence_card);
    }
  };

  const handleReadArtifact = () => {
    if (isSpeaking) {
      stop();
    } else {
      speak(artifactContent);
    }
  };
  
  const handleReadNudge = () => {
    const nudge = localCriticalNudge || task.criticalNudge;
    if (nudge) {
      if (isSpeaking) {
        stop();
      } else {
        speak(nudge);
      }
    }
  };

  const getHeaderStateClass = () => {
    if (task.isComplete) return 'text-[#30d158] bg-[#30d158]/10 border-[#30d158]/20';
    switch (state) {
      case 'overdue':
      case 'critical':
        return 'text-[#ff453a] bg-[#ff453a]/10 border-[#ff453a]/20';
      case 'nudge':
        return 'text-[#ff9f0a] bg-[#ff9f0a]/10 border-[#ff9f0a]/20';
      default:
        return 'text-[#bcbbc0] bg-white/5 border-white/10';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-md">
      
      {/* 3D Haptic Overlay for Locked In confirmation */}
      {hapticStep === 'confirming' && (
        <div className="absolute inset-0 bg-black/95 z-55 flex flex-col items-center justify-center animate-fade-in text-center p-6">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#E2C9FF] to-[#8CFFDD] flex items-center justify-center shadow-lg shadow-purple-500/20 mb-6 scale-up-animation">
            <svg className="w-10 h-10 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight uppercase">Locked In</h2>
          <p className="text-sm text-stone-400 mt-2 max-w-[280px] leading-relaxed">
            Deep Focus Activated. The contract forfeit cannot be cancelled.
          </p>
        </div>
      )}

      {/* Main Drawer Modal Container */}
      <div 
        className={`w-full max-w-md bg-stone-900 border-t border-white/10 rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh] transition-transform duration-200 shrink-0 ${
          hapticStep === 'pressing' ? 'scale-95 opacity-80' : 'scale-100 opacity-100 animate-slide-up'
        }`}
      >
        
        {/* Drag Handle Indicator */}
        <div className="w-full flex justify-center py-2 shrink-0">
          <div className="w-12 h-1 bg-stone-800 rounded-full"></div>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 pb-4 pt-1 border-b border-white/5 shrink-0">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${getHeaderStateClass()}`}>
                {task.isComplete ? 'Complete' : state === 'critical' ? 'Critical' : state === 'overdue' ? 'Overdue' : state === 'nudge' ? 'Due Soon' : 'On Track'}
              </span>
            </div>
            <h2 className="text-base font-semibold text-white truncate">{task.title}</h2>
          </div>
          
          <button 
            onClick={() => { stop(); onClose(); }}
            className="p-1.5 text-stone-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 rounded-full transition-all cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5 scrollbar-thin">
          
          {/* Deadline card */}
          <div className="p-4 bg-[#1c1c1e] border border-white/5 shadow-sm rounded-2xl flex items-center justify-between gap-4">
            <div>
              <p className="text-[9px] font-bold text-stone-500 uppercase tracking-widest mb-0.5">Deadline</p>
              <p className={`text-sm font-extrabold ${state === 'critical' || state === 'overdue' ? 'text-[#ff453a]' : 'text-white'}`}>
                {new Date(task.deadline).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </p>
              <p className="text-[10px] text-stone-400 mt-0.5 font-light">({timeStr})</p>
            </div>
            
            <button
              onClick={handleMarkDone}
              className="px-4 py-2.5 bg-white hover:bg-stone-200 text-black font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-md shrink-0 active:scale-98"
            >
              Mark Done
            </button>
          </div>

          {/* Action checklist status */}
          <div className="flex items-center gap-3 px-1">
            <input 
              id="started-check"
              type="checkbox" 
              checked={task.hasStarted}
              onChange={handleToggleStarted}
              className="w-5 h-5 text-white rounded border-white/10 bg-white/5 focus:ring-white focus:ring-offset-black cursor-pointer"
            />
            <label htmlFor="started-check" className="text-xs font-medium text-stone-300 cursor-pointer">
              I have started working on this
            </label>
          </div>

          {/* Critical Nudge */}
          {(state === 'critical' || state === 'overdue') && !task.isComplete && (
            <div className="p-4 bg-red-950/20 border border-red-500/10 rounded-2xl">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[9px] font-extrabold text-[#ff453a] uppercase tracking-wider flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Attention Required
                </h3>
                {supported && (localCriticalNudge || task.criticalNudge) && !nudgeLoading && (
                  <button 
                    onClick={handleReadNudge} 
                    className={`p-1 rounded-lg transition-all cursor-pointer ${isSpeaking ? 'bg-white/10 text-white animate-pulse' : 'text-[#ff453a] hover:bg-white/5'}`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.898a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </svg>
                  </button>
                )}
              </div>
              
              {nudgeLoading ? (
                <div className="h-10 bg-white/5 animate-pulse rounded-lg"></div>
              ) : (
                <p className="text-xs text-[#ff453a] leading-relaxed font-normal">
                  {localCriticalNudge || task.criticalNudge}
                </p>
              )}
            </div>
          )}

          {/* Consequence card (Special highlight for first-task report) */}
          <div 
            className={`p-4 rounded-2xl ${
              isFirstTask 
                ? 'bg-gradient-to-br from-[#E2C9FF] to-[#8CFFDD] text-black shadow-lg shadow-purple-500/10' 
                : 'bg-[#1c1c1e] border border-white/5'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <h4 className={`text-[9px] font-bold uppercase tracking-widest ${isFirstTask ? 'text-black' : 'text-stone-500'}`}>
                {isFirstTask ? 'Focus Report — The Stakes' : 'Failure Consequences'}
              </h4>
              {supported && (
                <button 
                  onClick={handleReadConsequence} 
                  className={`p-1 rounded-lg transition-all cursor-pointer ${
                    isSpeaking 
                      ? 'bg-black/10 text-white' 
                      : isFirstTask ? 'text-black hover:bg-black/5' : 'text-stone-400 hover:text-white'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.898a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                </button>
              )}
            </div>
            <p className={`text-xs leading-relaxed font-normal ${isFirstTask ? 'text-black text-sm font-semibold' : 'text-[#bcbbc0] italic'}`}>
              "{task.consequence_card}"
            </p>
          </div>

          {/* Head Start Outline */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-[9px] font-bold text-stone-500 uppercase tracking-widest">Head-Start Outline</h4>
              <div className="flex items-center gap-2">
                {supported && !isEditing && (
                  <button 
                    onClick={handleReadArtifact} 
                    className="p-1 rounded-lg text-stone-400 hover:text-white cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.898a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </svg>
                  </button>
                )}
                <button 
                  onClick={() => setIsEditing(!isEditing)}
                  className="text-xs font-bold text-white hover:underline cursor-pointer"
                >
                  {isEditing ? 'Save' : 'Edit'}
                </button>
              </div>
            </div>

            {isEditing ? (
              <textarea
                value={artifactContent}
                onChange={(e) => setArtifactContent(e.target.value)}
                onBlur={handleArtifactBlur}
                autoFocus
                className="w-full h-48 p-3 text-xs font-mono text-[#bcbbc0] bg-black/60 border border-white/10 rounded-xl focus:outline-none resize-none shadow-inner"
              />
            ) : (
              <div 
                onClick={() => setIsEditing(true)}
                className="w-full min-h-[8rem] p-4 bg-[#1c1c1e] border border-white/5 rounded-xl cursor-text hover:border-white/10 transition-all leading-relaxed shadow-inner"
              >
                {renderFormattedOutline(artifactContent)}
              </div>
            )}
          </div>

          {/* Commitment Contract */}
          <div className="border-t border-white/5 pt-4">
            {!task.commitment ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-[9px] font-bold text-stone-500 uppercase tracking-widest flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      Accountability Contract
                    </h4>
                    <p className="text-[9px] text-stone-500 mt-0.5">Arm an accountability forfeit to drive focus.</p>
                  </div>
                  {!showCommitment && (
                    <button 
                      onClick={() => setShowCommitment(true)}
                      className="text-xs font-bold px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/5 text-white rounded-xl cursor-pointer transition-colors"
                    >
                      Arm
                    </button>
                  )}
                </div>

                {showCommitment && (
                  <form onSubmit={handleArmCommitmentSubmit} className="mt-3 bg-[#1c1c1e] border border-white/5 p-4 rounded-2xl space-y-3.5 shadow-inner">
                    {/* Opal Strictness Level Choice Selector */}
                    <div className="space-y-1.5">
                      <label className="block text-[9px] font-bold uppercase tracking-wider text-stone-500">Strictness Level</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'flexible', label: 'Flexible', desc: 'No forfeit armed.' },
                          { id: 'committed', label: 'Committed', desc: 'Forfeit armed, editable.' },
                          { id: 'locked', label: 'Locked In 🔒', desc: 'Irreversible contract.' }
                        ].map(level => (
                          <button
                            key={level.id}
                            type="button"
                            onClick={() => setStrictness(level.id)}
                            className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                              strictness === level.id
                                ? 'bg-white text-black border-white'
                                : 'bg-white/5 text-stone-400 border-white/5 hover:bg-white/10'
                            }`}
                            title={level.desc}
                          >
                            <span className="text-[10px] font-bold block">{level.label}</span>
                          </button>
                        ))}
                      </div>
                      <p className="text-[9px] text-stone-450 italic mt-0.5">
                        {strictness === 'flexible' && 'Reminder only. No forfeit email sent to accountability contact.'}
                        {strictness === 'committed' && 'Accountability forfeit armed. You can modify or cancel anytime before the deadline.'}
                        {strictness === 'locked' && '🔒 Deep Focus Lock. Once saved, this contract CANNOT be cancelled or modified.'}
                      </p>
                    </div>

                    {strictness !== 'flexible' && (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[9px] font-bold uppercase tracking-wider text-stone-500 mb-1">Contact Name</label>
                            <input required type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Manager / Partner" className="w-full px-3 py-2 bg-black/60 border border-white/5 rounded-xl text-xs text-white placeholder:text-stone-500 focus:outline-none focus:border-white" />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold uppercase tracking-wider text-stone-500 mb-1">Their Email</label>
                            <input required type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="name@email.com" className="w-full px-3 py-2 bg-black/60 border border-white/5 rounded-xl text-xs text-white placeholder:text-stone-500 focus:outline-none focus:border-white" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[9px] font-bold uppercase tracking-wider text-stone-500 mb-1">Personal Note</label>
                          <input type="text" value={userNote} onChange={(e) => setUserNote(e.target.value)} placeholder="e.g., Hold me to this deadline." className="w-full px-3 py-2 bg-black/60 border border-white/5 rounded-xl text-xs text-white placeholder:text-stone-500 focus:outline-none focus:border-white" />
                        </div>
                      </>
                    )}
                    
                    <div className="flex justify-end gap-2 shrink-0">
                      <button type="button" onClick={() => setShowCommitment(false)} className="px-3.5 py-2 text-xs font-semibold text-stone-500 hover:text-white rounded-xl cursor-pointer">Cancel</button>
                      <button 
                        type="submit" 
                        disabled={isArming || (strictness !== 'flexible' && (!contactName || !contactEmail))} 
                        className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl cursor-pointer transition-all ${
                          strictness === 'locked' 
                            ? 'bg-gradient-to-br from-[#E2C9FF] to-[#8CFFDD] text-black shadow-lg shadow-purple-500/10' 
                            : 'bg-white text-black hover:bg-stone-200'
                        }`}
                      >
                        {isArming ? 'Drafting...' : strictness === 'locked' ? 'Confirm Lock 🔒' : 'Arm Contract'}
                      </button>
                    </div>
                  </form>
                )}
              </>
            ) : (
              <div className={`p-4 rounded-2xl border ${state === 'critical' || state === 'overdue' ? 'bg-red-950/10 border-red-500/15' : 'bg-[#1c1c1e] border-white/5'}`}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[9px] font-bold text-stone-400 uppercase tracking-widest flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Accountability Armed: <span className="font-extrabold capitalize text-white">{task.commitment.strictness || 'Committed'}</span>
                  </h4>
                  <span className="text-[10px] text-stone-500 font-semibold">To: {task.commitment.contactName || 'None'}</span>
                </div>
                
                {task.commitment.strictness !== 'flexible' && (
                  <div className="bg-black/50 border border-white/5 p-3 rounded-xl mb-3 shadow-inner">
                    <p className="text-[10px] text-stone-400 font-serif italic">"{task.commitment.forfeitMessage}"</p>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 mt-2">
                  {task.commitment.strictness === 'committed' && (
                    <button
                      onClick={() => onUpdate(task.id, { commitment: null })}
                      className="text-[10px] text-stone-500 hover:text-white underline cursor-pointer"
                    >
                      Cancel Contract
                    </button>
                  )}
                  {task.commitment.strictness === 'locked' && (
                    <span className="text-[9px] font-bold uppercase tracking-widest text-[#ff453a] flex items-center gap-1">
                      🔒 Irreversible Locked In Active
                    </span>
                  )}
                  {(state === 'critical' || state === 'overdue') && task.commitment.strictness !== 'flexible' ? (
                    <button 
                      onClick={handleSendForfeit}
                      className="px-4 py-2 bg-gradient-to-br from-[#ff453a] to-red-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-md shadow-red-500/10 active:scale-98"
                    >
                      Send Forfeit Email
                    </button>
                  ) : (
                    <p className="text-[9px] text-stone-500 ml-auto">
                      {task.commitment.strictness === 'flexible' ? 'Reminders armed.' : 'Sends automatically in Critical state.'}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
          
        </div>
        
        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/5 bg-black/20 rounded-b-t-none flex justify-between shrink-0">
          {task.commitment?.strictness === 'locked' ? (
            <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500 flex items-center gap-1">
              🔒 Locked (cannot delete)
            </span>
          ) : (
            <button 
              onClick={() => {
                if (window.confirm('Delete this deadline?')) {
                  onDelete(task.id);
                  stop();
                  onClose();
                }
              }}
              className="px-3 py-2 text-xs font-semibold text-stone-500 hover:text-[#ff453a] hover:bg-red-500/5 rounded-xl transition-all cursor-pointer"
            >
              Delete Deadline
            </button>
          )}
          <button 
            onClick={() => { stop(); onClose(); }}
            className="px-6 py-2 bg-white hover:bg-stone-200 border border-white text-black font-extrabold text-xs uppercase tracking-wider rounded-xl cursor-pointer"
          >
            Close
          </button>
        </div>
        
      </div>

      <style>{`
        .scrollbar-thin::-webkit-scrollbar { width: 4px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: #3a3a3c; border-radius: 4px; }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover { background: #48484a; }
        .animate-slide-up { animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-fade-in { animation: fadeIn 0.2s ease-out forwards; }
        .scale-up-animation { animation: scaleUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleUp { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  );
}
