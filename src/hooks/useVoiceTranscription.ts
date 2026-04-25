import { useState, useCallback, useRef, useEffect } from 'react';

interface UseVoiceTranscriptionReturn {
  isListening: boolean;
  startListening: () => Promise<void>;
  stopListening: () => void;
}

// expo-speech-recognition requires a custom native build and is unavailable in Expo Go.
// requireNativeModule throws at module evaluation time if the native module isn't registered,
// so we guard with require() inside try/catch instead of a top-level import.
type SpeechMod = typeof import('expo-speech-recognition');
let SpeechModule: SpeechMod | null = null;
try {
  SpeechModule = require('expo-speech-recognition');
} catch (_) {
  // Running in Expo Go or an environment without the native module
}

export function useVoiceTranscription(
  onResult: (text: string) => void,
): UseVoiceTranscriptionReturn {
  const [isListening, setIsListening] = useState(false);
  const interimRef = useRef('');
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    if (!SpeechModule) return;
    const sub = SpeechModule.ExpoSpeechRecognitionModule.addListener('start', () => {
      setIsListening(true);
      interimRef.current = '';
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!SpeechModule) return;
    const sub = SpeechModule.ExpoSpeechRecognitionModule.addListener('end', () => {
      setIsListening(false);
      interimRef.current = '';
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!SpeechModule) return;
    const sub = SpeechModule.ExpoSpeechRecognitionModule.addListener(
      'result',
      (event: { results: { transcript: string }[]; isFinal: boolean }) => {
        const transcript = event.results[0]?.transcript ?? '';
        if (event.isFinal) {
          onResultRef.current(transcript);
          interimRef.current = '';
        } else {
          interimRef.current = transcript;
        }
      },
    );
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!SpeechModule) return;
    const sub = SpeechModule.ExpoSpeechRecognitionModule.addListener(
      'error',
      (event: { error: string; message: string }) => {
        console.log('[VoiceTranscription] error:', event.error, event.message);
        setIsListening(false);
        interimRef.current = '';
      },
    );
    return () => sub.remove();
  }, []);

  const startListening = useCallback(async () => {
    if (!SpeechModule) return;
    const { status } =
      await SpeechModule.ExpoSpeechRecognitionModule.requestPermissionsAsync();
    console.log('[VoiceTranscription] permission status:', status);
    if (status !== 'granted') return;

    console.log('[VoiceTranscription] starting...');
    SpeechModule.ExpoSpeechRecognitionModule.start({
      lang: 'ja-JP',
      interimResults: false,
      continuous: false,
    });
  }, []);

  const stopListening = useCallback(() => {
    if (!SpeechModule) return;
    SpeechModule.ExpoSpeechRecognitionModule.stop();
  }, []);

  return { isListening, startListening, stopListening };
}
