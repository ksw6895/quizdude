export type JsonSchema = Record<string, unknown>;

export const lectureSummaryJsonSchema: JsonSchema = {
  type: 'object',
  required: ['meta', 'highlights', 'memorization', 'concepts'],
  properties: {
    meta: {
      type: 'object',
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
          properties: {
            pdfFileId: { type: 'string', nullable: true },
            transcriptFileId: { type: 'string', nullable: true },
            pages: {
              type: 'array',
              nullable: true,
              items: { type: 'integer' },
            },
          },
        },
      },
    },
    highlights: {
      type: 'array',
      items: {
        type: 'object',
        required: ['point', 'why', 'sourceMap'],
        properties: {
          point: { type: 'string' },
          why: { type: 'string' },
          sourceMap: {
            type: 'object',
            required: ['pdfPages', 'timestamps'],
            properties: {
              pdfPages: {
                type: 'array',
                items: { type: 'integer' },
              },
              timestamps: {
                type: 'array',
                items: { type: 'string' },
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
        required: ['concept', 'explanation', 'relatedFigures'],
        properties: {
          concept: { type: 'string' },
          explanation: { type: 'string' },
          relatedFigures: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
    quizSeeds: {
      type: 'array',
      items: {
        type: 'object',
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
          },
        },
      },
    },
  },
};

export const quizSetJsonSchema: JsonSchema = {
  type: 'object',
  required: ['lectureId', 'items'],
  properties: {
    lectureId: { type: 'string' },
    items: {
      type: 'array',
      minItems: 20,
      maxItems: 20,
      items: {
        type: 'object',
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
          stem: { type: 'string' },
          options: {
            type: 'array',
            minItems: 4,
            maxItems: 4,
            items: { type: 'string' },
          },
          answer: {
            type: 'integer',
            enum: [0, 1, 2, 3],
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
            properties: {
              pdfPages: {
                type: 'array',
                items: { type: 'integer' },
              },
              timestamps: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
};
