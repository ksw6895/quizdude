import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const modulePath = '../src/config/featureFlags.js';

describe('featureFlags', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.ENABLE_AUDIO_PIPELINE;
  });

  it('returns false when flag is unset', async () => {
    delete process.env.ENABLE_AUDIO_PIPELINE;
    const { isAudioPipelineEnabled } = await import(modulePath);
    expect(isAudioPipelineEnabled()).toBe(false);
  });

  it('accepts truthy string values', async () => {
    process.env.ENABLE_AUDIO_PIPELINE = 'true';
    const { isAudioPipelineEnabled } = await import(modulePath);
    expect(isAudioPipelineEnabled()).toBe(true);
  });

  it('accepts numeric truthy values', async () => {
    process.env.ENABLE_AUDIO_PIPELINE = '1';
    const { isAudioPipelineEnabled } = await import(modulePath);
    expect(isAudioPipelineEnabled()).toBe(true);
  });

  it('treats invalid value as false', async () => {
    process.env.ENABLE_AUDIO_PIPELINE = 'nope';
    const { isAudioPipelineEnabled } = await import(modulePath);
    expect(isAudioPipelineEnabled()).toBe(false);
  });
});
