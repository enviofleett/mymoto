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
    description: 'Blank canvas',
    thumbnail: 'bg-white border border-gray-200',
    generateHtml: ({ body }) => `
      ${body}
    `
  },
  {
    id: 'corporate-clean',
    name: 'Corporate Clean',
    description: 'Blank canvas',
    thumbnail: 'bg-gray-100 border border-gray-300',
    generateHtml: ({ body }) => `
      ${body}
    `
  },
  {
    id: 'minimalist',
    name: 'Minimalist',
    description: 'Blank canvas',
    thumbnail: 'bg-white border-none',
    generateHtml: ({ body }) => `
      ${body}
    `
  }
];
