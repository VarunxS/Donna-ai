// ============================================================================
// Mock Calendar Database
// In-memory store for meetings and schedules to avoid Google Calendar OAuth.
// Used by Donna via Gemini Function Calling.
// ============================================================================

const meetings = [];

export function scheduleMeeting(title, contactName, timeString, dateTime) {
  const meeting = {
    id: crypto.randomUUID(),
    title,
    contactName,
    time: timeString, // e.g. "Tomorrow at 3 PM"
    dateTime: dateTime || new Date().toISOString(),
    createdAt: new Date().toISOString()
  };
  meetings.push(meeting);
  return { success: true, message: `Meeting '${title}' scheduled with ${contactName} for ${timeString}.`, meeting };
}

export function getSchedule() {
  if (meetings.length === 0) {
    return { success: true, message: "Your schedule is currently clear. No upcoming meetings.", meetings: [] };
  }
  return { success: true, meetings };
}
