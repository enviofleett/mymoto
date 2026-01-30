export interface EmailLayout {
  id: string;
  name: string;
  description: string;
  thumbnail: string; // CSS class for a colored box or preview
  generateHtml: (props: EmailContentProps) => string;
}

export interface EmailContentProps {
  headline?: string;
  body: string; // Can be HTML
  callToAction?: {
    text: string;
    url: string;
  };
  footerText?: string;
}

const baseStyles = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  line-height: 1.6;
  color: #334155;
`;

export const emailLayouts: EmailLayout[] = [
  {
    id: 'modern-bright',
    name: 'Modern Bright',
    description: 'Clean white background with subtle borders. Professional and friendly.',
    thumbnail: 'bg-white border border-gray-200',
    generateHtml: ({ headline, body, callToAction, footerText }) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MyMoto Fleet</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; color: #0f172a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0;">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 40px; text-align: center; border-bottom: 1px solid #f1f5f9;">
              <h1 style="margin: 0; color: #0f172a; font-size: 24px; font-weight: 700; letter-spacing: -0.025em;">MyMoto Fleet</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              ${headline ? `<h2 style="margin: 0 0 24px 0; color: #1e293b; font-size: 20px; font-weight: 600;">${headline}</h2>` : ''}
              <div style="color: #475569; font-size: 16px; line-height: 1.6;">
                ${body}
              </div>
              ${callToAction ? `
                <div style="margin-top: 32px; text-align: center;">
                  <a href="${callToAction.url}" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 16px;">${callToAction.text}</a>
                </div>
              ` : ''}
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #64748b; font-size: 13px;">
                ${footerText || "MyMoto Fleet Management System"}
              </p>
              <p style="margin: 8px 0 0 0; color: #94a3b8; font-size: 12px;">
                Automated notification • Do not reply
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `
  },
  {
    id: 'corporate-clean',
    name: 'Corporate Clean',
    description: 'Gray background with a centered white card. Traditional and trustworthy.',
    thumbnail: 'bg-gray-100 border border-gray-300',
    generateHtml: ({ headline, body, callToAction, footerText }) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MyMoto Fleet</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #e5e7eb; color: #1f2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 4px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #1f2937; padding: 24px; text-align: left;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 500;">MyMoto Fleet</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              ${headline ? `<h2 style="margin: 0 0 20px 0; color: #111827; font-size: 22px; font-weight: 700;">${headline}</h2>` : ''}
              <div style="color: #374151; font-size: 16px; line-height: 1.6;">
                ${body}
              </div>
              ${callToAction ? `
                <div style="margin-top: 32px;">
                  <a href="${callToAction.url}" style="display: inline-block; background-color: #1f2937; color: #ffffff; padding: 14px 28px; border-radius: 4px; text-decoration: none; font-weight: 500; font-size: 15px;">${callToAction.text}</a>
                </div>
              ` : ''}
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px;">
                ${footerText || "MyMoto Fleet Management System"}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `
  },
  {
    id: 'minimalist',
    name: 'Minimalist',
    description: 'Simple, distraction-free design focusing purely on the message.',
    thumbnail: 'bg-white border-none',
    generateHtml: ({ headline, body, callToAction, footerText }) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MyMoto Fleet</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #ffffff; color: #171717;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0">
          <!-- Header -->
          <tr>
            <td style="padding-bottom: 32px; border-bottom: 2px solid #171717;">
              <h1 style="margin: 0; color: #171717; font-size: 24px; font-weight: 800; letter-spacing: -0.05em;">MYMOTO FLEET</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 0;">
              ${headline ? `<h2 style="margin: 0 0 24px 0; color: #171717; font-size: 28px; font-weight: 700; letter-spacing: -0.02em;">${headline}</h2>` : ''}
              <div style="color: #404040; font-size: 18px; line-height: 1.6;">
                ${body}
              </div>
              ${callToAction ? `
                <div style="margin-top: 40px;">
                  <a href="${callToAction.url}" style="display: inline-block; border: 2px solid #171717; color: #171717; padding: 12px 32px; text-decoration: none; font-weight: 700; font-size: 16px; transition: all 0.2s;">${callToAction.text} &rarr;</a>
                </div>
              ` : ''}
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding-top: 40px; border-top: 1px solid #e5e5e5; color: #737373; font-size: 14px;">
              <p style="margin: 0;">${footerText || "MyMoto Fleet Management System"}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `
  }
];
