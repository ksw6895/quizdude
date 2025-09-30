const toBoolean = (value: string | undefined, defaultValue = false): boolean => {
  if (value === undefined || value === '') {
    return defaultValue;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

export const featureFlags = {
  enableAudioPipeline: toBoolean(process.env.ENABLE_AUDIO_PIPELINE, false),
};

export const isAudioPipelineEnabled = () => featureFlags.enableAudioPipeline;
