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
      const englishVoices = currentVoices.filter(v => v.lang.startsWith('en') || v.lang.toLowerCase().includes('en'));

      const getVoiceScore = (voice) => {
        const name = voice.name.toLowerCase();
        let score = 0;

        // Strict lists of male vs female names / markers
        const maleKeywords = [
          'alex', 'daniel', 'fred', 'bruce', 'junior', 'ralph', 'albert', 
          'david', 'mark', 'george', 'ravi', 'rishi', 'oliver', 'nathan', 
          'thomas', 'tom', 'male', 'voice 1', 'voice 3'
        ];
        const femaleKeywords = [
          'samantha', 'victoria', 'susan', 'karen', 'moira', 'tessa', 'veena', 
          'fiona', 'serena', 'allison', 'ava', 'sara', 'zira', 'hazel', 'heera', 
          'aria', 'google us english', 'google uk english female', 'female',
          'voice 2', 'voice 4'
        ];

        const isMale = maleKeywords.some(keyword => name.includes(keyword));
        const isFemale = femaleKeywords.some(keyword => name.includes(keyword));

        if (isFemale) {
          score += 1000; // Force female voices to the top
        }
        if (isMale) {
          score -= 1000; // Actively suppress male voices
        }

        // Additional scoring details
        if (name.includes('google us english') || name.includes('google uk english female')) {
          score += 200; 
        } else if (name.includes('victoria')) {
          score += 180; 
        } else if (name.includes('susan')) {
          score += 170; 
        } else if (name.includes('aria') || name.includes('zira')) {
          score += 160; 
        } else if (name.includes('siri') && (name.includes('voice 2') || name.includes('voice 4'))) {
          score += 150; 
        } else if (name.includes('karen') || name.includes('moira') || name.includes('veena') || name.includes('tessa')) {
          score += 120; 
        } else if (name.includes('samantha')) {
          score += 100; 
        } else if (name.includes('google')) {
          score += 85;
        } else if (name.includes('enhanced') || name.includes('premium') || name.includes('natural') || name.includes('neural')) {
          score += 80;
        }

        // Filter out highly robotic/joke fallback voices if possible
        const roboticVoices = ['fred', 'whisper', 'zarvox', 'cellos', 'pipe organ', 'histeria', 'bad news', 'boing', 'bubbles', 'deranged', 'bells'];
        if (roboticVoices.some(v => name.includes(v))) {
          score -= 500;
        }

        if (voice.localService) {
          score += 1;
        }

        return score;
      };

      const scoredVoices = englishVoices.map(voice => ({ voice, score: getVoiceScore(voice) }));
      scoredVoices.sort((a, b) => b.score - a.score);

      if (scoredVoices.length > 0) {
        utterance.voice = scoredVoices[0].voice;
        console.log('Donna selected voice:', scoredVoices[0].voice.name);
      } else if (currentVoices.length > 0) {
        // If no English voices, rank all current voices to find the best female voice in any language
        const allScored = currentVoices.map(voice => ({ voice, score: getVoiceScore(voice) }));
        allScored.sort((a, b) => b.score - a.score);
        utterance.voice = allScored[0].voice;
        console.log('Donna selected fallback voice:', allScored[0].voice.name);
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
