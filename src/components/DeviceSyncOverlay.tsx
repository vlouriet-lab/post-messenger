import React, { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { doc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { generateSyncKey, wrapPrivateKey, unwrapPrivateKey } from "../lib/crypto";
import { AppUser } from "../types";
import { useTranslation } from "react-i18next";
import { ShieldCheck, X, Camera, Copy, CheckCircle2, RefreshCw } from "lucide-react";

interface DeviceSyncOverlayProps {
  mode: "host" | "guest";
  currentUser: AppUser | { uid: string, displayName: string };
  myPrivateKey?: CryptoKey | null;
  onComplete: (privKey?: CryptoKey) => void;
  onCancel: () => void;
}

export default function DeviceSyncOverlay({
  mode,
  currentUser,
  myPrivateKey,
  onComplete,
  onCancel
}: DeviceSyncOverlayProps) {
  const [sessionId, setSessionId] = useState<string>("");
  const [aesKey, setAesKey] = useState<string>("");
  const [guestInput, setGuestInput] = useState("");
  const [status, setStatus] = useState<"waiting" | "connected" | "done" | "error">("waiting");
  const [errorMsg, setErrorMsg] = useState("");
  const { t } = useTranslation();

  // Host Mode Initialization
  useEffect(() => {
    if (mode === "host" && myPrivateKey) {
      const initHost = async () => {
        const id = Math.random().toString(36).substring(2, 10).toUpperCase();
        const key = await generateSyncKey();
        setSessionId(id);
        setAesKey(key);

        const syncRef = doc(db, "device_sync", id);
        await setDoc(syncRef, {
          hostReady: true,
          ownerId: currentUser.uid,
          timestamp: serverTimestamp()
        });

        const unsub = onSnapshot(syncRef, async (snap) => {
          if (!snap.exists()) return;
          const data = snap.data();
          if (data.guestReady && !data.payload) {
            setStatus("connected");
            try {
              // Wrap the private key securely without exposing JWK string
              const encryptedPayload = await wrapPrivateKey(myPrivateKey, key);
              await setDoc(syncRef, { payload: encryptedPayload }, { merge: true });
              setStatus("done");
              setTimeout(() => onComplete(), 2000);
            } catch (err) {
              console.error("Encryption failed", err);
            }
          }
        });
        return () => unsub();
      };
      initHost();
    }
  }, [mode, myPrivateKey]);

  // Guest Mode Connection
  const handleGuestConnect = async () => {
    if (!guestInput.includes(":")) {
      setErrorMsg("Invalid Sync Code. Must be in format SESSION:KEY");
      return;
    }
    const [id, key] = guestInput.split(":");
    if (!id || !key) return;
    
    setSessionId(id);
    setAesKey(key);
    setStatus("connected");
    setErrorMsg("");

    const syncRef = doc(db, "device_sync", id);
    try {
      await setDoc(syncRef, { guestReady: true }, { merge: true });
      
      const unsub = onSnapshot(syncRef, async (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        if (data.payload) {
          try {
            const unwrappedKey = await unwrapPrivateKey(data.payload, key);
            setStatus("done");
            setTimeout(() => onComplete(unwrappedKey), 1000);
          } catch (err) {
            console.error("Decryption failed", err);
            setErrorMsg("Failed to decrypt keys. Invalid sync code.");
            setStatus("error");
          }
          unsub();
        }
      });
    } catch (err) {
      setErrorMsg("Failed to connect to Host device.");
      setStatus("error");
    }
  };

  const syncCode = `${sessionId}:${aesKey}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm font-sans transition-colors duration-300">
      <div className="w-full max-w-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl p-6 shadow-2xl relative transition-colors duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            {mode === "host" ? "Sync New Device" : "Sync From Old Device"}
          </h2>
          <button onClick={onCancel} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {status === "waiting" && <RefreshCw className="w-5 h-5 text-amber-500 animate-spin" />}
          {status === "connected" && <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />}
          {status === "done" && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
          {status === "error" && <X className="w-5 h-5 text-rose-500" />}
          <span className="font-semibold text-sm text-slate-700 dark:text-slate-300">
            {status === "waiting" ? (mode === "host" ? "Waiting for new device..." : "Waiting for code...") :
             status === "connected" ? "Secure channel established..." :
             status === "done" ? "Sync Complete!" : "Error"}
          </span>
        </div>

        {/* Host Mode Content */}
        {mode === "host" && sessionId && aesKey && status !== "done" && (
          <div className="flex flex-col items-center">
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-4">
              <QRCodeSVG value={syncCode} size={200} />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center mb-4 leading-relaxed">
              Scan this QR code from your new device to securely transfer your private key. The code contains a one-time encryption password.
            </p>
            <div className="w-full bg-slate-50 dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <span className="font-mono text-xs text-slate-600 dark:text-slate-300 truncate mr-2">{syncCode}</span>
              <button
                onClick={() => navigator.clipboard.writeText(syncCode)}
                className="p-1.5 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-200 dark:hover:bg-blue-800/50 transition shrink-0"
                title="Copy Sync Code"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Guest Mode Content */}
        {mode === "guest" && status === "waiting" && (
          <div className="flex flex-col">
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
              Enter the Sync Code from your original device. You can find this in Settings -&gt; Security -&gt; Sync Device.
            </p>
            {errorMsg && (
              <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 text-xs rounded-xl border border-rose-200 dark:border-rose-800">
                {errorMsg}
              </div>
            )}
            <input
              type="text"
              placeholder="Paste Sync Code (SESSION:KEY)"
              value={guestInput}
              onChange={(e) => setGuestInput(e.target.value)}
              className="w-full p-3 mb-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-sm text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <button
              onClick={handleGuestConnect}
              disabled={!guestInput.trim()}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition disabled:opacity-50"
            >
              Connect & Sync
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
