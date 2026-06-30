import { useState, useCallback, useRef } from 'react';

export function useSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  // Track current utterance so we can cancel it specifically
  const utteranceRef = useRef(null);

  const speak = useCallback((text, onEnd = () => {}) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    // Stop any ongoing speech
    window.speechSynthesis.cancel();
    
    // Slight delay to ensure cancel completes
    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(text);
      utteranceRef.current = utterance;

      // Retrieve fresh voices directly on trigger to ensure full async loading
      const currentVoices = window.speechSynthesis.getVoices() || [];
      const englishVoices = currentVoices.filter(v => v.lang.startsWith('en-') || v.lang.toLowerCase() === 'en');

      const scoredVoices = englishVoices.map(voice => {
        const name = voice.name.toLowerCase();
        let score = 0;

        // Penalize known male voices to guarantee a soft, smart female voice selection
        const maleVoices = ['alex', 'daniel', 'fred', 'bruce', 'junior', 'ralph', 'albert', 'david', 'mark', 'george', 'ravi'];
        if (maleVoices.some(m => name.includes(m))) {
          score -= 150;
        }

        // Specifically target soft, smart female/natural voices for premium presentation
        if (name.includes('google us english') || name.includes('google uk english female')) {
          score += 200; // Smart/soft Google cloud-based voices
        } else if (name.includes('victoria')) {
          score += 180; // Victoria is macOS's softest, most polite female voice
        } else if (name.includes('susan')) {
          score += 170; // Susan is another pleasant, soft macOS female voice
        } else if (name.includes('aria') || name.includes('zira')) {
          score += 160; // Windows premium female voices
        } else if (name.includes('siri') && (name.includes('female') || name.includes('voice 2') || name.includes('voice 3') || name.includes('voice 4'))) {
          score += 150; // Siri female variants
        } else if (name.includes('karen') || name.includes('moira') || name.includes('veena') || name.includes('tessa')) {
          score += 120; // Regional female voices
        } else if (name.includes('samantha')) {
          score += 100; // Samantha is the default clear macOS female voice
        } else if (name.includes('google')) {
          score += 85;
        } else if (name.includes('enhanced') || name.includes('premium') || name.includes('natural') || name.includes('neural')) {
          score += 80;
        } else {
          score += 10;
        }

        // Filter out highly robotic/joke fallback voices if possible
        const roboticVoices = ['fred', 'whisper', 'zarvox', 'cellos', 'pipe organ', 'histeria', 'bad news', 'boing', 'bubbles', 'deranged', 'bells'];
        if (roboticVoices.some(v => name.includes(v))) {
          score -= 60;
        }

        // Slight preference for local service if scores are tied
        if (voice.localService) {
          score += 1;
        }

        return { voice, score };
      });

      scoredVoices.sort((a, b) => b.score - a.score);

      if (scoredVoices.length > 0) {
        utterance.voice = scoredVoices[0].voice;
        console.log('Donna selected voice:', scoredVoices[0].voice.name);
      } else if (currentVoices.length > 0) {
        utterance.voice = currentVoices[0];
        console.log('Donna selected default voice:', currentVoices[0].name);
      }

      utterance.rate = 0.93; // Deliberate and calm pacing
      utterance.pitch = 1.02; // A tiny bit brighter and softer pitch
      
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        onEnd();
      };
      utterance.onerror = (e) => {
        // If canceled intentionally, don't treat it as an error
        if (e.error !== 'canceled') {
          console.error('Speech synthesis error:', e);
        }
        setIsSpeaking(false);
        onEnd();
      };

      window.speechSynthesis.speak(utterance);
    }, 50);
  }, []);

  const stop = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, []);

  return { speak, stop, isSpeaking, supported: typeof window !== 'undefined' && !!window.speechSynthesis };
}
