# AI Memory Test Questions - Vehicle T-23695LA
## Comprehensive Test Suite for Trip Memory & Intelligence

**Vehicle:** T-23695LA  
**Test Date:** January 15, 2025  
**Purpose:** Verify AI's ability to remember and recall trip details accurately

---

## 📋 PRE-TEST SETUP

### Step 1: Run Data Analysis Queries
Before testing, run the queries in `TEST_AI_MEMORY_T23695LA.sql` to understand:
- Trip patterns and dates
- Distance ranges
- Speed patterns
- Time patterns

### Step 2: Note Key Data Points
Record these for reference:
- Total trips in last 30 days: _____
- Longest trip distance: _____ km
- Fastest trip speed: _____ km/h
- Most active day: _____
- Average daily trips: _____

---

## 🧪 TEST CATEGORIES

### Category 1: Recent Trip Memory (Today/Yesterday)

**Test 1.1: Today's Trips**
```
Question: "How many trips did I make today?"
Expected: AI should count today's trips accurately
```

**Test 1.2: Yesterday's Activity**
```
Question: "Did I travel yesterday?"
Expected: AI should check yesterday's trips and respond accurately
```

**Test 1.3: First Trip Today**
```
Question: "What time was my first trip today?"
Expected: AI should identify the earliest trip start time
```

**Test 1.4: Last Trip Today**
```
Question: "When was my last trip today?"
Expected: AI should identify the most recent trip end time
```

**Test 1.5: Today's Distance**
```
Question: "How far did I travel today?"
Expected: AI should sum all trip distances for today
```

---

### Category 2: Historical Trip Details (Date-Specific)

**Test 2.1: Specific Date**
```
Question: "How many trips did I make on [specific date, e.g., January 12]?"
Expected: AI should filter trips by that exact date
```

**Test 2.2: Day Name Reference**
```
Question: "What trips did I make on Monday?"
Expected: AI should identify Monday trips (most recent or last week)
```

**Test 2.3: Days Ago Reference**
```
Question: "How far did I travel 3 days ago?"
Expected: AI should calculate distance for trips from 3 days ago
```

**Test 2.4: Last Week Summary**
```
Question: "What was my total distance last week?"
Expected: AI should sum all trips from last week
```

**Test 2.5: This Month Summary**
```
Question: "How many trips have I made this month?"
Expected: AI should count all trips from current month
```

---

### Category 3: Trip Comparison & Patterns

**Test 3.1: Longest Trip**
```
Question: "What was my longest trip in the last 30 days?"
Expected: AI should identify trip with maximum distance
```

**Test 3.2: Fastest Trip**
```
Question: "What was my fastest trip?"
Expected: AI should identify trip with highest max_speed_kmh
```

**Test 3.3: Trip Comparison**
```
Question: "Did I travel more today or yesterday?"
Expected: AI should compare total distances
```

**Test 3.4: Average Trip Distance**
```
Question: "What's my average trip distance?"
Expected: AI should calculate average from recent trips
```

**Test 3.5: Most Active Day**
```
Question: "Which day did I make the most trips?"
Expected: AI should identify day with highest trip count
```

---

### Category 4: Contextual Memory (Follow-up Questions)

**Test 4.1: Follow-up on Previous Question**
```
Question 1: "How many trips did I make yesterday?"
Question 2: "What was the longest one?"
Expected: AI should remember "yesterday" context and find longest trip from yesterday
```

**Test 4.2: Sequential Context**
```
Question 1: "Tell me about my trips today"
Question 2: "What about the first one?"
Expected: AI should remember today's trips and identify the first one
```

**Test 4.3: Comparative Follow-up**
```
Question 1: "How far did I travel today?"
Question 2: "Is that more than yesterday?"
Expected: AI should compare today's distance with yesterday's
```

**Test 4.4: Detail Follow-up**
```
Question 1: "What trips did I make on Monday?"
Question 2: "What was the total distance?"
Expected: AI should remember Monday context and calculate total
```

---

### Category 5: Pattern Recognition

**Test 5.1: Time Pattern**
```
Question: "What time do I usually start my first trip?"
Expected: AI should identify common start times
```

**Test 5.2: Day Pattern**
```
Question: "Which day of the week do I travel most?"
Expected: AI should analyze trips by day of week
```

**Test 5.3: Distance Pattern**
```
Question: "What's my typical trip distance?"
Expected: AI should provide average or most common distance range
```

**Test 5.4: Speed Pattern**
```
Question: "Do I usually drive fast or slow?"
Expected: AI should analyze speed patterns
```

---

### Category 6: Complex Queries (Multi-Criteria)

**Test 6.1: Date + Distance**
```
Question: "Did I travel more than 50km yesterday?"
Expected: AI should check yesterday's total distance
```

**Test 6.2: Date + Speed**
```
Question: "What was my fastest speed last week?"
Expected: AI should find max speed from last week's trips
```

**Test 6.3: Date + Count**
```
Question: "How many trips did I make that were longer than 10km in the last 7 days?"
Expected: AI should filter by date, distance, and count
```

**Test 6.4: Comparison Across Periods**
```
Question: "Did I travel more this week or last week?"
Expected: AI should compare weekly totals
```

---

### Category 7: Typo Tolerance (Spell Checking)

**Test 7.1: Common Typos**
```
Question: "How meny trips did I make yestaday?"
Expected: AI should correct "meny" → "many", "yestaday" → "yesterday"
```

**Test 7.2: Distance Typos**
```
Question: "What was my longst trip?"
Expected: AI should correct "longst" → "longest"
```

**Test 7.3: Date Typos**
```
Question: "How far did I travl on Mondy?"
Expected: AI should correct "travl" → "travel", "Mondy" → "Monday"
```

---

### Category 8: Edge Cases & Boundaries

**Test 8.1: No Trips Scenario**
```
Question: "How many trips did I make on [date with no trips]?"
Expected: AI should respond that no trips were recorded
```

**Test 8.2: Very Recent Trip**
```
Question: "What was my last trip?" (asked immediately after a trip)
Expected: AI should identify the most recent trip
```

**Test 8.3: Boundary Date**
```
Question: "How many trips did I make 30 days ago?"
Expected: AI should handle boundary of 30-day memory window
```

**Test 8.4: Missing Data**
```
Question: "Where did my trip start?" (for trip with 0,0 coordinates)
Expected: AI should handle gracefully and explain missing location data
```

---

### Category 9: Semantic Memory (RAG Testing)

**Test 9.1: Similar Question Recall**
```
Question 1: "What was my longest trip last week?"
[Wait 5 minutes]
Question 2: "Tell me about that long trip I asked about earlier"
Expected: AI should recall the previous conversation about longest trip
```

**Test 9.2: Related Context**
```
Question 1: "I made 5 trips yesterday"
Question 2: "What was the total distance for those trips?"
Expected: AI should use context from previous message
```

---

### Category 10: Natural Language Variations

**Test 10.1: Casual Language**
```
Question: "Did I go anywhere today?"
Expected: AI should interpret as asking about trips today
```

**Test 10.2: Formal Language**
```
Question: "Please provide a summary of my travel activities for yesterday"
Expected: AI should provide comprehensive summary
```

**Test 10.3: Question Variations**
```
Question 1: "How many trips today?"
Question 2: "What's my trip count for today?"
Question 3: "Did I make any trips today?"
Expected: All should return same information about today's trips
```

---

## 📊 TESTING WORKFLOW

### Phase 1: Basic Memory Tests (5-10 minutes)
1. Start with Category 1 (Recent Trips)
2. Test Category 2 (Historical Details)
3. Verify AI can access trip data correctly

### Phase 2: Advanced Memory Tests (10-15 minutes)
4. Test Category 3 (Comparisons)
5. Test Category 4 (Follow-up Questions)
6. Verify context retention

### Phase 3: Intelligence Tests (10-15 minutes)
7. Test Category 5 (Pattern Recognition)
8. Test Category 6 (Complex Queries)
9. Verify AI can analyze patterns

### Phase 4: Edge Cases (5-10 minutes)
10. Test Category 7 (Typo Tolerance)
11. Test Category 8 (Edge Cases)
12. Verify graceful error handling

### Phase 5: Semantic Memory (5-10 minutes)
13. Test Category 9 (RAG/Semantic Memory)
14. Verify AI remembers past conversations

---

## ✅ SUCCESS CRITERIA

### Memory Accuracy
- ✅ AI correctly identifies trip counts for specific dates
- ✅ AI accurately calculates distances and speeds
- ✅ AI remembers context across follow-up questions
- ✅ AI handles date references correctly (yesterday, last week, etc.)

### Intelligence
- ✅ AI recognizes patterns (time of day, day of week)
- ✅ AI can compare trips across different periods
- ✅ AI provides meaningful insights, not just raw data

### User Experience
- ✅ AI handles typos gracefully
- ✅ AI provides clear, conversational responses
- ✅ AI explains when data is missing
- ✅ AI maintains context across conversation

---

## 📝 TEST RESULTS TEMPLATE

```
Test Date: ___________
Tester: ___________
Vehicle: T-23695LA

Category 1 - Recent Trips:
  Test 1.1: [ ] Pass [ ] Fail - Notes: ___________
  Test 1.2: [ ] Pass [ ] Fail - Notes: ___________
  ...

Category 2 - Historical Details:
  Test 2.1: [ ] Pass [ ] Fail - Notes: ___________
  ...

Overall Assessment:
  Memory Accuracy: [ ] Excellent [ ] Good [ ] Needs Improvement
  Intelligence: [ ] Excellent [ ] Good [ ] Needs Improvement
  User Experience: [ ] Excellent [ ] Good [ ] Needs Improvement

Issues Found:
  1. ___________
  2. ___________
  3. ___________

Recommendations:
  ___________
  ___________
```

---

## 🎯 QUICK TEST SET (5 Questions)

If you want a quick test, try these 5 questions:

1. **"How many trips did I make today?"**
2. **"What was my longest trip yesterday?"**
3. **"Did I travel more today or yesterday?"**
4. **"What time did I start my first trip today?"**
5. **"Tell me about my trips last week"**

These cover: recent memory, historical details, comparison, time queries, and period summaries.

---

## 💡 TIPS FOR TESTING

1. **Start Simple:** Begin with basic questions before complex ones
2. **Test Follow-ups:** Ask related questions to test context retention
3. **Try Typos:** Test the spell checking we implemented
4. **Check Dates:** Verify AI understands "yesterday", "last week", etc.
5. **Test Boundaries:** Try dates with no trips, very recent trips, etc.
6. **Note Patterns:** See if AI recognizes your travel patterns
7. **Test Memory:** Ask about something, then ask a follow-up later

---

**Good luck with your testing!** 🚀
