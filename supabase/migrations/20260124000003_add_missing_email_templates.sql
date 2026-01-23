-- Add missing email templates to email_templates table
-- This allows admin to manage and activate/deactivate these email types

INSERT INTO public.email_templates (template_key, name, description, subject, html_content, variables, sender_id) VALUES
('walletTopUp', 
 'Wallet Top-Up Email', 
 'Sent when a user''s wallet is manually credited by an admin', 
 'Wallet Top-Up: {{amount}} Added to Your Account',
 '<div style="margin-bottom: 24px;">
  <div style="display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; background-color: #10b98115; border-left: 4px solid #10b981; border-radius: 4px; margin-bottom: 16px;">
    <span style="font-size: 20px;">💰</span>
    <span style="color: #10b981; font-weight: 600; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px;">Wallet Credit</span>
  </div>
  <h2 style="margin: 0 0 12px 0; color: #18181b; font-size: 20px; font-weight: 600;">Wallet Top-Up Confirmation</h2>
  <p style="margin: 0 0 16px 0; color: #3f3f46; font-size: 15px; line-height: 1.6;">
    Hello {{userName}},
  </p>
  <p style="margin: 0 0 16px 0; color: #3f3f46; font-size: 15px; line-height: 1.6;">
    Your wallet has been credited with <strong style="color: #10b981;">{{amount}}</strong>.
  </p>
  {{#if description}}
  <p style="margin: 0 0 16px 0; color: #71717a; font-size: 14px;">
    <strong>Reason:</strong> {{description}}
  </p>
  {{/if}}
  {{#if adminName}}
  <p style="margin: 0 0 16px 0; color: #71717a; font-size: 14px;">
    <strong>Processed by:</strong> {{adminName}}
  </p>
  {{/if}}
  <div style="background-color: #f4f4f5; border-radius: 6px; padding: 20px; margin: 20px 0;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding: 8px 0; color: #71717a; font-size: 14px; width: 40%;"><strong>Amount Credited:</strong></td>
        <td style="padding: 8px 0; color: #10b981; font-size: 16px; font-weight: 600;">+{{amount}}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #71717a; font-size: 14px;"><strong>New Balance:</strong></td>
        <td style="padding: 8px 0; color: #18181b; font-size: 16px; font-weight: 600;">{{newBalance}}</td>
      </tr>
    </table>
  </div>
  {{#if walletLink}}
  <div style="text-align: center; margin: 24px 0;">
    <a href="{{walletLink}}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">View Wallet</a>
  </div>
  {{/if}}
  <p style="margin: 16px 0 0 0; color: #71717a; font-size: 13px; line-height: 1.6;">
    This credit has been added to your wallet and is available for use immediately. If you have any questions, please contact our support team.
  </p>
</div>',
 '["userName", "amount", "newBalance", "description", "adminName", "walletLink"]'::jsonb,
 NULL),

('newUserBonusNotification', 
 'New User Bonus Email', 
 'Sent automatically to new users when they receive their registration bonus', 
 'Welcome Bonus: {{bonusAmount}} Added to Your Wallet',
 '<div style="margin-bottom: 24px;">
  <div style="display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; background-color: #3b82f615; border-left: 4px solid #3b82f6; border-radius: 4px; margin-bottom: 16px;">
    <span style="font-size: 20px;">🎁</span>
    <span style="color: #3b82f6; font-weight: 600; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px;">Welcome Bonus</span>
  </div>
  <h2 style="margin: 0 0 16px 0; color: #18181b; font-size: 20px; font-weight: 600;">Welcome to MyMoto Fleet!</h2>
  <p style="margin: 0 0 16px 0; color: #3f3f46; font-size: 15px; line-height: 1.6;">
    Hello {{userName}},
  </p>
  <p style="margin: 0 0 16px 0; color: #3f3f46; font-size: 15px; line-height: 1.6;">
    As a welcome gift, we''ve credited your wallet with <strong style="color: #3b82f6;">{{bonusAmount}}</strong> to get you started!
  </p>
  <div style="background-color: #f4f4f5; border-radius: 6px; padding: 20px; margin: 20px 0;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding: 8px 0; color: #71717a; font-size: 14px; width: 40%;"><strong>Welcome Bonus:</strong></td>
        <td style="padding: 8px 0; color: #3b82f6; font-size: 16px; font-weight: 600;">+{{bonusAmount}}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #71717a; font-size: 14px;"><strong>Current Balance:</strong></td>
        <td style="padding: 8px 0; color: #18181b; font-size: 16px; font-weight: 600;">{{bonusAmount}}</td>
      </tr>
    </table>
  </div>
  {{#if walletLink}}
  <div style="text-align: center; margin: 24px 0;">
    <a href="{{walletLink}}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">View Wallet</a>
  </div>
  {{/if}}
  <p style="margin: 16px 0 0 0; color: #71717a; font-size: 13px; line-height: 1.6;">
    This bonus is available immediately and can be used for any service on the platform. Thank you for choosing MyMoto Fleet!
  </p>
</div>',
 '["userName", "bonusAmount", "walletLink"]'::jsonb,
 NULL)
ON CONFLICT (template_key) DO NOTHING;
