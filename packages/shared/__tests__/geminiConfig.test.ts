import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const modulePath = '../src/config/gemini.js';

describe('getGeminiConfig', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMINI_API_BASE_URL;
  });

  it('throws when API key is missing', async () => {
    await expect(async () => {
      const mod = await import(modulePath);
      mod.getGeminiConfig();
    }).rejects.toThrow('Missing GEMINI_API_KEY');
  });

  it('returns defaults when optional envs are not provided', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const { getGeminiConfig } = await import(modulePath);
    const config = getGeminiConfig();

    expect(config.apiKey).toBe('test-key');
    expect(config.model).toContain('gemini');
    expect(config.apiBaseUrl).toMatch(/^https?:\/\//);
    expect(config.uploadBaseUrl).toContain(config.apiBaseUrl);
  });

  it('respects overrides for model and base URL', async () => {
    process.env.GEMINI_API_KEY = 'override';
    process.env.GEMINI_MODEL = 'custom-model';
    process.env.GEMINI_API_BASE_URL = 'https://custom.googleapis.com';

    const { getGeminiConfig } = await import(modulePath);
    const config = getGeminiConfig();

    expect(config.model).toBe('custom-model');
    expect(config.apiBaseUrl).toBe('https://custom.googleapis.com');
    expect(config.uploadBaseUrl).toBe('https://custom.googleapis.com/upload');
  });
});
