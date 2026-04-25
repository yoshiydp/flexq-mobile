import { useState, useCallback, useRef } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

interface UseVoiceTranscriptionReturn {
  isListening: boolean;
  startListening: () => Promise<void>;
  stopListening: () => void;
}

export function useVoiceTranscription(
  onResult: (text: string) => void,
): UseVoiceTranscriptionReturn {
  const [isListening, setIsListening] = useState(false);
  const interimRef = useRef('');

  useSpeechRecognitionEvent('start', () => {
    setIsListening(true);
    interimRef.current = '';
  });

  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
    interimRef.current = '';
  });

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript ?? '';
    if (event.isFinal) {
      onResult(transcript);
      interimRef.current = '';
    } else {
      interimRef.current = transcript;
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    console.log('[VoiceTranscription] error:', event.error, event.message);
    setIsListening(false);
    interimRef.current = '';
  });

  const startListening = useCallback(async () => {
    const { status } =
      await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    console.log('[VoiceTranscription] permission status:', status);
    if (status !== 'granted') return;

    console.log('[VoiceTranscription] starting...');
    ExpoSpeechRecognitionModule.start({
      lang: 'ja-JP',
      interimResults: false,
      continuous: false,
    });
  }, []);

  const stopListening = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
  }, []);

  return { isListening, startListening, stopListening };
}
