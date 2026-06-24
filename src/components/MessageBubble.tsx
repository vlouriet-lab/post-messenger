import React, { useState, useRef, useEffect } from "react";
import { Message, Chat, AppUser } from "../types";
import { AlertCircle, Info, File, Download, Smile, Trash2, MoreVertical, CheckCheck, Check, Phone, PhoneMissed, Video, PhoneCall } from "lucide-react";
import SecureAttachment from "./SecureAttachment";
import { useTranslation } from "react-i18next";

interface MessageBubbleProps {
  key?: string | number;
  msg: Message;
  chat: Chat;
  currentUser: AppUser;
  isMe: boolean;
  isGroup: boolean;
  decryptedText?: string;
  hasError?: boolean;
  myPrivateKeyJWK: JsonWebKey | null;
  onDeleteForMe: (msgId: string) => void;
  onDeleteForEveryone: (msgId: string) => void;
  onReact: (msgId: string, emoji: string) => void;
  onStartCall?: (type: "audio" | "video", targetId: string) => void;
}

export default function MessageBubble({
  msg,
  chat,
  currentUser,
  isMe,
  isGroup,
  decryptedText,
  hasError,
  myPrivateKeyJWK,
  onDeleteForMe,
  onDeleteForEveryone,
  onReact,
  onStartCall
}: MessageBubbleProps) {
  const { t } = useTranslation();
  const [showOptions, setShowOptions] = useState(false);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);

  // If message is deleted for everyone
  if (msg.isDeletedForEveryone) {
    return (
      <div className={`flex ${isMe ? "justify-end" : "justify-start"} my-2 opacity-60`}>
        <div className={`px-3 py-1.5 rounded-full text-[10px] italic flex items-center gap-1.5 ${
          isMe ? "bg-slate-100 dark:bg-slate-800 text-slate-500" : "bg-slate-100 dark:bg-slate-800 text-slate-500"
        }`}>
          <Trash2 className="w-3.5 h-3.5" />
          <span>{t("message_deleted", "This message was deleted.")}</span>
        </div>
      </div>
    );
  }

  // If message is deleted for me locally
  if (msg.deletedFor?.includes(currentUser.uid)) {
    return null;
  }

  const handleTouchStart = () => {
    pressTimer.current = setTimeout(() => {
      setShowOptions(true);
    }, 500); // 500ms long press
  };

  const handleTouchEnd = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowOptions(true);
  };

  const canDeleteForEveryone = isMe || (isGroup && chat.admins?.includes(currentUser.uid));

  if (msg.isSystem && msg.isCall) {
    const isMissed = msg.callStatus === "missed";
    const isRejected = msg.callStatus === "rejected";
    const isVideo = msg.callType === "video";
    
    let Icon = Phone;
    if (isVideo) Icon = Video;
    if (isMissed) Icon = PhoneMissed;

    let statusText = isMe ? t("call_outgoing", "Outgoing Call") : t("call_incoming", "Incoming Call");
    if (isMissed) statusText = t("call_missed", "Missed Call");
    if (isRejected) statusText = t("call_rejected", "Declined Call");

    const formatDuration = (ms: number) => {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const h = Math.floor(m / 60);
      if (h > 0) return `${h}:${(m%60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;
      return `${m}:${(s%60).toString().padStart(2,'0')}`;
    };

    return (
      <div className={`flex ${isMe ? "justify-end" : "justify-start"} my-3`}>
        <div className={`flex flex-col gap-2 p-3.5 rounded-2xl min-w-[180px] max-w-[80%] shadow-sm ${
          isMe 
            ? "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
            : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${
              isMissed || isRejected ? "bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400" 
              : "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
            }`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className={`text-sm font-semibold ${isMissed || isRejected ? "text-rose-600 dark:text-rose-400" : ""}`}>
                {statusText}
              </span>
              <span className="text-xs text-slate-500">
                {msg.callDuration ? formatDuration(msg.callDuration) : (isMissed || isRejected ? "" : t("call_ended", "Ended"))}
              </span>
            </div>
          </div>
          
          {!isMe && onStartCall && (
            <button 
              onClick={() => onStartCall(msg.callType as "audio"|"video" || "audio", msg.senderId)}
              className="mt-1 w-full py-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-sm font-semibold rounded-xl transition flex justify-center items-center gap-2"
            >
              <PhoneCall className="w-4 h-4" />
              {t("call_back", "Call Back")}
            </button>
          )}

          <div className={`text-[9px] text-right text-slate-400 uppercase mt-1 ${!isMe && onStartCall ? "border-t border-slate-100 dark:border-slate-700 pt-1" : ""}`}>
             {msg.timestamp ? (msg.timestamp.toDate ? msg.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : ""}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex ${isMe ? "justify-end" : "justify-start"} relative`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onDoubleClick={handleDoubleClick}
    >
      <div className={`flex flex-col max-w-[80%] sm:max-w-[70%] group relative`}>
        <div
          className={`rounded-2xl p-3.5 relative shadow-sm transition-all ${
            isMe
              ? "bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-slate-800 dark:text-slate-200 rounded-tr-sm"
              : "bg-blue-600 dark:bg-blue-600/90 text-white rounded-tl-sm"
          }`}
        >
          {!isMe && isGroup && (
            <div className="text-[10px] font-bold text-blue-200 mb-1.5 uppercase tracking-wide">
              {chat.participantDetails[msg.senderId]?.displayName || "Unknown"}
            </div>
          )}

          <div className={`text-xs leading-relaxed break-words whitespace-pre-wrap selection:bg-blue-100 selection:text-slate-900 font-sans ${
            isMe ? "text-slate-800 dark:text-slate-200" : "text-white"
          }`}>
            {hasError ? (
              <div className="flex items-start gap-2 text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 border border-rose-100 dark:border-rose-800/50 p-2 rounded-xl">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block text-rose-700 dark:text-rose-300">{t("decryption_error")}</span>
                  <span className="text-[10px] text-rose-500 dark:text-rose-400">{t("decryption_error_desc")}</span>
                </div>
              </div>
            ) : decryptedText ? (
              decryptedText
            ) : (
              <div className={`flex flex-col gap-1 italic font-mono select-none ${isMe ? "text-slate-400 dark:text-slate-500" : "text-blue-200"}`}>
                <span className={`text-[10px] uppercase font-bold block ${isMe ? "text-slate-500 dark:text-slate-400" : "text-blue-100"}`}>{t("payload_aes_gcm")}</span>
                <span className="truncate max-w-full text-[10px] block font-light font-sans tracking-wide">
                  {msg.encryptedText || "..."}
                </span>
              </div>
            )}
          </div>

          {msg.attachment && myPrivateKeyJWK && (
            <SecureAttachment
              msg={msg}
              myUserId={currentUser.uid}
              myPrivateKeyJWK={myPrivateKeyJWK}
              isMe={isMe}
            />
          )}

          {/* Reactions Display */}
          {msg.reactions && Object.keys(msg.reactions).length > 0 && (
            <div className={`flex flex-wrap gap-1 mt-2 -mb-1`}>
              {Object.entries(msg.reactions).map(([emoji, userIds]) => {
                if (userIds.length === 0) return null;
                const iReacted = userIds.includes(currentUser.uid);
                return (
                  <button
                    key={emoji}
                    onClick={() => onReact(msg.id, emoji)}
                    className={`text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1 border transition ${
                      iReacted 
                        ? (isMe ? "bg-blue-100 dark:bg-blue-900/50 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300" : "bg-blue-800 border-blue-700 text-white") 
                        : (isMe ? "bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300" : "bg-blue-700 border-blue-600 text-blue-100")
                    }`}
                  >
                    <span>{emoji}</span>
                    <span className="font-semibold">{userIds.length}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-1.5 mt-1 text-[9px] text-slate-400 dark:text-slate-500 font-mono uppercase px-1">
          <span>
            {msg.timestamp ? (msg.timestamp.toDate ? msg.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : t("sending")}
          </span>
          {isMe && (() => {
            const readByOthers = msg.readBy && msg.readBy.some(uid => uid !== msg.senderId);
            return (
              <span className="flex items-center" title={readByOthers ? "Read" : "Sent"}>
                {readByOthers ? (
                  <CheckCheck className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                ) : (
                  <Check className="w-3 h-3 text-slate-400" />
                )}
              </span>
            );
          })()}
        </div>


        {/* Explicit Options Button (Hover) */}
        <button
          onClick={(e) => { e.stopPropagation(); setShowOptions(!showOptions); }}
          className={`absolute top-2 ${isMe ? "-left-8" : "-right-8"} p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 opacity-0 group-hover:opacity-100 transition focus:opacity-100`}
        >
          <MoreVertical className="w-4 h-4" />
        </button>

        {/* Options overlay / modal */}
        {showOptions && (
          <div className="absolute z-20 bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700 rounded-xl p-2 top-0 mt-4 flex flex-col gap-1 min-w-[140px]"
            style={{ [isMe ? "right" : "left"]: 0 }}
          >
            <div className="flex justify-between items-center px-2 py-1 border-b border-slate-100 dark:border-slate-700 mb-1">
              <span className="text-[10px] uppercase font-bold text-slate-400">Options</span>
              <button onClick={() => setShowOptions(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold px-1">&times;</button>
            </div>
            
            <div className="flex items-center gap-1 mb-1 px-1 py-1">
              {['👍', '❤️', '😂', '😮', '😢', '🔥'].map(emoji => (
                <button
                  key={emoji}
                  onClick={() => { onReact(msg.id, emoji); setShowOptions(false); }}
                  className="hover:scale-125 transition-transform text-base"
                >
                  {emoji}
                </button>
              ))}
            </div>

            <button
              onClick={() => { onDeleteForMe(msg.id); setShowOptions(false); }}
              className="text-left px-2 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition flex items-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t("delete_for_me", "Delete for me")}
            </button>
            
            {canDeleteForEveryone && (
              <button
                onClick={() => { onDeleteForEveryone(msg.id); setShowOptions(false); }}
                className="text-left px-2 py-1.5 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition flex items-center gap-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {t("delete_for_all", "Delete for everyone")}
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
