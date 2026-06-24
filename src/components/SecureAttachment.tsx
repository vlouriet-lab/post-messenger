import React, { useState } from "react";
import { Download, File, Loader2, Play, AlertCircle } from "lucide-react";
import { Message } from "../types";
import { decryptFile } from "../lib/crypto";

interface SecureAttachmentProps {
  msg: Message;
  myUserId: string;
  myPrivateKeyJWK: JsonWebKey;
  isMe: boolean;
}

export default function SecureAttachment({ msg, myUserId, myPrivateKeyJWK, isMe }: SecureAttachmentProps) {
  const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const att = msg.attachment;
  if (!att) return null;

  const handleDownloadAndDecrypt = async () => {
    if (!att.url || !att.iv || !att.encryptedKeys) {
      setError("Missing decryption keys or URL");
      return;
    }
    
    setIsDecrypting(true);
    setError(null);

    try {
      // Fetch the encrypted blob from Firebase Storage
      const response = await fetch(att.url);
      const encryptedBlob = await response.blob();

      // Decrypt the blob
      const decryptedBlob = await decryptFile(
        encryptedBlob,
        att.iv,
        att.encryptedKeys,
        myUserId,
        myPrivateKeyJWK,
        att.type
      );

      // Create a local object URL
      const objectUrl = URL.createObjectURL(decryptedBlob);
      setDecryptedUrl(objectUrl);
    } catch (err) {
      console.error("Failed to decrypt attachment:", err);
      setError("Decryption failed");
    } finally {
      setIsDecrypting(false);
    }
  };

  const isAudio = att.type.startsWith("audio/");
  const isVideo = att.type.startsWith("video/");
  const isMedia = isAudio || isVideo;

  return (
    <div className={`mt-3 p-3 rounded-xl border flex flex-col gap-2 group/attachment ${
      isMe ? "bg-slate-50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-700" : "bg-blue-700/50 border-blue-500/30"
    }`}>
      <div className="flex items-center justify-between gap-3 min-w-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${
            isMe ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-800" : "bg-white/10 text-white border-white/10"
          }`}>
            <File className="w-4 h-4" />
          </div>
          <div className="flex flex-col min-w-0 leading-tight">
            <span className={`text-[11px] font-bold truncate font-sans ${isMe ? "text-slate-800 dark:text-slate-200" : "text-white"}`}>
              {att.name}
            </span>
            <span className={`text-[9px] mt-0.5 ${isMe ? "text-slate-400 dark:text-slate-500" : "text-blue-200"}`}>
              {(att.size / 1024 / 1024).toFixed(2)} MB
            </span>
          </div>
        </div>
        
        {!decryptedUrl ? (
          <button
            onClick={handleDownloadAndDecrypt}
            disabled={isDecrypting}
            className={`p-1.5 rounded-lg border transition shrink-0 ${
              isMe ? "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-300 dark:hover:border-blue-500" : "bg-blue-600/50 border-blue-500/20 text-blue-100 hover:text-white"
            } disabled:opacity-50`}
            title="Decrypt & Download"
          >
            {isDecrypting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <a
            href={decryptedUrl}
            download={att.name}
            className={`p-1.5 rounded-lg border transition shrink-0 ${
              isMe ? "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400" : "bg-emerald-500/20 border-emerald-500/30 text-emerald-100"
            }`}
            title="Save to Device"
          >
            <Download className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-[10px] text-rose-500 mt-1">
          <AlertCircle className="w-3 h-3" />
          <span>{error}</span>
        </div>
      )}

      {decryptedUrl && isMedia && (
        <div className="mt-2 w-full max-w-[240px] rounded-lg overflow-hidden bg-black/5 dark:bg-black/20">
          {isAudio ? (
            <audio src={decryptedUrl} controls className="w-full h-8 outline-none" />
          ) : (
            <video src={decryptedUrl} controls className="w-full rounded-lg" style={isVideo && att.name.startsWith("video_") ? { borderRadius: "50%", aspectRatio: "1/1", objectFit: "cover" } : {}} />
          )}
        </div>
      )}
    </div>
  );
}
