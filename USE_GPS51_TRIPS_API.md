# Use GPS51 querytrips API Directly

## Problem
- We're detecting trips from position_history, but GPS51 uses ACC on/off status
- All ignition_on values in position_history are false (1212 positions, 0 true)
- Our detected trips don't match GPS51's trips

## Solution
Use GPS51's `querytrips` API directly (section 6.1) to get trips that match GPS51 exactly.

## GPS51 querytrips API
According to GPS51 API docs section 6.1:
- Action: `querytrips`
- Parameters:
  - `deviceid`: Device ID
  - `begintime`: Start time (yyyy-MM-dd HH:mm:ss)
  - `endtime`: End time (yyyy-MM-dd HH:mm:ss)
  - `timezone`: Time zone (default GMT+8)

- Response:
  - `deviceid`: Device ID
  - `totalmaxspeed`: Maximum speed (m/h)
  - `totaldistance`: Total mileage (meter)
  - `totalaveragespeed`: Average speed (m/h)
  - `totaltriptime`: Total time (ms)
  - `totaltrips`: List of trips

## Trip Fields from GPS51
Each trip in `totaltrips` should have:
- Start time
- End time
- Distance
- Speed data
- Coordinates

## Implementation Plan
1. Add function to call GPS51 `querytrips` API
2. Map GPS51 trip data to our `vehicle_trips` format
3. Store trips in database
4. This ensures 100% match with GPS51 platform
