export interface LocationMarkerData {
  lat: number
  lng: number
  address: string
}

export type MessagePart =
  | string
  | { type: 'location'; data: LocationMarkerData }
  | { type: 'trip_table'; markdown: string }

export function parseMessageParts(content: string): MessagePart[] {
  const markerRegex = /\[LOCATION:\s*([\d.-]+),\s*([\d.-]+),\s*"([^"]+)"\]|\[TRIP_TABLE:(.*?)\]/gs
  const parts: MessagePart[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = markerRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index))
    }

    if (match[1] && match[2] && match[3]) {
      parts.push({
        type: 'location',
        data: {
          lat: parseFloat(match[1]),
          lng: parseFloat(match[2]),
          address: match[3],
        },
      })
    } else {
      parts.push({
        type: 'trip_table',
        markdown: (match[4] || '').trim(),
      })
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex))
  }

  return parts
}

export function cleanMapLinks(text: string): string {
  return text.replace(/\[Open in Maps\]\([^)]+\)/g, '').trim()
}
