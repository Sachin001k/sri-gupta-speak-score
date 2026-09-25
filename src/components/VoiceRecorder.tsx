import { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Play, Pause, RotateCcw, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { transcribeWithAssemblyAI, isAssemblyAIAvailable } from "@/services/assemblyAITranscription";

const PREP_SECONDS = 3;

interface RecorderNotice {
  tone: 'error' | 'info';
  title: string;
  description?: string;
}

interface VoiceRecorderProps {
  motion: {
    topic: string;
    category: string;
  };
  duration: number;
  stance?: string;
  onRecordingComplete: (audioBlob: Blob, transcript?: string) => void;
  onBack: () => void;
}

export function VoiceRecorder({ 
  motion, 
  duration, 
  stance, 
  onRecordingComplete, 
  onBack 
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [prepTime, setPrepTime] = useState(PREP_SECONDS);
  const [recordTime, setRecordTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [isCompleted, setIsCompleted] = useState(false);
  const [transcript, setTranscript] = useState<string>("");
  const [showLoader, setShowLoader] = useState(false);
  const [recognitionTranscript, setRecognitionTranscript] = useState<string>("");
  const [currentTranscript, setCurrentTranscript] = useState<string>("");
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);
  const [speechRecognitionSupported, setSpeechRecognitionSupported] = useState(false);
  const [permissionChecked, setPermissionChecked] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [usingAssemblyAIFallback, setUsingAssemblyAIFallback] = useState(false);
  const [showTranscribeButton, setShowTranscribeButton] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recorderNotice, setRecorderNotice] = useState<RecorderNotice | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prepTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordTimerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptRef = useRef("");
  const recognitionTranscriptRef = useRef("");
  const currentTranscriptRef = useRef("");
  const isRecordingRef = useRef(false);
  const recognitionStateRef = useRef<'idle' | 'starting' | 'listening' | 'stopping'>('idle');
  const processedFinalChunksRef = useRef<Set<string>>(new Set()); // Track processed final chunks to avoid duplicates
  const STORAGE_KEY = `dialecta_transcript_${motion.topic}_${stance || 'neutral'}`;

  const showRecorderNotice = (tone: RecorderNotice['tone'], title: string, description?: string) => {
    setRecorderNotice({ tone, title, description });
  };

  const showErrorNotice = (title: string, description?: string) =>
    showRecorderNotice('error', title, description);

  const showInfoNotice = (title: string, description?: string) =>
    showRecorderNotice('info', title, description);

  const dismissRecorderNotice = () => setRecorderNotice(null);

  const updateTranscript = (value: string) => {
    transcriptRef.current = value;
    setTranscript(value);
  };

  const updateRecognitionTranscript = (value: string) => {
    recognitionTranscriptRef.current = value;
    setRecognitionTranscript(value);
  };

  const updateCurrentTranscript = (value: string) => {
    currentTranscriptRef.current = value;
    setCurrentTranscript(value);
  };

  const safeStartRecognition = (reason: string): boolean => {
    if (!speechRecognitionSupported || !recognition) return false;
    if (recognitionStateRef.current === 'starting' || recognitionStateRef.current === 'listening') return true;
    if (recognitionStateRef.current === 'stopping') return false;

    try {
      recognitionStateRef.current = 'starting';
      recognition.start();
      console.log(`✅ Speech recognition start requested (${reason})`);
      return true;
    } catch (error: any) {
      if (error?.name === 'InvalidStateError' || String(error?.message || '').includes('already started')) {
        console.log(`ℹ️ Speech recognition already started (${reason})`);
        recognitionStateRef.current = 'listening';
        return true;
      }
      recognitionStateRef.current = 'idle';
      throw error;
    }
  };

  const safeStopRecognition = (reason: string): void => {
    if (!recognition) return;
    if (recognitionStateRef.current === 'idle' || recognitionStateRef.current === 'stopping') return;

    try {
      recognitionStateRef.current = 'stopping';
      recognition.stop();
      console.log(`🛑 Speech recognition stop requested (${reason})`);
    } catch {
      recognitionStateRef.current = 'idle';
    }
  };

  // Utility function to remove consecutive duplicate words
  const removeConsecutiveDuplicates = (text: string): string => {
    if (!text || typeof text !== 'string') return text || '';
    if (text.trim().length === 0) return text;

    try {
      const words = text.split(/\s+/);
      const result: string[] = [];
      let lastWord = '';

      for (const word of words) {
        const trimmedWord = word.trim().toLowerCase();
        if (trimmedWord && trimmedWord !== lastWord) {
          result.push(word);
          lastWord = trimmedWord;
        }
      }
      const cleaned = result.join(' ');
      return cleaned.length > 0 ? cleaned : text;
    } catch (error) {
      console.warn('Error removing consecutive duplicates:', error);
      return text;
    }
  };

  const joinTranscript = (...parts: string[]) => {
    const joined = parts
      .map(part => part?.trim())
      .filter(Boolean)
      .join(" ");
    return removeConsecutiveDuplicates(joined);
  };
  
  // Check browser support for speech recognition
  useEffect(() => {
    const isSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    setSpeechRecognitionSupported(isSupported);
    
    if (!isSupported) {
      console.warn('Browser speech recognition not supported - will use AssemblyAI fallback');
      // Always set fallback if webkit is not available
      setUsingAssemblyAIFallback(true);
      // Check AssemblyAI availability
      const assemblyAIAvailable = isAssemblyAIAvailable();
      if (assemblyAIAvailable) {
        showInfoNotice(
          "Using AssemblyAI Transcription",
          "Your browser doesn't support native speech recognition. Audio will be transcribed using AssemblyAI after recording."
        );
      } else {
        showInfoNotice(
          "Transcription Limited",
          "Your browser doesn't support speech recognition. Audio will be recorded but transcription may not be available."
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize Speech Recognition - matching VoiceAssistant pattern
  useEffect(() => {
    let recognitionInstance: any = null;

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionInstance = new SpeechRecognition();
      
      recognitionInstance.continuous = true;
      recognitionInstance.interimResults = true;
      recognitionInstance.lang = 'en-US';
      
      recognitionInstance.onstart = () => {
        setIsListening(true);
        updateCurrentTranscript("");
        console.log('✅ Speech recognition started successfully');
        recognitionStateRef.current = 'listening';
        setPermissionChecked(true);
      };
      
      recognitionInstance.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result && result[0]) {
            const transcriptChunk = result[0].transcript;
            if (result.isFinal) {
              finalTranscript += transcriptChunk + ' ';
            } else {
              interimTranscript += transcriptChunk;
            }
          }
        }
        
        // Update current interim transcript (with deduplication)
        if (interimTranscript) {
          const cleanedInterim = removeConsecutiveDuplicates(interimTranscript);
          updateCurrentTranscript(cleanedInterim);
        }
        
        // Process final results (with deduplication and duplicate check)
        if (finalTranscript.trim()) {
          const newFinalText = removeConsecutiveDuplicates(finalTranscript.trim());
          
          // Check if we've already processed this exact chunk
          if (!processedFinalChunksRef.current.has(newFinalText)) {
            processedFinalChunksRef.current.add(newFinalText);
            const accumulatedFinal = joinTranscript(recognitionTranscriptRef.current, newFinalText);
            updateRecognitionTranscript(accumulatedFinal);
            console.log('✅ Final transcript chunk captured:', newFinalText);
            console.log('📝 Accumulated final transcript:', accumulatedFinal);
            
            // Update localStorage
            try {
              localStorage.setItem(STORAGE_KEY, accumulatedFinal);
            } catch (e) {
              console.warn('Failed to save transcript to localStorage:', e);
            }
          }
        }
        
        // Update display transcript (final + interim) with deduplication
        const displayValue = interimTranscript
          ? removeConsecutiveDuplicates(joinTranscript(recognitionTranscriptRef.current, interimTranscript))
          : recognitionTranscriptRef.current;
        updateTranscript(displayValue);
      };
      
      recognitionInstance.onerror = (event: any) => {
        if (event.error === 'no-speech') {
          // Common during pauses; don't surface as an error.
          console.log('Speech recognition: no-speech (pause/quiet)');
          return;
        }

        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          console.error('Microphone permission denied for speech recognition');
          setUsingAssemblyAIFallback(true); // Use AssemblyAI as fallback
          showInfoNotice(
            "Using AssemblyAI Fallback",
            "Microphone permission denied for live transcription. Audio will be transcribed after recording."
          );
          setPermissionChecked(true);
        } else if (event.error === 'aborted') {
          console.log('Speech recognition aborted');
          // If aborted and we don't have transcript, use AssemblyAI
          if (!recognitionTranscriptRef.current.trim()) {
            setUsingAssemblyAIFallback(true);
          }
        } else if (event.error === 'network') {
          setUsingAssemblyAIFallback(true); // Use AssemblyAI as fallback
          showInfoNotice(
            "Using AssemblyAI Fallback",
            "Network error with speech recognition. Audio will be transcribed after recording."
          );
        } else if (event.error === 'service-not-allowed') {
          setUsingAssemblyAIFallback(true); // Use AssemblyAI as fallback
          showInfoNotice(
            "Using AssemblyAI Fallback",
            "Speech recognition service not available. Audio will be transcribed after recording."
          );
        } else {
          console.error('Speech recognition error:', event.error);
          // For other errors, enable AssemblyAI fallback
          setUsingAssemblyAIFallback(true);
          showInfoNotice(
            "Using AssemblyAI Fallback",
            `Speech recognition error: ${event.error}. Audio will be transcribed after recording.`
          );
        }
      };
      
      recognitionInstance.onend = () => {
        setIsListening(false);
        updateCurrentTranscript("");
        recognitionStateRef.current = 'idle';
        const finalTranscript = removeConsecutiveDuplicates(recognitionTranscriptRef.current.trim());
        if (finalTranscript) {
          updateTranscript(finalTranscript);
          console.log('✅ Speech recognition ended. Final transcript:', finalTranscript.substring(0, 100));
          
          // Update localStorage
          try {
            localStorage.setItem(STORAGE_KEY, finalTranscript);
          } catch (e) {
            console.warn('Failed to save transcript to localStorage:', e);
          }
        }
        console.log('Speech recognition ended');
        
        // Auto-restart if we're still recording (to handle browser auto-stop)
        if (isRecordingRef.current && recognitionInstance) {
          try {
            setTimeout(() => {
              if (isRecordingRef.current && recognitionInstance) {
                if (recognitionStateRef.current === 'idle') {
                  try {
                    recognitionStateRef.current = 'starting';
                    recognitionInstance.start();
                    console.log('🔄 Auto-restarted speech recognition');
                  } catch (e) {
                    recognitionStateRef.current = 'idle';
                    console.log('Could not auto-restart recognition:', e);
                  }
                }
              }
            }, 100);
          } catch (e) {
            console.log('Could not auto-restart recognition:', e);
          }
        }
      };
      setRecognition(recognitionInstance);
    }
    
    return () => {
      if (recognitionInstance) {
        try {
          recognitionInstance.stop();
        } catch (e) {
          // Ignore errors on cleanup
        }
      }
    };
  }, []);

  // Handle transcription button click
  const handleTranscribe = async () => {
    if (!audioBlob) {
      showErrorNotice(
        "No Audio",
        "Please record audio first."
      );
      return;
    }

    try {
      console.log('🔄 Starting transcription with AssemblyAI...');
      setIsTranscribing(true);
      setShowTranscribeButton(false);
      updateTranscript("Transcribing audio with AssemblyAI... Please wait.");
      
      const transcript = await transcribeWithAssemblyAI(audioBlob);
      
      if (transcript && transcript.trim().length > 0) {
        const cleanedTranscript = removeConsecutiveDuplicates(transcript.trim());
        updateTranscript(cleanedTranscript);
        updateRecognitionTranscript(cleanedTranscript);
        console.log('✅ AssemblyAI transcription successful, length:', cleanedTranscript.length);
        showInfoNotice("Transcription Complete", "Your speech has been transcribed successfully.");
        
        // Update localStorage
        try {
          localStorage.setItem(STORAGE_KEY, cleanedTranscript);
        } catch (e) {
          console.warn('Failed to save transcript to localStorage:', e);
        }
      } else {
        throw new Error('No transcript returned from AssemblyAI');
      }
    } catch (error: any) {
      console.error('❌ AssemblyAI transcription failed:', error);
      const errorMessage = error?.message || 'Unknown error';
      updateTranscript("Transcription failed. Please try again.");
      showErrorNotice("Transcription Failed", `Could not transcribe audio: ${errorMessage}`);
      setShowTranscribeButton(true); // Show button again to retry
    } finally {
      setIsTranscribing(false);
    }
  };

  // Request speech recognition permission explicitly
  const requestSpeechRecognitionPermission = async (): Promise<boolean> => {
    if (!speechRecognitionSupported || !recognition) {
      return false;
    }

    try {
      // Try to start recognition briefly to trigger permission request
      // This must be done in response to user gesture
      safeStartRecognition('permission-check');
      // Immediately stop it - we just want to trigger the permission prompt
      await new Promise(resolve => setTimeout(resolve, 100));
      safeStopRecognition('permission-check');
      return true;
    } catch (error: any) {
      console.log('Speech recognition permission check:', error);
      // If it's a permission error, we'll handle it in onerror
      if (error.name === 'NotAllowedError' || error.message?.includes('not-allowed')) {
        showErrorNotice(
          "Speech Recognition Permission Required",
          "Please allow microphone access for speech transcription. Your browser will ask for permission."
        );
        return false;
      }
      // Other errors might be okay (like already started)
      return true;
    }
  };

  const startPrep = async () => {
    try {
      // Clear processed chunks and localStorage for new session
      processedFinalChunksRef.current.clear();
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        console.warn('Failed to clear localStorage:', e);
      }
      
      console.log('Requesting microphone access for recording...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('✅ Microphone access granted for recording, stream active:', stream.active);
      
      // Don’t do a separate start/stop permission probe here: it can race with the real
      // transcription start and trigger `InvalidStateError: recognition has already started`.
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      console.log('MediaRecorder created, state:', mediaRecorder.state);

      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        console.log('MediaRecorder data available, size:', e.data.size);
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      mediaRecorder.onstart = () => {
        console.log('MediaRecorder started successfully');
      };

      mediaRecorder.onstop = async () => {
        console.log('MediaRecorder stopped, chunks collected:', chunks.length);
        
        if (chunks.length === 0) {
          console.error('No audio data was recorded!');
          return;
        }
        
        const blob = new Blob(chunks, { type: 'audio/webm' });
        console.log('Audio blob created, size:', blob.size);
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setIsCompleted(true);
        setIsProcessing(true); // Show loader while processing
        stream.getTracks().forEach(track => track.stop());
        
        // Wait a bit more to ensure final results are captured
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Stop speech recognition and wait for it to finish
        if (recognition && isListening) {
          try {
            safeStopRecognition('recording-stop');
            // Wait for onend to fire
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (e) {
            console.log('Recognition already stopped');
          }
        }
        
        // Get the final transcript - use recognitionTranscript which has all final results
        let finalTranscript = removeConsecutiveDuplicates(recognitionTranscriptRef.current.trim());
        
        // If recognitionTranscript is empty, try transcript state
        if (!finalTranscript || finalTranscript.length === 0) {
          finalTranscript = removeConsecutiveDuplicates(transcriptRef.current.trim());
        }
        
        // Remove any error messages from transcript before checking
        const cleanTranscript = finalTranscript
          .replace(/Please speak clearly\. No transcript was captured\./g, '')
          .replace(/No transcript was captured/g, '')
          .trim();
        
        console.log('🔍 Transcript Debug:');
        console.log('  recognitionTranscript:', recognitionTranscriptRef.current);
        console.log('  transcript state:', transcriptRef.current);
        console.log('  currentTranscript:', currentTranscriptRef.current);
        console.log('  cleanTranscript:', cleanTranscript);
        
        // If we have a transcript from browser speech recognition, use it
        if (cleanTranscript && cleanTranscript.length > 0) {
          updateTranscript(cleanTranscript);
          console.log('✅ Browser transcript captured successfully:', cleanTranscript.substring(0, 100));
          setIsProcessing(false); // Stop loader
        } else if (recognitionTranscriptRef.current.trim().length > 0) {
          // Double check - if recognitionTranscript has content, use it
          updateTranscript(recognitionTranscriptRef.current.trim());
          console.log('✅ Using recognitionTranscript:', recognitionTranscriptRef.current.trim().substring(0, 100));
          setIsProcessing(false); // Stop loader
        } else if (transcriptRef.current.trim().length > 0 && !transcriptRef.current.includes("No transcript")) {
          // Triple check - if current transcript state has content, use it
          updateTranscript(transcriptRef.current.trim());
          console.log('✅ Using current transcript state:', transcriptRef.current.trim().substring(0, 100));
          setIsProcessing(false); // Stop loader
        } else {
          // Webkit speech recognition FAILED (no transcript) - show transcribe button to use AssemblyAI
          // Only show button if webkit was attempted (supported) but failed, OR if webkit is not supported
          const webkitWasAttempted = speechRecognitionSupported && (recognition || isListening);
          const webkitNotSupported = !speechRecognitionSupported;
          
          if (webkitWasAttempted || webkitNotSupported) {
            console.log('📝 Webkit speech recognition failed or not supported, showing transcribe button for AssemblyAI');
            setShowTranscribeButton(true);
            setUsingAssemblyAIFallback(true);
            updateTranscript(""); // Clear any error messages
          } else {
            console.log('⚠️ No transcript but webkit status unclear');
            updateTranscript("No transcript captured. Please try recording again.");
          }
          setIsProcessing(false); // Stop loader
        }
      };

      // Start speech recognition when recording starts
      if (recognition && !isListening && speechRecognitionSupported) {
        try {
          updateRecognitionTranscript("");
          updateTranscript("");
          updateCurrentTranscript("");
          // Don’t start here; we start once right when recording begins (after prep)
          // to avoid double-start races (`InvalidStateError: recognition has already started`).
        } catch (error: any) {
          console.error('Speech recognition start error:', error);
          if (error.name === 'NotAllowedError' || error.message?.includes('not-allowed')) {
            showErrorNotice(
              "Transcription Permission Denied",
              "Microphone permission for transcription was denied. Audio will be recorded, but transcription may not work. Please allow microphone access in your browser settings."
            );
            // Will use AssemblyAI fallback after recording
            if (isAssemblyAIAvailable()) {
              setUsingAssemblyAIFallback(true);
              console.log('🔄 Will use AssemblyAI fallback for transcription');
            }
          } else {
            // Avoid restart loops; fall back to AssemblyAI if available.
            if (isAssemblyAIAvailable()) setUsingAssemblyAIFallback(true);
          }
        }
      } else if (!speechRecognitionSupported) {
        // Will use AssemblyAI fallback after recording
        if (isAssemblyAIAvailable()) {
          setUsingAssemblyAIFallback(true);
          console.log('🔄 Will use AssemblyAI fallback for transcription');
        } else {
          showInfoNotice(
            "Transcription Not Available",
            "Speech recognition is not supported in your browser. Audio will be recorded but transcription may not be available."
          );
        }
      }

      setIsPreparing(true);
      setPrepTime(PREP_SECONDS);

      prepTimerRef.current = setInterval(() => {
        setPrepTime(prev => {
          if (prev <= 1) {
            setIsPreparing(false);
            setIsRecording(true);
            isRecordingRef.current = true;
            setRecordTime(0);
            
            // Ensure speech recognition is running before starting media recorder
            if (recognition && speechRecognitionSupported) {
              try {
                safeStartRecognition('recording-start');
              } catch (e) {
                console.log('Recognition start error:', e);
                if (isAssemblyAIAvailable()) setUsingAssemblyAIFallback(true);
              }
            }
            // Note: AssemblyAI will be used after recording stops if needed
            
            mediaRecorder.start();
            
            recordTimerRef.current = setInterval(() => {
              setRecordTime(prev => {
                if (prev >= duration - 1) {
                  console.log('Recording time completed, stopping...');
                  mediaRecorder.stop();
                  setIsRecording(false);
                  isRecordingRef.current = false;
                  // Don't stop speech recognition here - let onstop handler do it
                  return duration;
                }
                return prev + 1;
              });
            }, 1000);

            if (prepTimerRef.current) clearInterval(prepTimerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (error: any) {
      console.error('Error accessing microphone:', error);
      let errorMessage = "Please allow microphone access to record your speech.";
      
      if (error.name === 'NotAllowedError' || error.message?.includes('not-allowed')) {
        errorMessage = "Microphone permission was denied. Please click the microphone icon in your browser's address bar and allow access, then try again.";
      } else if (error.name === 'NotFoundError') {
        errorMessage = "No microphone found. Please connect a microphone and try again.";
      } else if (error.name === 'NotReadableError') {
        errorMessage = "Microphone is being used by another application. Please close other apps using the microphone and try again.";
      }
      
      showErrorNotice("Microphone Access Required", errorMessage);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      isRecordingRef.current = false;
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      // Speech recognition will be stopped in the onstop handler
    }
  };

  const playAudio = async () => {
    if (!audioRef.current || !audioUrl) {
      showErrorNotice("No audio available", "Please record audio first.");
      return;
    }

    try {
      if (isPlaying) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        setIsPlaying(false);
      } else {
        // Ensure audio is loaded
        if (audioRef.current.readyState < 2) {
          await new Promise((resolve) => {
            audioRef.current!.onloadeddata = resolve;
          });
        }
        
        await audioRef.current.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Audio playback error:', error);
      showErrorNotice("Playback failed", "Could not play audio. Try recording again.");
    }
  };

  const reset = () => {
    setIsRecording(false);
    isRecordingRef.current = false;
    setIsPreparing(false);
    setPrepTime(PREP_SECONDS);
    setRecordTime(0);
    setIsPlaying(false);
    setAudioBlob(null);
    setAudioUrl("");
    setIsCompleted(false);
    setShowLoader(false);
    setIsProcessing(false);
    setIsTranscribing(false);
    updateTranscript("");
    updateRecognitionTranscript("");
    updateCurrentTranscript("");
    setShowTranscribeButton(false);
    
    // Clear processed chunks and localStorage
    processedFinalChunksRef.current.clear();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to clear localStorage:', e);
    }
    
    if (prepTimerRef.current) clearInterval(prepTimerRef.current);
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    if (audioRef.current) audioRef.current.pause();
  };

  // Removed startTranscription - now handled directly in onstop

  const submitRecording = async () => {
    if (audioBlob) {
      setShowLoader(true);
      
      // If still transcribing, wait a bit and try to get the transcript
      if (isTranscribing) {
        showInfoNotice(
          "Please Wait",
          "Transcription is still in progress. Please wait a moment..."
        );
        
        // Wait up to 10 seconds for transcription to complete
        let waitCount = 0;
        while (isTranscribing && waitCount < 20) {
          await new Promise(resolve => setTimeout(resolve, 500));
          waitCount++;
        }
      }
      
      // Use the best available transcript - prioritize recognitionTranscript (final results)
      let finalTranscript = recognitionTranscriptRef.current.trim();
      
      // Fallback to transcript state if recognitionTranscript is empty
      if (!finalTranscript || finalTranscript.length === 0) {
        finalTranscript = transcriptRef.current.trim();
      }
      
      // Clean any error messages from transcript and remove duplicates
      const cleanedForSubmit = removeConsecutiveDuplicates(
        finalTranscript
          .replace(/Please speak clearly\. No transcript was captured\./g, '')
          .replace(/No transcript was captured/g, '')
          .replace(/please speak clearly/gi, '')
          .replace(/Transcribing audio\.\.\. Please wait\./g, '')
          .replace(/Transcription.*?\./g, '')
          .trim()
      );
      
      console.log('📤 Submitting recording:');
      console.log('  Original transcript:', finalTranscript.substring(0, 100));
      console.log('  Cleaned transcript:', cleanedForSubmit.substring(0, 100));
      console.log('  Is transcribing:', isTranscribing);
      
      // Only submit if we have a valid transcript (not error message)
      if (cleanedForSubmit && cleanedForSubmit.length > 0) {
        onRecordingComplete(audioBlob, cleanedForSubmit);
      } else {
        console.warn('⚠️ No valid transcript to submit - will show error');
        onRecordingComplete(audioBlob, undefined);
      }
    }
  };

  useEffect(() => {
    return () => {
      if (prepTimerRef.current) clearInterval(prepTimerRef.current);
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    };
  }, []);

  const getProgressPercentage = () => {
    if (isPreparing) return ((PREP_SECONDS - prepTime) / PREP_SECONDS) * 100;
    if (isRecording || isCompleted) return (recordTime / duration) * 100;
    return 0;
  };

  const getStatusText = () => {
    if (isPreparing) return `Get ready... ${prepTime}s`;
    if (isRecording) return `Recording... ${duration - recordTime}s left`;
    if (isCompleted) return "Recording complete!";
    return "Ready to record";
  };

  const trimmedTranscript = transcript.trim();
  const trimmedCurrentTranscript = currentTranscript.trim();
  const displayTranscript = trimmedTranscript.length > 0 ? transcript : currentTranscript;
  const hasTranscript = trimmedTranscript.length > 0 || trimmedCurrentTranscript.length > 0;

  return (
    <Card className="w-full max-w-md mx-auto bg-gradient-to-br from-speech-card to-speech-card/90 border-0 shadow-speech">
      <CardHeader className="pb-4">
        <div className="text-center space-y-2">
          <CardTitle className="text-lg font-bold text-foreground">
            {motion.topic}
          </CardTitle>
          {stance && (
            <div className="inline-block px-3 py-1 bg-primary text-primary-foreground rounded-full text-sm font-medium">
              Arguing {stance === "for" ? "FOR" : "AGAINST"}
            </div>
          )}
          <div className="text-sm text-muted-foreground">
            {duration} seconds • {motion.category}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {recorderNotice && (
          <div
            className={`rounded-2xl border p-4 ${
              recorderNotice.tone === 'error'
                ? 'border-destructive/40 bg-destructive/10 text-destructive-foreground'
                : 'border-primary/30 bg-primary/10 text-primary'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold">{recorderNotice.title}</p>
                {recorderNotice.description && (
                  <p className="text-sm opacity-80 mt-1">
                    {recorderNotice.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={dismissRecorderNotice}
                className="text-sm font-medium opacity-75 hover:opacity-100"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{getStatusText()}</span>
            <span className="text-muted-foreground">
              {isRecording || isCompleted ? `${recordTime}s` : ""}
            </span>
          </div>
          <Progress 
            value={getProgressPercentage()} 
            className="h-2"
          />
        </div>

        {/* Recording Visual */}
        <div className="flex justify-center">
          <div className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${
            isRecording 
              ? "bg-destructive animate-pulse shadow-glow" 
              : isPreparing 
                ? "bg-warning animate-pulse" 
                : isCompleted
                  ? "bg-success"
                  : "bg-muted"
          }`}>
            {isCompleted ? (
              <CheckCircle className="w-10 h-10 text-success-foreground" />
            ) : (
              <Mic className={`w-10 h-10 ${
                isRecording || isPreparing ? "text-white" : "text-muted-foreground"
              }`} />
            )}
          </div>
        </div>

        {/* Transcript Display */}
        {(hasTranscript || isTranscribing) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">
                {isTranscribing 
                  ? "Transcribing..." 
                  : isCompleted 
                    ? "Transcript" 
                    : "Live transcript"}
              </span>
              {!isCompleted && !isTranscribing && (
                <span className="text-xs text-muted-foreground">
                  {usingAssemblyAIFallback ? "Will transcribe with AssemblyAI after recording" : "Updating in real time"}
                </span>
              )}
              {isTranscribing && (
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              )}
            </div>
            <div
              className="p-3 bg-speech-card rounded-lg border border-border text-sm text-foreground max-h-40 overflow-y-auto whitespace-pre-wrap"
              role="status"
              aria-live="polite"
            >
              {isTranscribing ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Transcribing your speech using AssemblyAI...</span>
                </div>
              ) : (
                displayTranscript
              )}
            </div>
            {showTranscribeButton && !isTranscribing && (
              <p className="text-xs text-muted-foreground">
                ℹ️ Click "Transcribe" button to transcribe your audio using AssemblyAI
              </p>
            )}
            {usingAssemblyAIFallback && !isTranscribing && !showTranscribeButton && (
              <p className="text-xs text-muted-foreground">
                ℹ️ Using AssemblyAI for transcription (browser speech recognition not available)
              </p>
            )}
          </div>
        )}

        {/* Controls */}
        <div className="space-y-3">
          {!isCompleted && !isRecording && !isPreparing && (
            <Button
              onClick={startPrep}
              className="w-full bg-gradient-primary hover:opacity-90 border-0 text-white font-semibold py-3 h-12"
            >
              <Mic className="w-4 h-4 mr-2" />
              Start Recording
            </Button>
          )}

          {isRecording && (
            <Button
              onClick={stopRecording}
              variant="destructive"
              className="w-full font-semibold py-3 h-12"
            >
              <MicOff className="w-4 h-4 mr-2" />
              Stop Recording
            </Button>
          )}

          {isCompleted && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={playAudio}
                  variant="outline"
                  className="font-medium"
                >
                  {isPlaying ? <Pause className="w-4 h-4 mr-1" /> : <Play className="w-4 h-4 mr-1" />}
                  {isPlaying ? "Pause" : "Play"}
                </Button>
                <Button
                  onClick={reset}
                  variant="outline"
                  className="font-medium"
                >
                  <RotateCcw className="w-4 h-4 mr-1" />
                  Retry
                </Button>
              </div>
              
              {/* Show loader while processing after recording */}
              {isProcessing && (
                <Button
                  disabled
                  className="w-full bg-gradient-primary hover:opacity-90 border-0 text-white font-semibold py-3 h-12"
                >
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </Button>
              )}
              
              {/* Show Transcribe button if no transcript and not currently transcribing or processing */}
              {!isProcessing && showTranscribeButton && !isTranscribing && (
                <Button
                  onClick={handleTranscribe}
                  className="w-full bg-gradient-primary hover:opacity-90 border-0 text-white font-semibold py-3 h-12"
                >
                  <Mic className="w-4 h-4 mr-2" />
                  Transcribe
                </Button>
              )}
              
              {/* Show loader while transcribing */}
              {!isProcessing && isTranscribing && (
                <Button
                  disabled
                  className="w-full bg-gradient-primary hover:opacity-90 border-0 text-white font-semibold py-3 h-12"
                >
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Transcribing...
                </Button>
              )}
              
              {/* Show Get My Score button only if we have a transcript and not processing */}
              {!isProcessing && !showTranscribeButton && !isTranscribing && transcript.trim().length > 0 && (
                !showLoader ? (
                  <Button
                    onClick={submitRecording}
                    className="w-full bg-gradient-success hover:opacity-90 border-0 text-white font-semibold py-3 h-12"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Get My Score
                  </Button>
                ) : (
                  <Button
                    disabled
                    className="w-full bg-gradient-success hover:opacity-90 border-0 text-white font-semibold py-3 h-12"
                  >
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing...
                  </Button>
                )
              )}
            </div>
          )}

          <Button
            onClick={onBack}
            variant="ghost"
            className="w-full"
            disabled={isRecording || isPreparing}
          >
            Back to Topics
          </Button>
        </div>

        {/* Hidden Audio Element */}
        {audioUrl && (
          <audio
            ref={audioRef}
            src={audioUrl}
            onEnded={() => setIsPlaying(false)}
            onError={(e) => {
              console.error('Audio element error:', e);
              showErrorNotice("Audio error", "Error loading audio file.");
            }}
            className="hidden"
          />
        )}
      </CardContent>
    </Card>
  );
}
