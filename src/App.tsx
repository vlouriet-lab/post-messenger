/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  ShieldCheck, 
  Lock, 
  AlertCircle, 
  Key, 
  RefreshCw, 
  Check, 
  MessageSquare,
  Sparkles,
  Zap,
  CheckCheck,
  Globe,
  Database,
  Shield,
  ShieldAlert,
  LogOut
} from "lucide-react";
import DeviceSyncOverlay from "./components/DeviceSyncOverlay";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { 
  auth, 
  db, 
  logoutUser, 
  onAuthStateChanged,
  getRedirectResult,
  User,
  OperationType,
  handleFirestoreError,
  storage,
  registerFCMToken
} from "./lib/firebase";
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  getDocs,
  limit,
  arrayUnion,
  or
} from "firebase/firestore";
import { 
  generateSecureKeyPair, 
  exportKeyToJWK, 
  importPublicKeyFromJWK, 
  encryptMessage, 
  decryptMessage,
  encryptFile,
  EncryptedPayload,
  getPublicKeyFingerprint
} from "./lib/crypto";
import { AppUser, Chat, Message, CallSignal, AppUserSummary } from "./types";
import CallOverlay from "./components/CallOverlay";
import LoginScreen from "./components/LoginScreen";
import Sidebar from "./components/Sidebar";
import ChatArea from "./components/ChatArea";
import SecurityPanel from "./components/SecurityPanel";
import SettingsToggle from "./components/SettingsToggle";
import { useTranslation } from "react-i18next";

export default function App() {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState<string>("Initializing Secure Environment...");
  const [loginError, setLoginError] = useState<string | null>(null);
  const { t } = useTranslation();

  // Private key state
  const [myPrivateKeyJWK, setMyPrivateKeyJWK] = useState<JsonWebKey | null>(null);
  const [myPrivateKey, setMyPrivateKey] = useState<CryptoKey | null>(null);
  const [isPrivateKeyMissing, setIsPrivateKeyMissing] = useState(false);
  const [showGuestSyncOverlay, setShowGuestSyncOverlay] = useState(false);

  // Messenger State
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  // Security Verification Dialog State
  const [fingerprintVerifyUser, setFingerprintVerifyUser] = useState<AppUser | null>(null);

  // Decryption States
  const [decryptedMessages, setDecryptedMessages] = useState<{ [msgId: string]: string }>({});
  const [decryptionErrors, setDecryptionErrors] = useState<{ [msgId: string]: boolean }>({});
  const [decryptedPreviews, setDecryptedPreviews] = useState<{ [chatId: string]: string }>({});
  const [decrypting, setDecrypting] = useState(false);

  // UI state
  const [showSecurityPanel, setShowSecurityPanel] = useState(false);

  // Call states
  const [incomingCall, setIncomingCall] = useState<CallSignal | null>(null);
  const [activeCall, setActiveCall] = useState<CallSignal | null>(null);
  const [callHistory, setCallHistory] = useState<CallSignal[]>([]);

  // Deep-link processing
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const openChat = searchParams.get('openChat');
    const callId = searchParams.get('callId');
    const callAction = searchParams.get('callAction');
    // const callType = searchParams.get('callType') as 'audio' | 'video' || 'audio';

    if (openChat) {
      setActiveChatId(openChat);
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    if (callId && callAction === 'accept') {
      sessionStorage.setItem('autoAcceptCallId', callId);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // 1. Auth state monitor
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setCurrentUser(null);
        setMyPrivateKeyJWK(null);
        setChats([]);
        setMessages([]);
        setActiveChatId(null);
        setLoading(false);
        return;
      }

      setLoadingStatus("Auth successful. Processing user login...");
      await handleUserLogin(firebaseUser);
      // Request and register FCM Token for background notifications
      registerFCMToken(firebaseUser.uid);
    });

    return () => unsubscribe();
  }, []);

  // 2. Handle login & key provisioning
  const handleUserLogin = async (firebaseUser: User) => {
    setLoading(true);
    setLoadingStatus("Fetching user data from database...");
    setLoginError(null);
    try {
      const userRef = doc(db, "users", firebaseUser.uid);
      let userSnap;
      try {
        userSnap = await getDoc(userRef);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`);
        return;
      }

      setLoadingStatus("Reading local cryptographic keys...");

      let keyPairJWK = null;
      let pubKeyJWK: JsonWebKey | null = null;
      
      // Try to read Private Key from IndexedDB
      const localPrivKey = await import("./lib/crypto").then(m => m.getPrivateKeyFromIDB(firebaseUser.uid));
      if (localPrivKey) {
        try {
          const jwk = await import("./lib/crypto").then(m => m.exportKeyToJWK(localPrivKey));
          setMyPrivateKey(localPrivKey);
          setMyPrivateKeyJWK(jwk);
          setIsPrivateKeyMissing(false);
        } catch (e) {
          console.error("Failed to parse private key from IndexedDB", e);
        }
      }

      if (userSnap.exists()) {
        setLoadingStatus("User found. Verifying keys...");
        const data = userSnap.data() as AppUser;
        pubKeyJWK = data.publicKeyJWK;

        if (!pubKeyJWK) {
          setLoadingStatus("Keys not found. Generating new keypair...");
          const keys = await generateKeysAndSave(firebaseUser.uid);
          pubKeyJWK = keys.pub;
          setMyPrivateKey(keys.privKey);
          setMyPrivateKeyJWK(keys.priv);
        } else if (!localPrivKey) {
          // Public key exists in cloud but Private key is missing locally
          setIsPrivateKeyMissing(true);
          setShowGuestSyncOverlay(true);
        }

        // Update User info in Firestore
        setLoadingStatus("Updating profile...");
        const updatedUser: AppUser = {
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "Secure Agent",
          email: firebaseUser.email || "",
          photoURL: firebaseUser.photoURL || "",
          publicKeyJWK: pubKeyJWK,
          lastSeen: serverTimestamp(),
          isOnline: true
        };

        try {
          await setDoc(userRef, updatedUser, { merge: true });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${firebaseUser.uid}`);
          return;
        }
        setCurrentUser(updatedUser);
      } else {
        // Brand new user registration
        setLoadingStatus("New user registration. Generating keypair...");
        const keys = await generateKeysAndSave(firebaseUser.uid);
        
        const newUser: AppUser = {
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "Secure Agent",
          email: firebaseUser.email || "",
          photoURL: firebaseUser.photoURL || "",
          publicKeyJWK: keys.pub,
          lastSeen: serverTimestamp(),
          isOnline: true
        };

        try {
          setLoadingStatus("Saving new user profile...");
          await setDoc(userRef, newUser);
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${firebaseUser.uid}`);
          return;
        }
        setMyPrivateKeyJWK(keys.priv);
        setIsPrivateKeyMissing(false);
        setCurrentUser(newUser);
      }
    } catch (err: any) {
      console.error("Login handling error:", err);
      setLoginError(err.message || "An error occurred during security key validation.");
      await logoutUser();
    } finally {
      setLoading(false);
    }
  };

  // Helper: Generates RSA KeyPair, exports to JWK, saves public to firestore schema, saves private to IndexedDB
  const generateKeysAndSave = async (userId: string) => {
    const cryptoLib = await import("./lib/crypto");
    const keyPair = await cryptoLib.generateSecureKeyPair();
    const pubJWK = await cryptoLib.exportKeyToJWK(keyPair.publicKey);
    const privJWK = await cryptoLib.exportKeyToJWK(keyPair.privateKey);

    await cryptoLib.savePrivateKeyToIDB(userId, keyPair.privateKey);
    return { pub: pubJWK, priv: privJWK, privKey: keyPair.privateKey };
  };

  // Online status tracker
  useEffect(() => {
    if (!currentUser) return;
    
    const updatePresence = async (isOnline: boolean) => {
      try {
        await updateDoc(doc(db, "users", currentUser.uid), {
          isOnline,
          lastSeen: serverTimestamp()
        });
      } catch (e) {}
    };

    const handleVisibilityChange = () => {
      updatePresence(document.visibilityState === "visible");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    
    // Heartbeat every 2 minutes
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        updatePresence(true);
      }
    }, 120000);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(interval);
      updatePresence(false);
    };
  }, [currentUser]);

  // 3. Listen to Chats
  useEffect(() => {
    if (!currentUser) return;

    const chatsRef = collection(db, "chats");
    const q = query(
      chatsRef,
      where("participants", "array-contains", currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const activeChats: Chat[] = [];
      snapshot.forEach((doc) => {
        const chatData = doc.data() as Omit<Chat, "id">;
        activeChats.push({
          id: doc.id,
          ...chatData
        });
      });

      // Sort chats by last updated
      activeChats.sort((a, b) => {
        const timeA = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : 0;
        const timeB = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : 0;
        return timeB - timeA;
      });

      setChats(activeChats);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "chats");
    });

    return () => unsubscribe();
  }, [currentUser]);

  // 3.5 Listen to all calls (incoming and outgoing)
  useEffect(() => {
    if (!currentUser) return;
    const callsRef = collection(db, "calls");
    const q = query(
      callsRef,
      or(
        where("calleeId", "==", currentUser.uid),
        where("callerId", "==", currentUser.uid)
      )
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Update call history
      const history: CallSignal[] = [];
      snapshot.forEach(docSnap => {
        history.push({ id: docSnap.id, ...docSnap.data() } as CallSignal);
      });
      setCallHistory(history.sort((a, b) => b.timestamp - a.timestamp));

      snapshot.docChanges().forEach((change) => {
        const callData = { id: change.doc.id, ...change.doc.data() } as CallSignal;
        
        if (change.type === "added" || change.type === "modified") {
          const isCaller = callData.callerId === currentUser.uid;
          const isCallee = callData.calleeId === currentUser.uid;

          if (["ended", "rejected", "missed"].includes(callData.status)) {
            setIncomingCall(prev => prev?.id === callData.id ? null : prev);
            setActiveCall(prev => prev?.id === callData.id ? { ...prev, status: callData.status } : prev);
            
            // Automatically clear the call after 2 seconds to unmount the overlay
            setTimeout(() => {
              setIncomingCall(prev => prev?.id === callData.id ? null : prev);
              setActiveCall(prev => prev?.id === callData.id ? null : prev);
            }, 2000);
            return;
          }

          if (isCallee) {
            setIncomingCall(callData);
            if (callData.status === "calling") {
              // Auto update to ringing
              updateDoc(doc(db, "calls", callData.id), { status: "ringing" }).catch(e => console.error(e));
            }
            if (sessionStorage.getItem('autoAcceptCallId') === callData.id && (callData.status === 'calling' || callData.status === 'ringing')) {
              sessionStorage.removeItem('autoAcceptCallId');
              updateDoc(doc(db, "calls", callData.id), { status: "connecting" }).catch(e => console.error(e));
            }
          }

          if (isCaller) {
            setActiveCall(callData);
          }
        }
      });
    });
    return () => unsubscribe();
  }, [currentUser]);

  // 4. Decrypt Previews in Sidebar
  useEffect(() => {
    if (!currentUser || !myPrivateKeyJWK || chats.length === 0) return;

    const decryptPreviews = async () => {
      const newPreviews: { [chatId: string]: string } = {};

      for (const chat of chats) {
        if (!chat.lastMessage) continue;
        if (chat.lastMessage.isSystem) {
          newPreviews[chat.id] = chat.lastMessage.textPreview;
          continue;
        }

        // We need to fetch the actual last message document to decrypt it
        // To keep it light, we retrieve the last 15 messages and find the most recent one that is NOT deleted or cleared
        try {
          const msgRef = collection(db, "chats", chat.id, "messages");
          const q = query(msgRef, orderBy("timestamp", "desc"), limit(15));
          let snap;
          try {
            snap = await getDocs(q);
          } catch (fsErr) {
            handleFirestoreError(fsErr, OperationType.GET, `chats/${chat.id}/messages`);
            continue;
          }

          if (snap && !snap.empty) {
            const clearedAtTimestamp = chat.clearedAt?.[currentUser.uid] || null;
            let validMsgData = null;

            for (const doc of snap.docs) {
              const data = doc.data() as Message;
              
              // Skip if deleted for this user
              if (data.deletedFor && data.deletedFor.includes(currentUser.uid)) {
                continue;
              }
              
              // Skip if before clearedAt
              if (clearedAtTimestamp && data.timestamp && typeof clearedAtTimestamp.toMillis === 'function' && typeof data.timestamp.toMillis === 'function') {
                if (data.timestamp.toMillis() <= clearedAtTimestamp.toMillis()) {
                  continue;
                }
              }
              
              validMsgData = data;
              break; // Found the latest valid message
            }

            if (validMsgData) {
              if (validMsgData.isSystem) {
                newPreviews[chat.id] = validMsgData.systemText || "";
              } else if (validMsgData.encryptedText && validMsgData.iv && validMsgData.encryptedKeys) {
                const decrypted = await decryptMessage(
                  {
                    encryptedText: validMsgData.encryptedText,
                    iv: validMsgData.iv,
                    encryptedKeys: validMsgData.encryptedKeys
                  },
                  currentUser.uid,
                  myPrivateKeyJWK
                );
                newPreviews[chat.id] = decrypted;
              }
            } else {
              newPreviews[chat.id] = "History cleared";
            }
          }
        } catch (e) {
          // If decryption fails (e.g. no private key), fallback to encrypted text preview
          newPreviews[chat.id] = "🔒 Encrypted Message";
        }
      }

      setDecryptedPreviews((prev) => ({ ...prev, ...newPreviews }));
    };

    decryptPreviews();
  }, [chats, currentUser, myPrivateKeyJWK]);

  // 5. Listen to Active Chat's Messages
  useEffect(() => {
    if (!currentUser || !activeChatId) {
      setMessages([]);
      return;
    }

    const messagesRef = collection(db, "chats", activeChatId, "messages");
    const q = query(messagesRef, orderBy("timestamp", "asc"));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const list: Message[] = [];
      snapshot.forEach((doc) => {
        const msgData = doc.data() as Omit<Message, "id">;
        list.push({
          id: doc.id,
          ...msgData
        });
      });

      setMessages(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `chats/${activeChatId}/messages`);
    });

    return () => unsubscribe();
  }, [activeChatId, currentUser]);

  // 6. Decrypt Active Chat Messages on receipt
  useEffect(() => {
    if (!currentUser || !myPrivateKeyJWK || messages.length === 0) return;

    const decryptAll = async () => {
      setDecrypting(true);
      const decMap: { [msgId: string]: string } = { ...decryptedMessages };
      const errMap: { [msgId: string]: boolean } = { ...decryptionErrors };

      for (const msg of messages) {
        if (msg.isSystem || decMap[msg.id] || errMap[msg.id]) continue;

        if (msg.encryptedText && msg.iv && msg.encryptedKeys) {
          try {
            const payload: EncryptedPayload = {
              encryptedText: msg.encryptedText,
              iv: msg.iv,
              encryptedKeys: msg.encryptedKeys
            };
            if (!payload.encryptedKeys[currentUser.uid]) continue;
            const decrypted = await import("./lib/crypto").then(m => m.decryptMessage(payload, currentUser.uid, myPrivateKey));
            decMap[msg.id] = decrypted;
            errMap[msg.id] = false;
          } catch (err) {
            console.error(`Failed to decrypt message ${msg.id}:`, err);
            errMap[msg.id] = true;
          }
        }
      }

      setDecryptedMessages(decMap);
      setDecryptionErrors(errMap);
      setDecrypting(false);
    };

    decryptAll();
  }, [messages, currentUser, myPrivateKey]);

  // Initiate a new Chat / select existing chat with an AppUser
  const handleStartNewDirectChat = async (targetUser: AppUser): Promise<string | null> => {
    if (!currentUser) return null;

    try {
      // Check if chat already exists
      const chatsRef = collection(db, "chats");
      // Since Firestore doesn't easily support dual equality checks inside 'array-contains', 
      // we look up chats containing current user first, then filter locally
      const q = query(chatsRef, where("participants", "array-contains", currentUser.uid));
      let querySnap;
      try {
        querySnap = await getDocs(q);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, "chats");
        return null;
      }
      
      let existingChatId: string | null = null;
      querySnap.forEach((doc) => {
        const chatData = doc.data() as Chat;
        if (chatData.participants.includes(targetUser.uid) && chatData.participants.length === 2) {
          existingChatId = doc.id;
        }
      });

      if (existingChatId) {
        setActiveChatId(existingChatId);
        return existingChatId;
      }

      // Create a brand new Chat channel
      const chatSummaryCurrent = {
        uid: currentUser.uid,
        displayName: currentUser.displayName,
        email: currentUser.email,
        photoURL: currentUser.photoURL,
        publicKeyJWK: currentUser.publicKeyJWK
      };

      const chatSummaryTarget = {
        uid: targetUser.uid,
        displayName: targetUser.displayName,
        email: targetUser.email,
        photoURL: targetUser.photoURL,
        publicKeyJWK: targetUser.publicKeyJWK
      };

      const newChatData = {
        participants: [currentUser.uid, targetUser.uid],
        participantDetails: {
          [currentUser.uid]: chatSummaryCurrent,
          [targetUser.uid]: chatSummaryTarget
        },
        lastMessage: {
          textPreview: "🔑 Secure E2EE channel created.",
          senderId: "system",
          timestamp: serverTimestamp(),
          isSystem: true
        },
        updatedAt: serverTimestamp()
      };

      let chatDocRef;
      try {
        chatDocRef = await addDoc(chatsRef, newChatData);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, "chats");
        return null;
      }

      // Add initial system message under messages subcollection
      const messagesSubRef = collection(db, "chats", chatDocRef.id, "messages");
      try {
        await addDoc(messagesSubRef, {
          senderId: "system",
          timestamp: serverTimestamp(),
          isSystem: true,
          systemText: "🔑 Secure connection established. Keys exchanged safely."
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `chats/${chatDocRef.id}/messages`);
        return null;
      }

      setActiveChatId(chatDocRef.id);
      return chatDocRef.id;
    } catch (err) {
      console.error("Failed to start chat:", err);
      return null;
    }
  };

  // Initiate a new Group Chat
  const handleStartNewGroupChat = async (groupName: string, selectedUsers: AppUser[]): Promise<string | null> => {
    if (!currentUser || selectedUsers.length < 2) return null;

    try {
      const chatsRef = collection(db, "chats");
      
      const participantDetails: Record<string, AppUserSummary> = {
        [currentUser.uid]: {
          uid: currentUser.uid,
          displayName: currentUser.displayName,
          email: currentUser.email,
          photoURL: currentUser.photoURL,
          publicKeyJWK: currentUser.publicKeyJWK
        }
      };

      const participantIds = [currentUser.uid];

      for (const user of selectedUsers) {
        participantIds.push(user.uid);
        participantDetails[user.uid] = {
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
          photoURL: user.photoURL,
          publicKeyJWK: user.publicKeyJWK
        };
      }

      const newChatData = {
        participants: participantIds,
        participantDetails,
        isGroup: true,
        groupName: groupName,
        lastMessage: {
          textPreview: "🔑 Secure E2EE group created.",
          senderId: "system",
          timestamp: serverTimestamp(),
          isSystem: true
        },
        updatedAt: serverTimestamp()
      };

      const chatDocRef = await addDoc(chatsRef, newChatData);

      const messagesSubRef = collection(db, "chats", chatDocRef.id, "messages");
      await addDoc(messagesSubRef, {
        senderId: "system",
        timestamp: serverTimestamp(),
        isSystem: true,
        systemText: "🔑 Secure group established. Keys exchanged safely."
      });

      setActiveChatId(chatDocRef.id);
      return chatDocRef.id;
    } catch (err) {
      console.error("Failed to start group chat:", err);
      return null;
    }
  };

  // Send E2EE message
  const handleSendMessage = async (text: string, fileAttachment?: any) => {
    if (!currentUser || !activeChatId || !myPrivateKey) return;

    const chat = chats.find((c) => c.id === activeChatId);
    if (!chat) return;

    const recipients = chat.participants.map(uid => {
      const targetUser = chat.participantDetails[uid];
      return {
        userId: uid,
        publicKeyJWK: targetUser?.publicKeyJWK as JsonWebKey
      };
    });

    if (recipients.some(r => !r.publicKeyJWK)) {
      alert("One or more recipients are missing public keys. Unable to complete E2EE tunnel.");
      return;
    }

    try {
      // 2. Encrypt message locally using hybrid RSA-AES
      const payload = await encryptMessage(text || "Sent an attachment.", recipients);

      // 3. Handle File Attachment
      let finalAttachmentData: any = undefined;

      if (fileAttachment) {
        const file = fileAttachment as File;
        setLoadingStatus("Encrypting attachment...");
        
        const { encryptedBlob, iv, encryptedKeys } = await encryptFile(file, recipients);
        
        const attachmentRef = ref(storage, `attachments/${activeChatId}/${Date.now()}_${file.name}`);
        setLoadingStatus("Uploading secure attachment...");
        
        const metadata = {
          customMetadata: {
            participants: chat.participants.join(",")
          }
        };
        const uploadTask = uploadBytesResumable(attachmentRef, encryptedBlob, metadata);
        
        await new Promise<void>((resolve, reject) => {
          uploadTask.on('state_changed', 
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setLoadingStatus(`Uploading secure attachment... ${Math.round(progress)}%`);
            },
            (error) => reject(error),
            () => resolve()
          );
        });

        const downloadUrl = await getDownloadURL(attachmentRef);
        finalAttachmentData = {
          name: file.name,
          type: file.type,
          size: file.size,
          url: downloadUrl,
          iv: iv,
          encryptedKeys: encryptedKeys
        };
        setLoadingStatus("");
      }

      // 4. Create message document in Firestore
      const msgData: any = {
        senderId: currentUser.uid,
        timestamp: serverTimestamp(),
        encryptedText: payload.encryptedText,
        iv: payload.iv,
        encryptedKeys: payload.encryptedKeys,
        readBy: []
      };

      if (finalAttachmentData) {
        msgData.attachment = finalAttachmentData;
      }

      const messagesSubRef = collection(db, "chats", activeChatId, "messages");
      try {
        await addDoc(messagesSubRef, msgData);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `chats/${activeChatId}/messages`);
        return;
      }

      // 4. Update the chat summary with textPreview, senderId, updatedAt
      const chatRef = doc(db, "chats", activeChatId);
      try {
        await updateDoc(chatRef, {
          lastMessage: {
            textPreview: text ? "🔒 Encrypted Message" : "📎 Secure Attachment",
            senderId: currentUser.uid,
            timestamp: serverTimestamp(),
            isSystem: false
          },
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `chats/${activeChatId}`);
        return;
      }
    } catch (err) {
      console.error("Failed to encrypt and send message:", err);
      throw err;
    }
  };

  const handleDeleteForMe = async (msgId: string) => {
    if (!currentUser || !activeChatId) return;
    try {
      const msgRef = doc(db, "chats", activeChatId, "messages", msgId);
      await updateDoc(msgRef, {
        deletedFor: arrayUnion(currentUser.uid)
      });
    } catch (err) {
      console.error("Failed to delete message for me:", err);
    }
  };

  const handleDeleteForEveryone = async (msgId: string) => {
    if (!currentUser || !activeChatId) return;
    try {
      const msgRef = doc(db, "chats", activeChatId, "messages", msgId);
      await updateDoc(msgRef, {
        isDeletedForEveryone: true,
        encryptedText: null, // Clear payload
        encryptedKeys: null, // Clear keys
        iv: null,
        attachment: null // Clear attachment metadata
      });
    } catch (err) {
      console.error("Failed to delete message for everyone:", err);
    }
  };

  const handleReact = async (msgId: string, emoji: string) => {
    if (!currentUser || !activeChatId) return;
    try {
      const msgRef = doc(db, "chats", activeChatId, "messages", msgId);
      
      // We will handle array manipulation properly. Let's fetch current reactions or use a transaction.
      // Since we just have the state locally, we can determine if we need to add or remove.
      const chatMessages = messages; // `messages` is state from App.tsx, but it's not directly accessible here with the latest value safely.
      // Wait, we can fetch the doc first or we can use arrayUnion / arrayRemove if we restructure the data.
      // Actually, since reactions are small, we can get the document, update it and write it back.
      const msg = chatMessages.find(m => m.id === msgId);
      if (!msg) return;

      const currentReactions = msg.reactions || {};
      const usersReactedWithEmoji = currentReactions[emoji] || [];
      const hasReacted = usersReactedWithEmoji.includes(currentUser.uid);

      let newUsers = [...usersReactedWithEmoji];
      if (hasReacted) {
        newUsers = newUsers.filter(uid => uid !== currentUser.uid);
      } else {
        newUsers.push(currentUser.uid);
      }

      await updateDoc(msgRef, {
        [`reactions.${emoji}`]: newUsers
      });
    } catch (err) {
      console.error("Failed to react to message:", err);
    }
  };

  // Key regeneration handling (Danger Zone)
  const handleGenerateNewKeys = async () => {
    if (!currentUser) return;
    try {
      const keys = await generateKeysAndSave(currentUser.uid);
      setMyPrivateKey(keys.privKey);
      setMyPrivateKeyJWK(keys.priv);
      setIsPrivateKeyMissing(false);

      // Update in Firestore
      const userRef = doc(db, "users", currentUser.uid);
      try {
        await updateDoc(userRef, {
          publicKeyJWK: keys.pub
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
        return;
      }

      // Update current user state
      setCurrentUser((prev) => prev ? { ...prev, publicKeyJWK: keys.pub } : null);

      // For all active chats where I am a participant, update participantDetails public key!
      // This is dynamic and handles key rotation gracefully!
      for (const chat of chats) {
        const chatRef = doc(db, "chats", chat.id);
        const updatedDetails = { ...chat.participantDetails };
        if (updatedDetails[currentUser.uid]) {
          updatedDetails[currentUser.uid].publicKeyJWK = keys.pub;
        }
        try {
          await updateDoc(chatRef, {
            participantDetails: updatedDetails
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `chats/${chat.id}`);
          return;
        }
      }

      alert("Encryption keys successfully rotated. Your new keys are now active.");
    } catch (err) {
      console.error("Failed to rotate encryption keys:", err);
    }
  };

  // Key import handling
  const handleImportPrivateKey = async (importedJWK: JsonWebKey): Promise<boolean> => {
    if (!currentUser) return false;
    try {
      // For safety verification, let's verify if the imported private key matches the public key in Firestore
      // We can verify by importing both and checking they form a mathematical keypair, or testing a tiny encryption-decryption loop!
      // This is incredibly robust!
      const pubKey = await importPublicKeyFromJWK(currentUser.publicKeyJWK!);
      
      // Let's test encrypting a tiny message with the public key and decrypting with the imported private key
      const testText = "key-verification-probe";
      const recipients = [{ userId: currentUser.uid, publicKeyJWK: currentUser.publicKeyJWK! }];
      const payload = await encryptMessage(testText, recipients);
      
      try {
        const importedKey = await import("./lib/crypto").then(m => m.importPrivateKeyFromJWK(importedJWK));
        const decrypted = await import("./lib/crypto").then(m => m.decryptMessage(payload, currentUser.uid, importedKey));
        if (decrypted === testText) {
          // Success! Private key matches public key perfectly
          await import("./lib/crypto").then(m => m.savePrivateKeyToIDB(currentUser.uid, importedKey));
          setMyPrivateKey(importedKey);
          setMyPrivateKeyJWK(importedJWK);
          setIsPrivateKeyMissing(false);
          return true;
        }
      } catch (decError) {
        console.error("Imported key mathematical test failed:", decError);
      }
      return false;
    } catch (err) {
      console.error("Failed to verify imported key:", err);
      return false;
    }
  };

  const handleLogout = async () => {
    await logoutUser();
  };

  const handleStartCall = async (type: "audio" | "video", targetId: string) => {
    if (!currentUser) return;
    try {
      const callsRef = collection(db, "calls");
      const callDoc = await addDoc(callsRef, {
        callerId: currentUser.uid,
        calleeId: targetId,
        type,
        status: "calling",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setActiveCall({
        id: callDoc.id,
        callerId: currentUser.uid,
        calleeId: targetId,
        type,
        status: "calling"
      });
    } catch (e) {
      console.error("Failed to start call", e);
    }
  };

return (
    <div className="w-full h-full bg-slate-50 dark:bg-slate-900 flex flex-col overflow-hidden text-slate-900 dark:text-slate-100 font-sans select-none transition-colors duration-300 relative">
      
      {/* Global Top-Right Controls (Moved to Sidebar) */}

      {/* 1. Loading State */}
      {loading && (
        <div className="fixed inset-0 z-50 bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center p-4 transition-colors duration-300">
          <div className="relative mb-6">
            <div className="w-16 h-16 rounded-2xl bg-blue-600/20 flex items-center justify-center animate-pulse">
              <Shield className="w-8 h-8 text-blue-500" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-slate-50 dark:bg-slate-900 rounded-full flex items-center justify-center">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
            </div>
          </div>
          <span className="text-sm font-semibold tracking-wide text-slate-800 dark:text-slate-200">{t("securing_env")}</span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-1 uppercase tracking-widest text-center max-w-xs">{loadingStatus}</span>
        </div>
      )}

      {/* 2. Login View */}
      {!currentUser && !loading && (
        <LoginScreen 
          onLoginStart={() => setLoading(true)}
          onLoginError={(err) => { setLoginError(err); setLoading(false); }}
          loginError={loginError}
        />
      )}

      {/* Login Error Notification Banner */}
      {loginError && (
        <div className="bg-rose-600 text-white font-bold px-4 py-2 flex items-center justify-between text-xs z-50 shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{loginError}</span>
          </div>
          <button onClick={() => setLoginError(null)} className="text-[10px] uppercase underline cursor-pointer">{t("close") || "Dismiss"}</button>
        </div>
      )}

      {/* 3. Main Messenger Frame */}
      {currentUser && !loading && (
        <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden relative">
          
          {/* Missing Private Key Alert Banner */}
          {isPrivateKeyMissing && (
            <div className="absolute top-0 left-0 right-0 z-20 bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 text-xs font-medium border-b border-amber-200 dark:border-amber-800 shadow-sm transition-colors duration-300">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div>
                  <span className="font-bold block leading-snug text-amber-900 dark:text-amber-100">{t("private_key_missing")}</span>
                  <span className="text-[11px] text-amber-700 dark:text-amber-300 leading-normal">{t("private_key_desc")}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowSecurityPanel(true)}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold transition flex items-center gap-1 leading-none shadow-sm cursor-pointer"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>{t("restore_rotate")}</span>
                </button>
              </div>
            </div>
          )}

          {/* Sidebar Area */}
          <div className={`h-full ${activeChatId ? 'hidden md:flex' : 'flex w-full'} flex-col md:w-80 flex-shrink-0`}>
            <Sidebar
              currentUser={currentUser}
              chats={chats}
              activeChatId={activeChatId}
              onSelectChat={(id) => setActiveChatId(id)}
              onOpenSecurityPanel={() => setShowSecurityPanel(true)}
              onLogout={handleLogout}
              onStartNewDirectChat={handleStartNewDirectChat}
              onStartNewGroupChat={handleStartNewGroupChat}
              decryptedPreviews={decryptedPreviews}
            />
          </div>

          {/* Active Chat / Welcome Panel Area */}
          {activeChatId ? (
            <ChatArea
              chat={chats.find((c) => c.id === activeChatId)!}
              currentUser={currentUser}
              onBack={() => setActiveChatId(null)}
              messages={(() => {
                const activeChat = chats.find((c) => c.id === activeChatId)!;
                const activeChatClearedAt = activeChat.clearedAt?.[currentUser.uid];
                // Map calls for this chat
                const chatCalls = callHistory.filter(call => 
                  !activeChat.isGroup && // Calls are 1-1 only currently
                  ((call.callerId === currentUser.uid && activeChat.participants.includes(call.calleeId)) ||
                   (call.calleeId === currentUser.uid && activeChat.participants.includes(call.callerId)))
                ).map(call => {
                  const callTs = call.timestamp;
                  const callMsg: Message = {
                    id: call.id,
                    senderId: call.callerId,
                    timestamp: { toDate: () => new Date(callTs), toMillis: () => callTs },
                    isSystem: true,
                    isCall: true,
                    callStatus: call.status,
                    callType: call.type,
                    callDuration: call.status === 'ended' && call.answer?.timestamp ? (callTs - call.answer.timestamp) : 0
                  };
                  return callMsg;
                });

                let combined = [...messages, ...chatCalls];
                
                if (activeChatClearedAt) {
                  const clearedTs = activeChatClearedAt.toMillis ? activeChatClearedAt.toMillis() : new Date(activeChatClearedAt).getTime();
                  combined = combined.filter(m => {
                    const mTs = m.timestamp?.toMillis ? m.timestamp.toMillis() : new Date(m.timestamp).getTime();
                    return mTs > clearedTs;
                  });
                }
                
                return combined.sort((a, b) => {
                  const aTs = a.timestamp?.toMillis ? a.timestamp.toMillis() : new Date(a.timestamp).getTime();
                  const bTs = b.timestamp?.toMillis ? b.timestamp.toMillis() : new Date(b.timestamp).getTime();
                  return aTs - bTs;
                });
              })()}
              myPrivateKeyJWK={myPrivateKeyJWK}
              onSendMessage={handleSendMessage}
              onVerifyFingerprint={setFingerprintVerifyUser}
              onStartCall={handleStartCall}
              decryptedMessages={decryptedMessages}
              decryptionErrors={decryptionErrors}
              decrypting={decrypting}
              onDeleteForMe={handleDeleteForMe}
              onDeleteForEveryone={handleDeleteForEveryone}
              onReact={handleReact}
            />
          ) : (
            <div className="flex-1 hidden md:flex flex-col items-center justify-center p-8 text-center bg-slate-50 dark:bg-slate-900 select-none transition-colors duration-300">
              <div className="relative mb-6">
                <div className="w-20 h-20 rounded-3xl bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 flex items-center justify-center shadow-inner relative transition-colors duration-300">
                  <Lock className="w-10 h-10 text-blue-600 dark:text-blue-400 stroke-[1.5]" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center transition-colors duration-300">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>

              <h2 className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-200">{t("app_name")}</h2>
              <p className="text-xs text-blue-600 dark:text-blue-400 font-mono mt-1 uppercase tracking-widest font-semibold">{t("client_side_encrypted")}</p>
              
              <p className="max-w-sm text-xs text-slate-400 dark:text-slate-500 leading-relaxed mt-4">
                {t("welcome_desc")}
              </p>

              {/* Bento Quickstats strictly conforming to architectural honesty */}
              <div className="grid grid-cols-2 gap-4 max-w-sm w-full mt-8">
                <div className="p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-left shadow-sm transition-colors duration-300">
                  <div className="flex items-center gap-1.5 text-[10px] text-blue-600 dark:text-blue-400 font-mono font-bold uppercase">
                    <Database className="w-3.5 h-3.5" />
                    <span>{t("active_storage")}</span>
                  </div>
                  <span className="text-xs text-slate-700 dark:text-slate-300 font-semibold block mt-1.5">{t("firestore_schema")}</span>
                </div>
                <div className="p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-left shadow-sm transition-colors duration-300">
                  <div className="flex items-center gap-1.5 text-[10px] text-blue-600 dark:text-blue-400 font-mono font-bold uppercase">
                    <Globe className="w-3.5 h-3.5" />
                    <span>{t("connection")}</span>
                  </div>
                  <span className="text-xs text-slate-700 dark:text-slate-300 font-semibold block mt-1.5">{t("ssl_confirmed")}</span>
                </div>
              </div>
            </div>
          )}

          {/* Security & Key management Panel */}
          {showSecurityPanel && (
            <SecurityPanel
              currentUser={currentUser}
              myPrivateKeyJWK={myPrivateKeyJWK}
              myPrivateKey={myPrivateKey}
              onClose={() => setShowSecurityPanel(false)}
              onGenerateNewKeys={handleGenerateNewKeys}
              onImportPrivateKey={handleImportPrivateKey}
            />
          )}

          {/* Verification Code Fingerprint Dialog */}
          {fingerprintVerifyUser && currentUser && (
            <FingerprintVerifyDialog
              targetUser={fingerprintVerifyUser}
              currentUser={currentUser as AppUser}
              onClose={() => setFingerprintVerifyUser(null)}
            />
          )}

          {/* Guest Device Sync Overlay */}
          {showGuestSyncOverlay && (
            <DeviceSyncOverlay
              mode="guest"
              currentUser={currentUser}
              onComplete={async (unwrappedKey) => {
                setShowGuestSyncOverlay(false);
                if (unwrappedKey && currentUser) {
                  await import("./lib/crypto").then(m => m.savePrivateKeyToIDB(currentUser.uid, unwrappedKey));
                  const privKeyJWK = await import("./lib/crypto").then(m => m.exportKeyToJWK(unwrappedKey));
                  setMyPrivateKey(unwrappedKey);
                  setMyPrivateKeyJWK(privKeyJWK);
                  setIsPrivateKeyMissing(false);
                }
              }}
              onCancel={() => setShowGuestSyncOverlay(false)}
            />
          )}

        </div>
      )}

      {/* Global Call Overlay */}
      {(() => {
        const currentCallContext = activeCall || incomingCall;
        if (!currentCallContext || !currentUser) return null;
        let callContact: AppUser | null = null;
        const otherUid = currentCallContext.callerId === currentUser.uid ? currentCallContext.calleeId : currentCallContext.callerId;
        for (const chat of chats) {
          if (chat.participantDetails[otherUid]) {
            callContact = chat.participantDetails[otherUid] as AppUser;
            break;
          }
        }

        return (
          <CallOverlay 
            isOpen={true} 
            callType={activeCall ? activeCall.type : (incomingCall?.type || "audio")} 
            contact={callContact} 
            currentUser={currentUser} 
            onClose={() => {
              if (activeCall) {
                updateDoc(doc(db, "calls", activeCall.id), { status: "ended" }).catch(() => {});
              }
              if (incomingCall) {
                updateDoc(doc(db, "calls", incomingCall.id), { status: "rejected" }).catch(() => {});
              }
              setActiveCall(null);
              setIncomingCall(null);
            }}
            activeCall={activeCall}
            incomingCall={incomingCall}
          />
        );
      })()}

    </div>
  );
}

// Inline Helper component for Fingerprint verification
interface FingerprintVerifyDialogProps {
  targetUser: AppUser;
  currentUser: AppUser;
  onClose: () => void;
}

function FingerprintVerifyDialog({ targetUser, currentUser, onClose }: FingerprintVerifyDialogProps) {
  const [targetFP, setTargetFP] = useState("Loading...");
  const [currentFP, setCurrentFP] = useState("Loading...");
  const [copiedFp, setCopiedFp] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    const calc = async () => {
      if (targetUser.publicKeyJWK) {
        const fp = await getPublicKeyFingerprint(targetUser.publicKeyJWK);
        setTargetFP(fp);
      }
      if (currentUser.publicKeyJWK) {
        const fp = await getPublicKeyFingerprint(currentUser.publicKeyJWK);
        setCurrentFP(fp);
      }
    };
    calc();
  }, [targetUser, currentUser]);

  const handleCopy = () => {
    const textToCopy = `Safety Codes:\n- ${currentUser.displayName}: ${currentFP}\n- ${targetUser.displayName}: ${targetFP}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedFp(true);
    setTimeout(() => setCopiedFp(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm font-sans transition-colors duration-300">
      <div className="w-full max-w-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl p-6 shadow-2xl relative transition-colors duration-300">
        <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
          <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          {t("verify_connection_fingerprint", "Verify Connection Fingerprint")}
        </h2>
        <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
          {t("verify_codes_desc", "Verify safety codes with")} <strong>{targetUser.displayName}</strong> {t("guarantee_tamper", "to guarantee no one has tampered with or replaced your certificates.")}
        </p>

        <div className="mt-4 space-y-3">
          <div className="bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors duration-300">
            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase font-bold">{t("your_fingerprint")} ({currentUser.displayName})</span>
            <div className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400 mt-1 select-all">{currentFP}</div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors duration-300">
            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase font-bold">{t("recipient_fingerprint", "Recipient Fingerprint")} ({targetUser.displayName})</span>
            <div className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400 mt-1 select-all">{targetFP}</div>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={handleCopy}
            className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 text-xs text-slate-700 dark:text-slate-200 font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
          >
            {copiedFp ? (
              <>
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>{t("copied_codes", "Copied Codes!")}</span>
              </>
            ) : (
              <>
                <CheckCheck className="w-4 h-4" />
                <span>{t("copy_safety_codes", "Copy Safety Codes")}</span>
              </>
            )}
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs text-white font-bold transition cursor-pointer shadow-md shadow-blue-100 dark:shadow-none"
          >
            {t("verified_confirmed", "Verified & Confirmed")}
          </button>
        </div>
      </div>
    </div>
  );
}
