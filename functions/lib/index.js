"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onCallUpdated = exports.onMessageCreated = exports.onCallCreated = void 0;
const functions = require("firebase-functions/v2");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();
exports.onCallCreated = functions.firestore.onDocumentCreated("calls/{callId}", async (event) => {
    var _a, _b;
    const snapshot = event.data;
    if (!snapshot)
        return;
    const callData = snapshot.data();
    const calleeId = callData.calleeId;
    const callerId = callData.callerId;
    if (!calleeId || !callerId)
        return;
    try {
        // Get caller info
        const callerDoc = await db.collection("users").doc(callerId).get();
        const callerName = callerDoc.exists ? (_a = callerDoc.data()) === null || _a === void 0 ? void 0 : _a.displayName : "Unknown Caller";
        // Get callee tokens
        const calleeDoc = await db.collection("users").doc(calleeId).get();
        if (!calleeDoc.exists)
            return;
        const tokens = ((_b = calleeDoc.data()) === null || _b === void 0 ? void 0 : _b.fcmTokens) || [];
        if (tokens.length === 0) {
            console.log(`No FCM tokens for callee ${calleeId}`);
            return;
        }
        const payload = {
            notification: {
                title: "📞 Входящий звонок",
                body: `От: ${callerName}`,
            },
            android: {
                priority: "high",
                notification: {
                    sound: "default",
                    channelId: "calls",
                    defaultSound: true,
                    defaultVibrateTimings: true,
                    priority: "max",
                    visibility: "public",
                }
            },
            apns: {
                payload: {
                    aps: {
                        sound: "default",
                        category: "CALL",
                    }
                }
            },
            webpush: {
                headers: {
                    Urgency: "high"
                }
            },
            data: {
                callId: snapshot.id,
                type: "call",
                callType: callData.type || "audio"
            }
        };
        const response = await messaging.sendEachForMulticast(Object.assign({ tokens }, payload));
        console.log(`Successfully sent ${response.successCount} messages; Failed: ${response.failureCount}`);
    }
    catch (err) {
        console.error("Error sending call notification:", err);
    }
});
exports.onMessageCreated = functions.firestore.onDocumentCreated("chats/{chatId}/messages/{msgId}", async (event) => {
    var _a;
    const snapshot = event.data;
    if (!snapshot)
        return;
    const msgData = snapshot.data();
    const senderId = msgData.senderId;
    const chatId = event.params.chatId;
    // Don't send push for system messages
    if (msgData.isSystem)
        return;
    try {
        // Get chat doc to find participants
        const chatDoc = await db.collection("chats").doc(chatId).get();
        if (!chatDoc.exists)
            return;
        const chatData = chatDoc.data();
        const participants = (chatData === null || chatData === void 0 ? void 0 : chatData.participants) || [];
        // Find all recipients (everyone except sender)
        const recipientIds = participants.filter(uid => uid !== senderId);
        for (const recipientId of recipientIds) {
            const userDoc = await db.collection("users").doc(recipientId).get();
            if (!userDoc.exists)
                continue;
            const tokens = ((_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.fcmTokens) || [];
            if (tokens.length === 0)
                continue;
            const payload = {
                notification: {
                    title: "💬 Новое сообщение",
                    body: "🔒 Зашифрованное сообщение",
                },
                android: {
                    priority: "high",
                    notification: {
                        sound: "default",
                        channelId: "messages",
                        defaultSound: true,
                        priority: "high",
                    }
                },
                apns: {
                    payload: {
                        aps: {
                            sound: "default",
                            category: "MESSAGE",
                        }
                    }
                },
                webpush: {
                    headers: {
                        Urgency: "high"
                    }
                },
                data: {
                    chatId,
                    type: "message"
                }
            };
            await messaging.sendEachForMulticast(Object.assign({ tokens }, payload));
        }
    }
    catch (err) {
        console.error("Error sending message notification:", err);
    }
});
exports.onCallUpdated = functions.firestore.onDocumentUpdated("calls/{callId}", async (event) => {
    var _a, _b;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    if (!before || !after)
        return;
    const oldStatus = before.status;
    const newStatus = after.status;
    // We only care when the call transitions to an ended state
    if (["ended", "rejected", "missed"].includes(newStatus) && !["ended", "rejected", "missed"].includes(oldStatus)) {
        const callerId = after.callerId;
        const calleeId = after.calleeId;
        const type = after.type;
        const duration = after.duration || 0;
        try {
            const chatsSnapshot = await db.collection("chats")
                .where("isGroup", "==", false)
                .where("participants", "array-contains", callerId)
                .get();
            let targetChatId = null;
            for (const doc of chatsSnapshot.docs) {
                const data = doc.data();
                if (data.participants.includes(calleeId)) {
                    targetChatId = doc.id;
                    break;
                }
            }
            if (!targetChatId)
                return;
            let text = "Звонок завершён";
            if (newStatus === "rejected")
                text = "Звонок отклонён";
            if (newStatus === "missed")
                text = "Пропущенный звонок";
            const systemMsg = {
                senderId: callerId,
                systemText: text,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                isSystem: true,
                systemAction: "call",
                callType: type,
                callDuration: duration,
                status: "sent"
            };
            await db.collection("chats").doc(targetChatId).collection("messages").add(systemMsg);
            await db.collection("chats").doc(targetChatId).update({
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                lastMessage: text,
                lastMessageSenderId: callerId
            });
            console.log(`Successfully added call history to chat ${targetChatId}`);
        }
        catch (err) {
            console.error("Error adding call history:", err);
        }
    }
});
//# sourceMappingURL=index.js.map