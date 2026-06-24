import { useState, useRef, useCallback } from "react";

// Add SpeechRecognition types
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export function useMediaRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingType, setRecordingType] = useState<"audio" | "video" | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcript, setTranscript] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);

  const startRecording = useCallback(async (type: "audio" | "video") => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === "video"
      });

      const mimeTypes = type === "video" 
        ? ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
        : ['audio/webm', 'audio/mp4', 'audio/ogg'];
        
      let selectedMimeType = "";
      for (const t of mimeTypes) {
        if (MediaRecorder.isTypeSupported(t)) {
          selectedMimeType = t;
          break;
        }
      }

      const options = selectedMimeType ? { mimeType: selectedMimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      setTranscript("");
      setRecordingType(type);
      setIsRecording(true);
      setRecordingTime(0);
      setPreviewStream(stream);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      // Use 250ms timeslice so we collect data frequently
      mediaRecorder.start(250);

      timerRef.current = window.setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);

      // Start client-side speech recognition
      if (type === "audio") {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = navigator.language || "ru-RU";
          
          recognition.onresult = (event: any) => {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
              }
            }
            if (finalTranscript) {
              setTranscript((prev) => prev + " " + finalTranscript.trim());
            }
          };
          
          recognition.start();
          recognitionRef.current = recognition;
        }
      }
    } catch (err) {
      console.error("Failed to start recording:", err);
      setIsRecording(false);
      setRecordingType(null);
    }
  }, []);

  const stopRecording = useCallback((): Promise<{ file: File; transcript?: string } | null> => {
    return new Promise((resolve) => {
      try {
        const recorder = mediaRecorderRef.current;
        if (!recorder || recorder.state === "inactive") {
          resolve(null);
          return;
        }

        let isResolved = false;
        const doResolve = () => {
          if (isResolved) return;
          isResolved = true;

          const actualMimeType = recorder.mimeType || (recordingType === "video" ? "video/webm" : "audio/webm");
          const blob = new Blob(chunksRef.current, { type: actualMimeType });
          const ext = actualMimeType.includes("mp4") ? "mp4" : "webm";
          const filename = `${recordingType}_${Date.now()}.${ext}`;
          const file = new File([blob], filename, { type: actualMimeType });
          
          const finalTranscript = transcript.trim();

          try { recorder.stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
          
          setIsRecording(false);
          setRecordingType(null);
          setPreviewStream(null);
          if (timerRef.current) clearInterval(timerRef.current);

          if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch (e) {}
          }

          resolve({ file, transcript: finalTranscript });
        };

        recorder.onstop = doResolve;

        // Flush any buffered data, then stop
        if (recorder.state === "recording") {
          recorder.requestData();
        }
        recorder.stop();
        
        // Safety fallback if onstop never fires
        setTimeout(doResolve, 2000);
      } catch (err) {
        console.error("Error stopping recording:", err);
        resolve(null);
      }
    });
  }, [recordingType, transcript]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.onstop = null; // Remove listener to avoid resolving
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
    }
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }

    setIsRecording(false);
    setRecordingType(null);
    setPreviewStream(null);
    setTranscript("");
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  return {
    isRecording,
    recordingType,
    recordingTime,
    transcript,
    previewStream,
    startRecording,
    stopRecording,
    cancelRecording
  };
}
