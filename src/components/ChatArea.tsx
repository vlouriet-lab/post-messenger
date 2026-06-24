/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  Send, 
  ShieldCheck, 
  ShieldAlert, 
  Paperclip, 
  Info, 
  ChevronRight, 
  Lock, 
  Unlock, 
  File, 
  Download,
  AlertCircle,
  HelpCircle,
  X,
  Plus,
  Phone,
  Video,
  ArrowLeft,
  Mic,
  Camera,
  Square,
  Trash2,
  Eraser
} from "lucide-react";
import { AppUser, Message, Chat } from "../types";
import CallOverlay from "./CallOverlay";
import SecureAttachment from "./SecureAttachment";
import MessageBubble from "./MessageBubble";
import { useTranslation } from "react-i18next";
import { useMediaRecorder } from "../hooks/useMediaRecorder";
import { doc, updateDoc, arrayUnion, onSnapshot, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";

interface ChatAreaProps {
  chat: Chat;
  currentUser: AppUser;
  messages: Message[];
  myPrivateKeyJWK: JsonWebKey | null;
  onSendMessage: (text: string, fileAttachment?: any) => Promise<void>;
  onVerifyFingerprint: (user: AppUser) => void;
  onStartCall: (type: "audio" | "video", targetId: string) => void;
  decryptedMessages: { [msgId: string]: string };
  decryptionErrors: { [msgId: string]: boolean };
  decrypting: boolean;
  onBack?: () => void;
  onDeleteForMe: (msgId: string) => void;
  onDeleteForEveryone: (msgId: string) => void;
  onReact: (msgId: string, emoji: string) => void;
}

export default function ChatArea({
  chat,
  currentUser,
  messages,
  myPrivateKeyJWK,
  onSendMessage,
  onVerifyFingerprint,
  onStartCall,
  decryptedMessages,
  decryptionErrors,
  decrypting,
  onBack,
  onDeleteForMe,
  onDeleteForEveryone,
  onReact
}: ChatAreaProps) {
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showSecurityDialog, setShowSecurityDialog] = useState(false);
  const { t } = useTranslation();

  const {
    isRecording,
    recordingType,
    recordingTime,
    transcript,
    previewStream,
    startRecording,
    stopRecording,
    cancelRecording
  } = useMediaRecorder();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (isRecording && recordingType === "video" && videoPreviewRef.current && previewStream) {
      videoPreviewRef.current.srcObject = previewStream;
      videoPreviewRef.current.play().catch(e => console.error("Video play failed", e));
    }
  }, [previewStream, recordingType, isRecording]);

  const otherUid = chat.participants.find((p) => p !== currentUser.uid);
  const staticContact = otherUid ? chat.participantDetails[otherUid] : null;
  const [liveContact, setLiveContact] = useState<AppUser | null>(null);

  const contact = liveContact || staticContact;

  const isGroup = chat.isGroup;
  const groupName = chat.groupName;
  const participantCount = chat.participants.length;

  useEffect(() => {
    if (!isGroup && otherUid) {
      const unsub = onSnapshot(doc(db, "users", otherUid), (snap) => {
        if (snap.exists()) {
          setLiveContact(snap.data() as AppUser);
        }
      });
      return () => unsub();
    }
  }, [isGroup, otherUid]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, decryptedMessages]);

  useEffect(() => {
    const markUnreadAsRead = async () => {
      const unreadMessages = messages.filter(
        m => !m.isSystem && m.senderId !== currentUser.uid && (!m.readBy || !m.readBy.includes(currentUser.uid))
      );
      if (unreadMessages.length > 0) {
        unreadMessages.forEach(async (m) => {
          try {
            const msgRef = doc(db, "chats", chat.id, "messages", m.id);
            await updateDoc(msgRef, {
              readBy: arrayUnion(currentUser.uid)
            });
          } catch (e) {
            console.error("Failed to mark message as read", e);
          }
        });
      }
    };
    markUnreadAsRead();
  }, [messages, chat.id, currentUser.uid]);

  const handleClearHistory = async () => {
    if (!window.confirm(t("confirm_clear_history", "Are you sure you want to clear your chat history? This will only clear it for you."))) {
      return;
    }
    try {
      await updateDoc(doc(db, "chats", chat.id), {
        [`clearedAt.${currentUser.uid}`]: serverTimestamp()
      });
    } catch (e) {
      console.error("Failed to clear history", e);
    }
  };

  const formatLastSeen = (timestamp: any) => {
    if (!timestamp) return "";
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) return timeStr;
    if (isYesterday) return `вчера, ${timeStr}`;
    return `${date.toLocaleDateString([], { day: '2-digit', month: '2-digit' })}, ${timeStr}`;
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (sending) return;

    try {
      setSending(true);
      
      let fileToSend: File | undefined = selectedFile || undefined;
      let textToSend = inputText.trim();

      // If there is an active recording, stop it and send that file instead
      if (isRecording) {
        const result = await stopRecording();
        if (result && result.file) {
          fileToSend = result.file;
          if (result.transcript) {
            textToSend = result.transcript;
          }
        }
      }

      // Only block truly empty files (shouldn't happen with requestData fix)
      if (fileToSend && fileToSend.size === 0) {
        console.warn("Recording produced empty file, skipping");
        fileToSend = undefined;
      }

      if (!textToSend && !fileToSend) {
        setSending(false);
        return;
      }

      await onSendMessage(textToSend, fileToSend);
      
      setInputText("");
      setSelectedFile(null);
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setSending(false);
    }
  };


  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  if (!contact && !isGroup) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 transition-colors duration-300">
        <ShieldAlert className="w-12 h-12 text-rose-500 mb-4 stroke-1" />
        <p className="font-semibold text-slate-800 dark:text-slate-200">{t("invalid_connection")}</p>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">{t("invalid_connection_desc")}</p>
      </div>
    );
  }

  return (
    <div 
      className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 relative font-sans transition-colors duration-300"
      onDragEnter={handleDrag}
    >
      {dragActive && (
        <div 
          className="absolute inset-0 bg-white/95 dark:bg-slate-900/95 border-2 border-dashed border-blue-500/50 m-4 rounded-2xl flex flex-col items-center justify-center z-50 transition"
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
        >
          <div className="p-4 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 mb-3 animate-pulse">
            <Paperclip className="w-8 h-8" />
          </div>
          <p className="font-semibold text-blue-600 dark:text-blue-400">{t("drop_files")}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{t("files_encrypted_locally")}</p>
        </div>
      )}

      {/* Chat Area Header */}
      <div className="p-3 sm:p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 backdrop-blur-md z-10 transition-colors duration-300">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="md:hidden p-2 -ml-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition"
              title={t("back")}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <img
            src={contact?.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${isGroup ? groupName : contact?.displayName}`}
            alt={isGroup ? groupName : contact?.displayName}
            referrerPolicy="no-referrer"
            className="w-10 h-10 rounded-full border border-slate-100 dark:border-slate-800 object-cover"
          />
          <div className="flex flex-col min-w-0 flex-1">
            <span className="font-bold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-1.5 leading-tight overflow-hidden">
              <span className="truncate">{isGroup ? groupName : contact?.displayName}</span>
              {!isGroup && (
                <button
                  onClick={() => setShowSecurityDialog(true)}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 text-[9px] text-blue-600 dark:text-blue-400 font-bold hover:bg-blue-100 dark:hover:bg-blue-900/50 transition shrink-0"
                  title={t("verified_link")}
                >
                  <ShieldCheck className="w-3 h-3" />
                  <span className="hidden xs:inline sm:inline">{t("verified_link")}</span>
                </button>
              )}
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">
              {isGroup ? (
                `${participantCount} participants`
              ) : contact?.isOnline ? (
                <span className="text-emerald-500 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  В сети
                </span>
              ) : contact?.lastSeen ? (
                `Был(а) в сети: ${formatLastSeen(contact.lastSeen)}`
              ) : (
                contact?.email
              )}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {!isGroup && (
            <>
              <button
                onClick={() => onVerifyFingerprint(contact as AppUser)}
                className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white transition cursor-pointer shadow-sm"
              >
                <Lock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="hidden sm:inline">{t("verify_safety_code")}</span>
              </button>
              
              <button
                onClick={() => onVerifyFingerprint(contact as AppUser)}
                className="md:hidden p-2 sm:p-3 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition cursor-pointer shadow-sm"
                title={t("verify_safety_code")}
              >
                <Lock className="w-4 h-4" />
              </button>

              <button
                onClick={() => onStartCall("audio", contact!.uid)}
                className="p-2 sm:p-3 rounded-xl bg-blue-500 dark:bg-blue-600 hover:bg-blue-600 dark:hover:bg-blue-500 text-white transition cursor-pointer shadow-md shadow-blue-500/20"
                title={t("start_audio_call")}
              >
                <Phone className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
              </button>

              <button
                onClick={() => onStartCall("video", contact!.uid)}
                className="p-2 sm:p-3 rounded-xl bg-blue-500 dark:bg-blue-600 hover:bg-blue-600 dark:hover:bg-blue-500 text-white transition cursor-pointer shadow-md shadow-blue-500/20"
                title={t("start_video_call")}
              >
                <Video className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
              </button>
            </>
          )}

          <button
            onClick={handleClearHistory}
            className="p-2 sm:p-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer"
            title={t("clear_history", "Clear History")}
          >
            <Eraser className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-900/50 flex flex-col transition-colors duration-300">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-16 text-slate-400 dark:text-slate-500">
            <Lock className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-3 stroke-1" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t("secure_channel_established")}</p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 max-w-xs">{t("send_encrypted_payload")}</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === currentUser.uid;

            if (msg.isSystem) {
              const isCall = msg.systemAction === "call";
              const Icon = isCall ? (msg.callType === 'video' ? Video : Phone) : Info;

              if (isCall) {
                const isMissed = !msg.callDuration || msg.callDuration === 0;
                
                return (
                  <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"} mb-4`}>
                    <div className={`max-w-[85%] rounded-2xl p-3 shadow-sm border transition-colors duration-300 ${
                      isMe 
                        ? "bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800/50 rounded-tr-sm" 
                        : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 rounded-tl-sm"
                    }`}>
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                            isMissed 
                              ? "bg-red-100 dark:bg-red-900/30 text-red-500" 
                              : isMe ? "bg-blue-100 dark:bg-blue-800/50 text-blue-600 dark:text-blue-300" : "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                          }`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                              {isMe 
                                ? (isMissed ? t("canceled_call", "Canceled Call") : t("outgoing_call", "Outgoing Call"))
                                : (isMissed ? t("missed_call", "Missed Call") : t("incoming_call", "Incoming Call"))}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {isMissed 
                                ? msg.timestamp ? formatLastSeen(msg.timestamp) : "" 
                                : `${Math.floor(msg.callDuration! / 60)}:${(msg.callDuration! % 60).toString().padStart(2, '0')}`}
                            </span>
                          </div>
                        </div>

                        {/* Call Back Button */}
                        {!isMe && (
                          <button
                            onClick={() => onStartCall(msg.callType as any || "audio", msg.senderId)}
                            className="w-full mt-1 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 transition"
                          >
                            {t("call_back", "Call Back")}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }
              
              // Non-call system message
              return (
                <div key={msg.id} className="flex justify-center my-2">
                  <div className={`px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 border text-[10px] font-mono flex items-center gap-1.5 shadow-sm text-slate-500 dark:text-slate-400 transition-colors duration-300`}>
                    <Info className="w-3.5 h-3.5" />
                    <span>{msg.systemText}</span>
                  </div>
                </div>
              );
            }

            const isDecrypted = decryptedMessages[msg.id] !== undefined;
            const textContent = decryptedMessages[msg.id];
            const hasError = decryptionErrors[msg.id];

            return (
              <MessageBubble
                key={msg.id}
                msg={msg}
                chat={chat}
                currentUser={currentUser}
                isMe={isMe}
                isGroup={isGroup || false}
                decryptedText={textContent}
                hasError={hasError}
                myPrivateKeyJWK={myPrivateKeyJWK}
                onDeleteForMe={onDeleteForMe}
                onDeleteForEveryone={onDeleteForEveryone}
                onReact={onReact}
              />
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 transition-colors duration-300">
        {selectedFile && (
          <div className="mb-3 px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 flex items-center justify-between gap-2 text-xs transition-colors duration-300">
            <div className="flex items-center gap-2 min-w-0">
              <File className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{selectedFile.name}</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">({formatBytes(selectedFile.size)})</span>
            </div>
            <button
              onClick={() => setSelectedFile(null)}
              className="p-1 rounded-md text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {isRecording ? (
          <div className="flex flex-col gap-2 w-full">
            {recordingType === "video" && (
              <div className="w-full flex justify-center mb-2">
                <div className="relative w-40 h-40 rounded-full overflow-hidden border-4 border-red-500/50 shadow-lg">
                  <video
                    ref={videoPreviewRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                  <div className="absolute top-2 right-2 w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-md"></div>
                  <div className="absolute bottom-2 left-0 right-0 text-center font-mono text-xs font-bold text-white drop-shadow-md bg-black/30 backdrop-blur-sm mx-8 rounded-full">
                    {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
                  </div>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 w-full bg-red-50 dark:bg-red-900/20 p-2 rounded-xl border border-red-200 dark:border-red-800/50">
              {recordingType === "audio" && (
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse ml-2"></div>
              )}
              <div className="text-red-600 dark:text-red-400 font-mono text-sm font-semibold flex-1">
                {recordingType === "audio" && (
                  <span>{Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}</span>
                )}
                <span className={`text-xs font-sans text-red-500/70 ${recordingType === "audio" ? "ml-2" : ""}`}>
                  {recordingType === "audio" ? "Recording Voice..." : "Recording Video Message..."}
                </span>
                {transcript && (
                  <span className="block text-[10px] text-slate-500 font-sans mt-0.5 max-w-xs truncate">{transcript}</span>
                )}
              </div>
            <button
              type="button"
              onClick={cancelRecording}
              className="p-2 text-slate-400 hover:text-red-500 transition"
              title="Cancel"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={handleSend}
              className="p-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 font-semibold transition"
              title="Send Recording"
            >
              <Send className="w-4 h-4" />
            </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSend} className="flex items-center gap-2 w-full">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition shrink-0"
              title={t("attach_secure_envelope")}
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={selectedFile ? t("add_password_caption") : t("write_secure_message")}
              className="flex-1 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 text-xs rounded-xl border border-transparent focus:border-blue-300 dark:focus:border-blue-600 focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-blue-100 dark:focus:ring-blue-900 focus:outline-none px-4 py-3 transition font-sans min-w-0"
            />

            <button
              type="submit"
              disabled={sending || (!inputText.trim() && !selectedFile)}
              className="p-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700 font-semibold transition shrink-0 disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-blue-100 dark:shadow-none group"
            >
              {sending ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </form>
        )}
      </div>

      {showSecurityDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-slate-900/80 backdrop-blur-sm transition-colors duration-300">
          <div className="w-full max-w-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl p-6 shadow-2xl relative transition-colors duration-300">
            <button
              onClick={() => setShowSecurityDialog(false)}
              className="absolute top-4 right-4 p-1 rounded-md text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex flex-col items-center text-center mt-2 font-sans">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4 transition-colors duration-300">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">{t("verified_connection_profile")}</h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{t("e2ee_tunnel_credentials")} {contact.displayName}</p>

              <div className="w-full mt-5 space-y-4 text-left">
                <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700 p-3 rounded-2xl flex items-center gap-3 transition-colors duration-300">
                  <img
                    src={contact.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${contact.displayName}`}
                    alt={contact.displayName}
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-600 object-cover"
                  />
                  <div className="min-w-0 flex-1 leading-tight">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block truncate">{contact.displayName}</span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 block truncate mt-0.5">{contact.email}</span>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700 p-3 rounded-2xl space-y-2 transition-colors duration-300">
                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider block font-bold">{t("recipient_public_key")}</span>
                  {contact.publicKeyJWK ? (
                    <div className="space-y-2">
                      <div className="text-[10px] font-mono bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 break-all select-all font-light leading-normal max-h-32 overflow-y-auto">
                        {JSON.stringify(contact.publicKeyJWK)}
                      </div>
                      <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-mono font-bold block">
                        ● RSA-OAEP 2048 Bit • SHA-256 Enabled
                      </span>
                    </div>
                  ) : (
                    <div className="text-xs text-rose-500 dark:text-rose-400 italic font-semibold">
                      {t("recipient_no_key")}
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={() => setShowSecurityDialog(false)}
                className="mt-6 w-full py-2.5 px-4 rounded-xl bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 text-xs font-semibold text-white transition"
              >
                {t("close_verification")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
