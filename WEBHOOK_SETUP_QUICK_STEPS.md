# 🔗 Database Webhook Setup - Quick Steps

## 📍 Location
**Supabase Dashboard → Database → Webhooks** (or **Integrations → Database Webhooks**)

---

## ⚡ Quick Setup (5 Steps)

### **1. Click "Create a new webhook"**

### **2. Fill in Basic Settings:**
- **Name:** `proactive-event-to-chat`
- **Table:** `proactive_vehicle_events`
- **Events:** ✅ `INSERT` (uncheck others)

### **3. Configure HTTP Request:**
- **Method:** `POST`
- **URL:** 
  ```
  https://cmvpnsqiefbsqkwnraka.supabase.co/functions/v1/handle-vehicle-event
  ```
  ⚠️ **Must start with `https://`!**

### **4. Add Headers:**
Click **"+ Add a new header"** twice:

**Header 1:**
- Key: `Content-Type`
- Value: `application/json`

**Header 2:**
- Key: `Authorization`
- Value: `Bearer [YOUR_SERVICE_ROLE_KEY]`
  
  Get key from: **Dashboard → Settings → API → service_role**

### **5. Click "Create webhook"**

---

## ✅ Done!

The webhook will now automatically trigger `handle-vehicle-event` whenever a new event is inserted into `proactive_vehicle_events`.

---

## 🧪 Test It:
```sql
INSERT INTO proactive_vehicle_events (
  device_id, event_type, severity, title, message
) VALUES (
  'YOUR_DEVICE_ID', 'ignition_on', 'info', 'Test', 'Test event'
);
```

Then check `vehicle_chat_history` for the AI message!
