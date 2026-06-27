import Anthropic from '@anthropic-ai/sdk'

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'

// Structured-output schema — the model must return exactly this shape.
const NOTES_SCHEMA = {
  type: 'object',
  properties: {
    classGoals: {
      type: 'array',
      description: 'Shared objectives for the whole class (e.g. "finish the speech draft").',
      items: { type: 'string' },
    },
    classNotes: {
      type: 'string',
      description: 'General observations about the whole class session. Empty string if none.',
    },
    students: {
      type: 'array',
      description: 'Per-student items, only for students mentioned in the notes.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: "The student's name as written in the notes." },
          goals: { type: 'array', items: { type: 'string' } },
          notes: { type: 'string', description: "Observations about this student's presentation. Empty string if none." },
        },
        required: ['name', 'goals', 'notes'],
        additionalProperties: false,
      },
    },
  },
  required: ['classGoals', 'classNotes', 'students'],
  additionalProperties: false,
}

const SYSTEM = `You transcribe a public-speaking tutor's handwritten class notes from a photo and organize them for their records.

Read the handwriting carefully and sort the content into:
- classGoals: objectives that apply to the whole class.
- classNotes: general observations about the session as a whole.
- students[]: for each student the notes mention, their individual goals and any notes about their presentation.

Rules:
- Match student names to the provided roster when the handwriting is close (e.g. "Jordn" -> "Jordan"). Use the roster's spelling. If a name isn't on the roster, use the written name as-is.
- Only include students who actually appear in the notes. Do not invent students, goals, or notes.
- Do NOT produce numeric ratings or scores — the teacher enters those manually.
- If something is illegible, omit it rather than guessing wildly.
- Keep each goal concise (a short phrase). Notes can be a sentence or two.`

// Dev fallback so the whole UI flow is testable with no key and no cost.
function devMock(context) {
  const roster = context.roster || []
  const students = roster.slice(0, 3).map((s, i) => ({
    name: s.name,
    goals: [['Project to the back row', 'Reduce filler words', 'Stronger opening line'][i % 3]],
    notes: ['Good eye contact; pace was a little fast.', 'Confident posture, work on vocal variety.', 'Great energy — tighten the conclusion.'][i % 3],
  }))
  return {
    classGoals: ['Finish the first speech draft', 'Pick speech topics for next month'],
    classNotes: '[DEV MOCK — set ANTHROPIC_API_KEY for real parsing] Strong session overall; class is gaining confidence.',
    students,
  }
}

// imageBase64: raw base64 (no data: prefix). mediaType: e.g. "image/jpeg".
export async function parseNotes({ imageBase64, mediaType, context }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { result: devMock(context), mock: true, model: 'dev-mock' }
  }

  const client = new Anthropic()
  const rosterList = (context.roster || []).map((s) => `- ${s.name}`).join('\n') || '(no students on roster)'

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          {
            type: 'text',
            text: `Class: ${context.className || 'Untitled class'}\nDate: ${context.date || 'unknown'}\n\nRoster:\n${rosterList}\n\nTranscribe and organize the handwritten notes in this photo.`,
          },
        ],
      },
    ],
    output_config: { format: { type: 'json_schema', schema: NOTES_SCHEMA } },
  })

  const text = response.content.find((b) => b.type === 'text')?.text || '{}'
  return { result: JSON.parse(text), mock: false, model: MODEL }
}
