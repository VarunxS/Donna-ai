import { useState, useRef } from 'react';
import { createFullTask } from '../api';

export default function TaskInput({ onTaskCreated }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  // Voice input state
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  // Feature-detect Web Speech API
  const speechSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);

    try {
      const task = await createFullTask(trimmed);
      onTaskCreated(task);
      setInput('');
    } catch (err) {
      setError(err.message || 'Failed to create task');
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const toggleVoice = () => {
    if (!speechSupported) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join('');
      setInput(transcript);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative flex items-center gap-2 bg-momentum-card p-1.5 rounded-2xl border border-momentum-border hover:border-momentum-border-hover transition-all duration-200 shadow-sm">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={loading ? 'Generating structured consequences...' : 'What needs to get done? (e.g. math test today 6:30)'}
            disabled={loading}
            className="w-full pl-4 pr-11 py-3 bg-transparent text-sm text-white placeholder:text-momentum-muted focus:outline-none disabled:opacity-60 font-sans"
            autoFocus
          />

          {/* Voice input button */}
          {speechSupported && (
            <button
              type="button"
              onClick={toggleVoice}
              className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-all cursor-pointer ${
                isListening
                  ? 'text-[#ff453a] bg-red-500/10 animate-pulse'
                  : 'text-momentum-secondary hover:text-white hover:bg-white/5'
              }`}
              title={isListening ? 'Stop listening' : 'Voice input'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4.5 h-4.5">
                <path d="M7 4a3 3 0 0 1 6 0v6a3 3 0 1 1-6 0V4Z" />
                <path d="M5.5 9.643a.75.75 0 0 0-1.5 0V10c0 3.06 2.29 5.585 5.25 5.954V17.5h-1.5a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-1.5v-1.546A6.001 6.001 0 0 0 16 10v-.357a.75.75 0 0 0-1.5 0V10a4.5 4.5 0 0 1-9 0v-.357Z" />
              </svg>
            </button>
          )}
        </div>

        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="px-4.5 py-3 bg-white text-black hover:bg-stone-250 text-xs font-extrabold uppercase tracking-wider rounded-xl transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed shrink-0 cursor-pointer shadow-md"
        >
          {loading ? (
            <svg className="w-4 h-4 animate-spin mx-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            'Add'
          )}
        </button>
      </div>

      {error && (
        <p className="mt-2 ml-1 text-xs font-semibold text-rose-600">{error}</p>
      )}
    </form>
  );
}
