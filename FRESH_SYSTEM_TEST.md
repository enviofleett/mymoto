# 🧪 Fresh System Test - Proactive AI Conversations

**Date:** January 16, 2026  
**Test Scope:** Complete proactive AI conversations system

---

## 📋 Test Checklist

### ✅ **1. Database Schema**
- [ ] `user_ai_chat_preferences` table exists
- [ ] RLS policies are set up
- [ ] Indexes are created
- [ ] Trigger is working

### ✅ **2. Frontend UI**
- [ ] Notification Settings page loads
- [ ] "AI Companion Triggers" section appears
- [ ] Toggle switches work
- [ ] Preferences save to localStorage
- [ ] Preferences sync to database

### ✅ **3. Edge Functions**
- [ ] `handle-vehicle-event` is deployed
- [ ] `morning-briefing` is deployed
- [ ] Functions can be invoked
- [ ] Functions return correct responses

### ✅ **4. Database Webhook**
- [ ] Webhook exists for `proactive_vehicle_events`
- [ ] Webhook points to correct function
- [ ] Webhook triggers on INSERT

### ✅ **5. End-to-End Flow**
- [ ] Event inserted → Webhook triggered → Function called → Message created
- [ ] User preferences are checked
- [ ] LLM generates message
- [ ] Message appears in chat

---

## 🔍 Testing Commands

Run these tests to verify each component:
