I will implement the missing logic and design elements for the Service Directory to ensure a complete loop (Booking -> Fulfillment -> Rating -> Display).

## 1. Logic Implementation (Backend)
- **Enhance `notify-fulfillment` Edge Function**: currently, this function only logs a message. I will update it to:
  - Send an actual email to the user (using `email-service.ts`) confirming the service completion and inviting them to rate the provider.
  - (Optional) Trigger a specific realtime event if the database subscription isn't sufficient.

## 2. Design Implementation (Frontend)
- **Update `OwnerDirectory.tsx`**:
  - Implement fetching and displaying of **Star Ratings** on the provider cards. Currently, the UI shows provider details but hides their reputation score.
  - Calculate average ratings from the `provider_ratings` table and display them alongside the business name.

## 3. Verification
- Verify that completing a booking triggers the email.
- Verify that ratings appear correctly in the directory list.