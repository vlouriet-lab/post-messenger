/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  Phone, 
  PhoneOff, 
  Mic, 
  MicOff, 
  VideoOff, 
  ShieldCheck, 
  Camera
} from "lucide-react";
import { AppUser, CallSignal } from "../types";
import { doc, updateDoc, collection, addDoc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";

interface CallOverlayProps {
  isOpen: boolean;
  callType: "audio" | "video";
  contact?: AppUser | null;
  currentUser: AppUser;
  onClose: () => void;
  activeCall?: CallSignal | null;
  incomingCall?: CallSignal | null;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
  ],
};

// Simple one-shot beep for connect/disconnect sounds
function playBeep(freq: number, duration: number, volume = 0.07) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
    setTimeout(() => ctx.close().catch(() => {}), (duration + 0.2) * 1000);
  } catch (_) {}
}

export default function CallOverlay({
  isOpen,
  callType,
  contact,
  currentUser,
  onClose,
  activeCall,
  incomingCall,
}: CallOverlayProps) {
  // UI state
  const [callStatus, setCallStatus] = useState<"calling" | "ringing" | "connecting" | "connected" | "ended">("calling");
  const [duration, setDuration] = useState(0);
  const durationRef = useRef(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Media refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  // Misc
  const timerRef = useRef<any>(null);
  const ringAudioRef = useRef<HTMLAudioElement | null>(null);
  const isCaller = !!activeCall;
  const callId = activeCall?.id || incomingCall?.id;

  // Initialize ring audio element once
  // Initialize ring audio element once
  useEffect(() => {
    return () => {
      stopRinging();
    };
  }, []);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const startRinging = useCallback(() => {
    if (ringAudioRef.current) return; // already ringing
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    
    try {
      const ctx = new AudioContext();
      ringAudioRef.current = ctx as any;
      
      const playRing = () => {
        if (ctx.state === 'closed') return;
        
        if (isCaller) {
          // Ringback tone (what the caller hears: 1s long beep, 2s pause)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.setValueAtTime(425, ctx.currentTime);
          osc.type = "sine";
          
          const lfo = ctx.createOscillator();
          lfo.frequency.value = 20; 
          const lfoGain = ctx.createGain();
          lfoGain.gain.value = 0.5;
          lfo.connect(lfoGain);
          
          gain.gain.setValueAtTime(0, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.1);
          gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 1.0);
          gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.1);
          
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 1.1);
        } else {
          // Digital ringtone (what the receiver hears: fast alternating notes)
          const playNote = (freq: number, startTime: number, duration: number) => {
            if (ctx.state === 'closed') return;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.frequency.setValueAtTime(freq, startTime);
            osc.type = "square";
            
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.1, startTime + 0.02);
            gain.gain.linearRampToValueAtTime(0, startTime + duration);
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(startTime);
            osc.stop(startTime + duration);
          };

          const now = ctx.currentTime;
          // Burst 1
          playNote(800, now, 0.1);
          playNote(600, now + 0.1, 0.1);
          playNote(800, now + 0.2, 0.1);
          playNote(600, now + 0.3, 0.1);
          
          // Burst 2
          playNote(800, now + 0.6, 0.1);
          playNote(600, now + 0.7, 0.1);
          playNote(800, now + 0.8, 0.1);
          playNote(600, now + 0.9, 0.1);
        }
      };

      playRing();
      timerRef.current = setInterval(playRing, isCaller ? 3000 : 2000);

      if (!isCaller && "vibrate" in navigator) {
        navigator.vibrate([1000, 2000, 1000, 2000, 1000, 2000]);
      }
    } catch (e) {
      console.warn("Failed to start ringtone:", e);
    }
  }, [isCaller]);

  const stopRinging = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const ctx = ringAudioRef.current as any as AudioContext;
    if (ctx && ctx.state !== 'closed') {
      ctx.close().catch(() => {});
    }
    ringAudioRef.current = null;
    if ("vibrate" in navigator) {
      navigator.vibrate(0);
    }
  }, []);


  const cleanupPeer = useCallback(() => {
    console.log("[WebRTC] Cleaning up peer connection and tracks.");
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  }, []);

  const endCall = useCallback(async (sendSignal = true) => {
    stopRinging();
    cleanupPeer();
    clearInterval(timerRef.current);
    if (sendSignal && callId) {
      await updateDoc(doc(db, "calls", callId), { 
        status: "ended",
        duration: durationRef.current
      }).catch(() => {});
    }
    setCallStatus("ended");
    playBeep(290, 0.5);
    setTimeout(onClose, 2000);
  }, [callId, onClose, stopRinging, cleanupPeer]);

  // ─── Get media ────────────────────────────────────────────────────────────

  const getMedia = useCallback(async (): Promise<MediaStream | null> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === "video",
      });
      console.log("[WebRTC] Got local media. Audio:", stream.getAudioTracks().length, "Video:", stream.getVideoTracks().length);
      localStreamRef.current = stream;
      if (localVideoRef.current && callType === "video") {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (err: any) {
      console.error("[WebRTC] getUserMedia failed:", err);
      setErrorMsg("Нет доступа к камере/микрофону. Проверьте разрешения браузера.");
      return null;
    }
  }, [callType]);

  // ─── Build RTCPeerConnection ───────────────────────────────────────────────

  const buildPeer = useCallback(
    async (stream: MediaStream, docId: string, asCaller: boolean) => {
      console.log(`[WebRTC] Building peer. asCaller=${asCaller}`);
      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      // Add local tracks
      stream.getTracks().forEach(track => {
        console.log("[WebRTC] addTrack:", track.kind);
        pc.addTrack(track, stream);
      });

      // Incoming tracks
      const remoteStream = new MediaStream();
      pc.ontrack = (e) => {
        console.log("[WebRTC] ontrack:", e.track.kind);
        e.track.onunmute = () => console.log("[WebRTC] track unmuted:", e.track.kind);
        remoteStream.addTrack(e.track);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
      };

      // State logging
      pc.oniceconnectionstatechange = () => {
        console.log("[WebRTC] ICE state:", pc.iceConnectionState);
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
          setCallStatus("connected");
          stopRinging();
          playBeep(580, 0.3);
        }
        if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "disconnected") {
          console.warn("[WebRTC] ICE failed/disconnected");
          setErrorMsg("Соединение прервано. Попробуйте ещё раз.");
        }
      };
      pc.onconnectionstatechange = () => {
        console.log("[WebRTC] Connection state:", pc.connectionState);
      };

      const callDocRef = doc(db, "calls", docId);
      const callerCands = collection(callDocRef, "callerCandidates");
      const calleeCands = collection(callDocRef, "calleeCandidates");

      // ICE candidate handler
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          console.log("[WebRTC] Sending ICE candidate as", asCaller ? "caller" : "callee");
          addDoc(asCaller ? callerCands : calleeCands, e.candidate.toJSON()).catch(console.error);
        } else {
          console.log("[WebRTC] ICE gathering complete.");
        }
      };

      if (asCaller) {
        // 1. Create Offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        console.log("[WebRTC] Offer created, saving to Firestore...");
        await updateDoc(callDocRef, { offer: { sdp: offer.sdp, type: offer.type } });

        // 2. Wait for Answer
        let answerHandled = false;
        const unsubAnswer = onSnapshot(callDocRef, async (snap) => {
          if (answerHandled) return;
          const data = snap.data() as CallSignal;
          if (data?.answer && !pc.remoteDescription) {
            answerHandled = true;
            console.log("[WebRTC] Got answer from callee, setting remote description.");
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));

            // 3. Start listening to callee's ICE candidates ONLY AFTER setting remote desc
            onSnapshot(calleeCands, (s) => {
              s.docChanges().forEach(c => {
                if (c.type === "added") {
                  console.log("[WebRTC] Adding callee ICE candidate.");
                  pc.addIceCandidate(new RTCIceCandidate(c.doc.data())).catch(console.error);
                }
              });
            });

            unsubAnswer(); // stop watching the call doc for answer
          }
        });
      } else {
        // Callee: wait for offer
        let offerHandled = false;
        const unsubOffer = onSnapshot(callDocRef, async (snap) => {
          if (offerHandled) return;
          const data = snap.data() as CallSignal;
          if (data?.offer && !pc.remoteDescription) {
            offerHandled = true;
            console.log("[WebRTC] Got offer from caller, setting remote description and creating answer.");
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            console.log("[WebRTC] Answer created, saving to Firestore...");
            await updateDoc(callDocRef, { answer: { sdp: answer.sdp, type: answer.type } });

            // Start listening to caller's ICE candidates ONLY AFTER setting remote desc
            onSnapshot(callerCands, (s) => {
              s.docChanges().forEach(c => {
                if (c.type === "added") {
                  console.log("[WebRTC] Adding caller ICE candidate.");
                  pc.addIceCandidate(new RTCIceCandidate(c.doc.data())).catch(console.error);
                }
              });
            });

            unsubOffer(); // stop watching call doc for offer
          }
        });
      }
    },
    [stopRinging]
  );

  // ─── Handle Accept (Callee) ───────────────────────────────────────────────

  const handleAccept = useCallback(async () => {
    if (!incomingCall) return;
    stopRinging();
    setCallStatus("connecting");
    const stream = await getMedia();
    if (!stream) {
      await updateDoc(doc(db, "calls", incomingCall.id), { status: "rejected" });
      setCallStatus("ended");
      setTimeout(onClose, 1500);
      return;
    }
    await buildPeer(stream, incomingCall.id, false);
    // Signal that we accepted (Caller will see status update)
    await updateDoc(doc(db, "calls", incomingCall.id), { status: "connected" });
  }, [incomingCall, getMedia, buildPeer, stopRinging, onClose]);

  // ─── Handle Reject ────────────────────────────────────────────────────────

  const handleReject = useCallback(async () => {
    if (!incomingCall) return;
    stopRinging();
    await updateDoc(doc(db, "calls", incomingCall.id), { status: "rejected" });
    setCallStatus("ended");
    setTimeout(onClose, 1000);
  }, [incomingCall, stopRinging, onClose]);

  // ─── Caller init (when overlay opens) ────────────────────────────────────

  useEffect(() => {
    if (!isOpen || !isCaller || !callId) return;
    let mounted = true;

    (async () => {
      const stream = await getMedia();
      if (!stream || !mounted) return;
      await buildPeer(stream, callId, true);
    })();

    return () => { mounted = false; };
  }, [isOpen]); // run only once on open

  // Assign local stream to local video ref once it's mounted (after callStatus → connected)
  useEffect(() => {
    if (callStatus === "connected" && callType === "video") {
      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
        localVideoRef.current.play().catch(() => {});
      }
    }
  }, [callStatus, callType]);

  // ─── Track incoming call status changes ──────────────────────────────────

  useEffect(() => {
    const s = activeCall?.status || incomingCall?.status;
    if (!s) return;
    console.log("[CallOverlay] Status from Firestore/prop:", s);

    if (s === "ringing") {
      setCallStatus("ringing");
      if (!isCaller) startRinging(); // callee rings
    } else if (s === "connected") {
      setCallStatus("connected");
      stopRinging();
      // Reassign stream refs in case video elements now exist
      if (remoteVideoRef.current && pcRef.current) {
        const receivers = pcRef.current.getReceivers();
        const tracks = receivers.map(r => r.track).filter(Boolean);
        if (tracks.length > 0) {
          const rs = new MediaStream(tracks);
          remoteVideoRef.current.srcObject = rs;
        }
      }
    } else if (s === "ended" || s === "rejected" || s === "missed") {
      endCall(false);
    }
  }, [activeCall?.status, incomingCall?.status]);

  // ─── Calling status start ─────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;
    if (isCaller) {
      setCallStatus("calling");
      startRinging(); // caller hears dial tone
    } else {
      setCallStatus("ringing");
      startRinging(); // callee hears ring
    }
    return () => stopRinging();
  }, [isOpen]);

  // ─── Timer ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (callStatus === "connected") {
      timerRef.current = setInterval(() => {
        setDuration(d => {
          const newD = d + 1;
          durationRef.current = newD;
          return newD;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [callStatus]);

  // ─── Cleanup on unmount ───────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      stopRinging();
      cleanupPeer();
      clearInterval(timerRef.current);
    };
  }, []);

  // ─── Controls ─────────────────────────────────────────────────────────────

  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setIsMuted(m => !m);
  };

  const toggleCamera = () => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setIsCameraOff(c => !c);
  };

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const avatarUrl = (user?: AppUser | null) =>
    user?.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user?.displayName || "U"}`;

  if (!isOpen) return null;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/95 backdrop-blur-xl p-4 font-sans">
      <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col" style={{ height: "min(90vh, 600px)" }}>

        {/* Top bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60 bg-slate-900/50">
          <ShieldCheck className="w-4 h-4 text-blue-500 shrink-0" />
          <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider">E2EE Secure Channel</span>
          {callStatus === "connected" && (
            <span className="ml-auto px-3 py-1 rounded-xl bg-blue-600 text-white font-mono text-xs font-bold">
              {formatTime(duration)}
            </span>
          )}
        </div>

        {/* Main area */}
        <div className="flex-1 relative flex flex-col items-center justify-center overflow-hidden">

          {/* Video call - connected */}
          {callType === "video" && callStatus === "connected" && (
            <>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
              />
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="absolute bottom-3 right-3 w-28 h-40 rounded-2xl border border-slate-700 object-cover shadow-xl z-10 scale-x-[-1]"
              />
            </>
          )}

          {/* Audio call - connected */}
          {callType === "audio" && callStatus === "connected" && (
            <>
              {/* Hidden audio-only remote stream */}
              <video ref={remoteVideoRef} autoPlay playsInline className="hidden" />
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
                  <img src={avatarUrl(contact)} alt={contact?.displayName} className="relative w-24 h-24 rounded-full border-2 border-emerald-500/40 object-cover" />
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-bold text-white">{contact?.displayName}</h3>
                  <p className="text-xs text-emerald-400 font-mono mt-1">🔒 Активный зашифрованный звонок</p>
                </div>
              </div>
            </>
          )}

          {/* Dialing / Ringing / Connecting */}
          {callStatus !== "connected" && (
            <div className="flex flex-col items-center gap-6 p-6 text-center">
              <div className="relative">
                {(callStatus === "calling" || callStatus === "ringing") && (
                  <div className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping" />
                )}
                <img src={avatarUrl(contact)} alt={contact?.displayName} className="relative w-28 h-28 rounded-full border-2 border-blue-500/30 object-cover shadow-xl" />
              </div>

              <div>
                <h2 className="text-xl font-bold text-white">{contact?.displayName || "Unknown"}</h2>
                <p className="text-xs text-slate-400 mt-1">{contact?.email}</p>
                <p className="text-sm text-blue-400 font-mono mt-3 animate-pulse">
                  {callStatus === "calling" && "📞 Вызов..."}
                  {callStatus === "ringing" && isCaller && "📞 Идёт вызов..."}
                  {callStatus === "ringing" && !isCaller && "📲 Входящий звонок"}
                  {callStatus === "connecting" && "🔗 Соединение..."}
                  {callStatus === "ended" && "📵 Звонок завершён"}
                </p>
              </div>

              {/* Accept / Reject for callee */}
              {callStatus === "ringing" && !isCaller && (
                <div className="flex gap-6 mt-2">
                  <button
                    onClick={handleReject}
                    className="flex flex-col items-center gap-1"
                    title="Отклонить"
                  >
                    <div className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-700 flex items-center justify-center transition shadow-lg active:scale-95">
                      <PhoneOff className="w-7 h-7 text-white" />
                    </div>
                    <span className="text-xs text-slate-400">Отклонить</span>
                  </button>
                  <button
                    onClick={handleAccept}
                    className="flex flex-col items-center gap-1"
                    title="Принять"
                  >
                    <div className="w-16 h-16 rounded-full bg-emerald-600 hover:bg-emerald-700 flex items-center justify-center transition shadow-lg active:scale-95">
                      <Phone className="w-7 h-7 text-white" />
                    </div>
                    <span className="text-xs text-slate-400">Принять</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {errorMsg && (
            <div className="absolute bottom-4 left-4 right-4 bg-rose-950/90 border border-rose-800 text-rose-200 p-3 rounded-2xl text-xs flex items-center gap-2 z-20 backdrop-blur">
              <VideoOff className="w-4 h-4 text-rose-400 shrink-0" />
              {errorMsg}
            </div>
          )}

          {/* Ended overlay */}
          {callStatus === "ended" && (
            <div className="absolute inset-0 bg-slate-950/95 backdrop-blur z-30 flex flex-col items-center justify-center gap-3">
              <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <PhoneOff className="w-7 h-7 text-rose-400" />
              </div>
              <h3 className="text-base font-bold text-white">Звонок завершён</h3>
              <p className="text-xs text-slate-400">E2EE канал закрыт</p>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        {(callStatus === "connected" || callStatus === "calling" || callStatus === "connecting" || (callStatus === "ringing" && isCaller)) && (
          <div className="p-5 border-t border-slate-800/60 bg-slate-950 flex items-center justify-center gap-4">
            {callStatus === "connected" && (
              <button
                onClick={toggleMute}
                title={isMuted ? "Включить микрофон" : "Отключить микрофон"}
                className={`p-3.5 rounded-2xl border transition active:scale-95 ${isMuted ? "bg-rose-500/20 border-rose-500/40 text-rose-400" : "bg-slate-900 border-slate-800 text-slate-300 hover:text-white"}`}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
            )}

            {callStatus === "connected" && callType === "video" && (
              <button
                onClick={toggleCamera}
                title={isCameraOff ? "Включить камеру" : "Выключить камеру"}
                className={`p-3.5 rounded-2xl border transition active:scale-95 ${isCameraOff ? "bg-rose-500/20 border-rose-500/40 text-rose-400" : "bg-slate-900 border-slate-800 text-slate-300 hover:text-white"}`}
              >
                {isCameraOff ? <VideoOff className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
              </button>
            )}

            <button
              onClick={() => endCall(true)}
              title="Завершить звонок"
              className="px-6 py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-2 font-bold transition shadow-lg active:scale-95"
            >
              <PhoneOff className="w-5 h-5" />
              <span className="text-sm">Завершить</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
