import { describe, it, expect } from 'vitest';
import { 
  formatHarmonyMessage, 
  formatPartialHarmonyMessage, 
  formatToolResponseMessage,
  normalizeStopTokens 
} from './format-harmony-message';
import { HARMONY_TOKENS, HARMONY_CHANNELS, HARMONY_ROLES, CONSTRAINT_TYPES } from '../constants';

describe('formatHarmonyMessage', () => {
  it('should format basic message without channel', () => {
    const result = formatHarmonyMessage({
      role: HARMONY_ROLES.USER,
      content: 'Hello world'
    });
    expect(result).toBe(`${HARMONY_TOKENS.START}user${HARMONY_TOKENS.MESSAGE}Hello world${HARMONY_TOKENS.END}`);
  });

  it('should format message with channel', () => {
    const result = formatHarmonyMessage({
      role: HARMONY_ROLES.ASSISTANT,
      content: 'Analyzing the request',
      channel: HARMONY_CHANNELS.ANALYSIS
    });
    expect(result).toBe(`${HARMONY_TOKENS.START}assistant${HARMONY_TOKENS.CHANNEL}analysis${HARMONY_TOKENS.MESSAGE}Analyzing the request${HARMONY_TOKENS.END}`);
  });

  it('should format message with channel and recipient', () => {
    const result = formatHarmonyMessage({
      role: HARMONY_ROLES.ASSISTANT,
      content: '{"location": "Tokyo"}',
      channel: HARMONY_CHANNELS.COMMENTARY,
      recipient: 'functions.get_weather'
    });
    expect(result).toBe(`${HARMONY_TOKENS.START}assistant${HARMONY_TOKENS.CHANNEL}commentary to=functions.get_weather${HARMONY_TOKENS.MESSAGE}{"location": "Tokyo"}${HARMONY_TOKENS.END}`);
  });

  it('should format message with constrain type', () => {
    const result = formatHarmonyMessage({
      role: HARMONY_ROLES.ASSISTANT,
      content: '{"location": "Tokyo"}',
      channel: HARMONY_CHANNELS.COMMENTARY,
      recipient: 'functions.get_weather',
      constrainType: CONSTRAINT_TYPES.JSON
    });
    expect(result).toBe(`${HARMONY_TOKENS.START}assistant${HARMONY_TOKENS.CHANNEL}commentary to=functions.get_weather ${HARMONY_TOKENS.CONSTRAIN}json${HARMONY_TOKENS.MESSAGE}{"location": "Tokyo"}${HARMONY_TOKENS.END}`);
  });

  it('should format system message', () => {
    const result = formatHarmonyMessage({
      role: HARMONY_ROLES.SYSTEM,
      content: 'You are ChatGPT, a large language model trained by OpenAI.'
    });
    expect(result).toBe(`${HARMONY_TOKENS.START}system${HARMONY_TOKENS.MESSAGE}You are ChatGPT, a large language model trained by OpenAI.${HARMONY_TOKENS.END}`);
  });

  it('should format tool message', () => {
    const result = formatHarmonyMessage({
      role: 'functions.get_weather',
      content: '{"sunny": true, "temperature": 20}',
      channel: HARMONY_CHANNELS.COMMENTARY,
      recipient: 'assistant'
    });
    expect(result).toBe(`${HARMONY_TOKENS.START}functions.get_weather to=assistant${HARMONY_TOKENS.CHANNEL}commentary${HARMONY_TOKENS.MESSAGE}{"sunny": true, "temperature": 20}${HARMONY_TOKENS.END}`);
  });
});

describe('formatPartialHarmonyMessage', () => {
  it('should format partial message without channel', () => {
    const result = formatPartialHarmonyMessage('assistant');
    expect(result).toBe('<|start|>assistant');
  });

  it('should format partial message with channel', () => {
    const result = formatPartialHarmonyMessage(HARMONY_ROLES.ASSISTANT, HARMONY_CHANNELS.ANALYSIS);
    expect(result).toBe(`${HARMONY_TOKENS.START}assistant${HARMONY_TOKENS.CHANNEL}analysis`);
  });
});

describe('formatToolResponseMessage', () => {
  it('should format a tool response correctly', () => {
    const result = formatToolResponseMessage('functions.lookup_weather', '{"temp": 25}');
    
    expect(result).toContain('functions.lookup_weather to=assistant');
    expect(result).toContain('commentary');
    expect(result).toContain('{"temp": 25}');
  });
});

describe('normalizeStopTokens', () => {
  it('should replace RETURN token with END token', () => {
    const content = `Some content${HARMONY_TOKENS.RETURN}`;
    const result = normalizeStopTokens(content);
    
    expect(result).toBe(`Some content${HARMONY_TOKENS.END}`);
  });

  it('should replace CALL token with END token', () => {
    const content = `Tool call content${HARMONY_TOKENS.CALL}`;
    const result = normalizeStopTokens(content);
    
    expect(result).toBe(`Tool call content${HARMONY_TOKENS.END}`);
  });

  it('should not modify content without stop tokens', () => {
    const content = `Normal content${HARMONY_TOKENS.END}`;
    const result = normalizeStopTokens(content);
    
    expect(result).toBe(content);
  });
});