import type { AgentContent } from '@app/ui/components/agent-widget'

// Every string in the agent widget, in Edith's voice.
export const EDITH: AgentContent = {
  launcher: 'ask edith',
  title: 'Edith',
  subtitle: "PJ's internal assistant",
  greeting: {
    title: 'Hi PJ.',
    body: 'Type, or tap the mic to talk. I can ping the server, check its health, and read the recent pings.',
  },
  suggestions: ['Ping the server', 'Is it healthy?', 'What happened recently?'],
  note: 'Edith is an AI. Conversations are recorded in ElevenLabs.',
  input: { placeholder: 'Message Edith', send: 'send' },
  voice: {
    start: 'talk to edith',
    onCall: 'on a call',
    connecting: 'connecting…',
    listening: 'Listening',
    speaking: 'Edith is speaking',
    muted: "You're muted",
    mute: 'mute',
    unmute: 'unmute',
    hangUp: 'hang up',
  },
  controls: { close: 'close', end: 'end', restart: 'new conversation' },
  thinking: 'edith is thinking',
  ended: { title: 'Conversation ended.', body: 'Start a new one whenever you like.' },
  errors: {
    mic: "Edith couldn't use your microphone. You can type instead.",
    busy: 'Edith is busy right now. Try again in a bit.',
    failed: "Edith couldn't connect. Try again.",
    retry: 'try again',
  },
}
