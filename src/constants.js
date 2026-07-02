// ── Core domain constants ────────────────────────────────────────────────

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Calendar grid runs from 8:00 to 21:00 (8am – 9pm)
export const GRID_START_HOUR = 8
export const GRID_END_HOUR = 21
export const HOUR_HEIGHT = 38 // px per hour — compact so the full week fits on screen

// Class types
export const CLASS_TYPES = {
  group: { id: 'group', label: 'Group class', billed: true, recurring: true, maxStudents: Infinity },
  oneonone: { id: 'oneonone', label: '1-on-1', billed: false, recurring: true, maxStudents: 1 },
  makeup: { id: 'makeup', label: 'Makeup 1-on-1', billed: false, recurring: false, maxStudents: 1 },
  summer: { id: 'summer', label: 'Summer lessons', billed: false, recurring: false, maxStudents: Infinity },
}

// Performance metrics — measured out of 5 in 0.5 (half-star) intervals
export const METRICS = [
  { key: 'bodyLanguage', label: 'Body Language' },
  { key: 'voiceModulation', label: 'Voice Modulation' },
  { key: 'voiceProjection', label: 'Voice Projection' },
  { key: 'eyeContact', label: 'Eye Contact' },
  { key: 'generalConfidence', label: 'General Confidence' },
  { key: 'contentStructure', label: 'Content Structure' },
  { key: 'easeOfAppearance', label: 'Ease of Appearance' },
  { key: 'audienceEngagement', label: 'Audience Engagement' },
]

// Billing
export const GROUP_CLASS_PRICE = 40 // dollars per session
export const LATE_FEE_RATE = 0.1 // 10%
export const PAYMENT_DUE_DAY = 10 // unpaid after the 10th = outstanding / late

// Summer break: no classes from June 18 to the start of October (inclusive of June 18,
// exclusive of October 1). Recurring classes skip this window and none can be created in it.
export const BREAK_START = { month: 5, day: 18 } // June 18 (month is 0-indexed)
export const BREAK_END = { month: 9, day: 1 } // October 1
