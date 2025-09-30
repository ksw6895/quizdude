export type JsonSchema = Record<string, unknown>;

export const lectureSummaryJsonSchema: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'LectureSummary',
  type: 'object',
  additionalProperties: false,
  required: ['meta', 'highlights', 'memorization', 'concepts'],
  properties: {
    meta: {
      type: 'object',
      additionalProperties: false,
      required: ['lectureId', 'title', 'language', 'source'],
      properties: {
        lectureId: { type: 'string' },
        title: { type: 'string' },
        language: {
          type: 'string',
          description: 'ISO 639-1/2 language code, e.g. "ko".',
        },
        source: {
          type: 'object',
          additionalProperties: false,
          properties: {
            pdfFileId: { type: ['string', 'null'] },
            transcriptFileId: { type: ['string', 'null'] },
            pages: {
              anyOf: [
                { type: 'null' },
                {
                  type: 'array',
                  items: { type: 'integer', minimum: 1 },
                },
              ],
            },
          },
        },
      },
    },
    highlights: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['point', 'why', 'sourceMap'],
        properties: {
          point: { type: 'string' },
          why: { type: 'string' },
          sourceMap: {
            type: 'object',
            additionalProperties: false,
            required: ['pdfPages', 'timestamps'],
            properties: {
              pdfPages: {
                type: 'array',
                items: { type: 'integer', minimum: 0 },
                default: [],
              },
              timestamps: {
                type: 'array',
                default: [],
                items: {
                  type: 'string',
                  pattern: '^\\\d{2}:\\\d{2}:\\\d{2}(\\.\\d{1,3})?$',
                },
              },
            },
          },
        },
      },
    },
    memorization: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['fact', 'mnemonic'],
        properties: {
          fact: { type: 'string' },
          mnemonic: { type: 'string' },
        },
      },
    },
    concepts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['concept', 'explanation', 'relatedFigures'],
        properties: {
          concept: { type: 'string' },
          explanation: { type: 'string' },
          relatedFigures: {
            type: 'array',
            items: { type: 'string' },
            default: [],
          },
        },
      },
    },
    quizSeeds: {
      type: 'array',
      default: [],
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['topic', 'difficulty', 'pitfalls'],
        properties: {
          topic: { type: 'string' },
          difficulty: {
            type: 'string',
            enum: ['easy', 'medium', 'hard'],
          },
          pitfalls: {
            type: 'array',
            items: { type: 'string' },
            default: [],
          },
        },
      },
    },
  },
};

export const quizSetJsonSchema: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'QuizSet',
  type: 'object',
  additionalProperties: false,
  required: ['lectureId', 'items'],
  properties: {
    lectureId: { type: 'string' },
    items: {
      type: 'array',
      minItems: 20,
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'qid',
          'stem',
          'options',
          'answer',
          'rationale',
          'difficulty',
          'tags',
          'sourceRef',
        ],
        properties: {
          qid: { type: 'string' },
          stem: { type: 'string', minLength: 8 },
          options: {
            type: 'array',
            minItems: 4,
            maxItems: 4,
            items: { type: 'string', minLength: 1 },
          },
          answer: {
            type: 'integer',
            minimum: 0,
            maximum: 3,
          },
          rationale: { type: 'string' },
          difficulty: {
            type: 'string',
            enum: ['easy', 'medium', 'hard'],
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
          sourceRef: {
            type: 'object',
            additionalProperties: false,
            properties: {
              pdfPages: {
                type: 'array',
                items: { type: 'integer', minimum: 1 },
              },
              timestamps: {
                type: 'array',
                items: {
                  type: 'string',
                  pattern: '^\\\d{2}:\\\d{2}:\\\d{2}(\\.\\d{1,3})?$',
                },
              },
            },
          },
        },
      },
    },
  },
};
