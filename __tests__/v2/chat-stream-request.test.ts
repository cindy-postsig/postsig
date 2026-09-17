import { parseChatStreamBody } from '@/lib/v2/chat/stream-request';

const userMessage = {
  id: 'u1',
  role: 'user',
  parts: [{ type: 'text', text: 'How much do we spend on AWS?' }],
};

describe('parseChatStreamBody', () => {
  it('accepts a session id plus one user message and keeps the original object', () => {
    const result = parseChatStreamBody({
      sessionId: 12,
      message: userMessage,
      context: 'Contract 12',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.sessionId).toBe(12);
    expect(result.body.message).toBe(userMessage);
    expect(result.body.context).toBe('Contract 12');
  });

  it('leaves context undefined when the client sends none', () => {
    const result = parseChatStreamBody({ sessionId: 12, message: userMessage });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.context).toBeUndefined();
  });

  it.each(['system', 'assistant', 'tool'])(
    'rejects a %s-role message',
    (role) => {
      const result = parseChatStreamBody({
        sessionId: 12,
        message: { ...userMessage, role },
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toContain('message.role');
    },
  );

  it('rejects a conversation array in place of the single message', () => {
    const result = parseChatStreamBody({
      sessionId: 12,
      messages: [userMessage],
    });

    expect(result.ok).toBe(false);
  });

  it.each([
    ['no body', undefined],
    ['no session id', { message: userMessage }],
    ['a string session id', { sessionId: '12', message: userMessage }],
    ['a negative session id', { sessionId: -1, message: userMessage }],
    ['no message', { sessionId: 12 }],
    [
      'an empty message id',
      { sessionId: 12, message: { ...userMessage, id: '' } },
    ],
    [
      'a message without parts',
      { sessionId: 12, message: { id: 'u1', role: 'user' } },
    ],
    [
      'non-array parts',
      { sessionId: 12, message: { ...userMessage, parts: 'hi' } },
    ],
    [
      'a part without a type',
      { sessionId: 12, message: { ...userMessage, parts: [{ text: 'hi' }] } },
    ],
  ])('rejects a request with %s', (_label, body) => {
    expect(parseChatStreamBody(body).ok).toBe(false);
  });

  it('rejects a non-string context', () => {
    const result = parseChatStreamBody({
      sessionId: 12,
      message: userMessage,
      context: { role: 'system' },
    });

    expect(result.ok).toBe(false);
  });
});
