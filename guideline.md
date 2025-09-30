guideline.md

> 목적: 강의 자료(PDF)와(선택) 강의 음성/영상으로부터 **구조화된 요약 JSON**과 **4지선다 퀴즈 세트 JSON**을 자동 생성·배포하는 완전 자동 파이프라인을 구현한다.
> 주 모델 문자열: **`gemini-flash-latest`** *(주의: 실제 사용 전 모델 존재 여부를 API로 확인. 자동 치환 금지—아래 “모델 확인 절차” 참조).*

---

## 0) 필수 원칙

1. **옵셔널 입력 허용**: 유저는 (a) PDF만, (b) PDF+오디오/비디오, (c) 오디오/비디오만 업로드할 수 있다. 오디오 경로는 추후 확장 가능하도록 **기능 플래그**로 분리한다.
2. **완전 구조화 출력**: Gemini API는 **Structured Output**(JSON Schema/responseSchema)을 강제한다. 후처리 없이 DB에 안전하게 적재 가능해야 한다. ([Google AI for Developers][1])
3. **대용량·장시간 작업 분리**: 업로드·전사·생성은 **비동기 잡**으로 분리하고, 프론트엔드는 폴링/웹훅으로 상태를 반영한다.
4. **배포 전략**: UI/경량 API는 **Vercel(Next.js 15)**, 장시간/대용량 잡은 **Render(Background Worker)** 조합을 권장(아래 비교). ([Next.js][2])
---

## 1) 상위 아키텍처

```
[Client/Browser]
   ├─(A) 파일 업로드 → [Blob Storage (Vercel Blob or S3)]
   │        └─ 업로드 URL/메타 DB 기록
   ├─(B) "요약 생성" 버튼 → [Orchestrator API]
   │        ├─ (선택) STT 잡 큐잉 → [Worker: STT(ElevenLabs)]
   │        ├─ PDF/Transcript 파일 → [Gemini Summarizer]
   │        └─ 요약 JSON 저장(DB)
   ├─(C) "퀴즈 생성" 버튼 → [Orchestrator API]
   │        ├─ 요약 JSON → [Gemini QuizGen]
   │        └─ 퀴즈 JSON 저장(DB)
   └─(D) 퀴즈 풀기 UI → [Next.js App Router] ←→ [DB]
```

* **파일 업로드**: 프론트에서 **Vercel Blob**(멀티파트, 최대 TB 단위)로 직접 업로드 후 토큰/URL만 서버에 전달(서버리스 4.5MB 바디 제한 회피). ([Vercel][4])
* **대용량/장시간 잡**: **Render Background Worker**(항상 켜짐·오토스케일·크론), 또는 **Inngest/QStash**로 Next.js에서 신뢰성 높은 백그라운드 실행. ([Render][5])

---

## 2) 모델 및 파일 제약 — 최신 확인 결과

* **Gemini Structured Output**: `responseSchema` / `responseMimeType`로 JSON 강제 가능(언어별 SDK/REST 지원). ([Google AI for Developers][1])
* **Gemini File API**: PDF/오디오/비디오/텍스트 **파일 사전 업로드** 후 프롬프트에서 참조. **총 요청 > 20MB**면 **File API 사용 권장**, **PDF 단일 파일 50MB, 48시간 보관**. ([Google AI for Developers][6])
* **모델 현행성**: 2025-09-29 기준 **Gemini 1.5 계열(1.5-pro/flash 등) 폐기/더 이상 사용 지양**. 2.x/2.5 계열 사용 권고. *(아래 “모델 확인 절차” 참고)* ([Google AI for Developers][7])

### ⚠️ 모델 확인 절차 (자동 치환 금지)

1. **환경설정**에서 모델 문자열을 **`gemini-flash-latest`**로 받는다.
2. 실행 전 **Models API**(`GET /v1beta/models`)로 해당 문자열의 유효성 검증. 없으면 **작업 중지 + 경고 로깅 + 운영자 알림**(치환·자동대체 금지). 대신 **문서화된 최신 플래시 계열**(예: `gemini-2.5-flash`)을 **운영자 가이드**로만 제안한다. ([Google AI for Developers][8])

---

## 3) 입력 경로 설계

### 3.1 PDF만 업로드

* PDF를 **File API**로 업로드 → 문서이해 가이드라인에 맞춰 Summarizer 호출. 20MB 초과 시 **반드시 File API**. ([Google AI for Developers][9])

### 3.2 PDF + 오디오/비디오

* 비디오(mp4 등) → **FFmpeg**로 WAV/FLAC 등으로 추출(샘플레이트 16k~44.1k, 모노 권장) → ElevenLabs STT. ([Stack Overflow][10])
* **ElevenLabs STT(Scribe v1)**: 99개 언어, **화자 분리/워드 단위 타임스탬프/오디오 이벤트 태깅** 지원. 동영상 직접 전사도 가능. HIPAA 용도 시 **BAA 체결 필요**. ([ElevenLabs][3])

### 3.3 오디오/비디오만 업로드

* 전사(STT) 결과만으로 요약/퀴즈를 생성하되, **슬라이드(없는 경우)** 필드들은 `null` 처리. 후속 PDF 업로드 시 **병합 재생성** 가능.

---

## 4) 데이터 계약 (JSON Schema)

> **핵심**: Gemini가 **직접 스키마를 준수하는 JSON**을 반환하도록 `responseSchema`를 사용한다. 응답은 DB에 **그대로 upsert** 가능해야 함. ([Google AI for Developers][1])

### 4.1 `LectureSummary` (요약 스키마)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "LectureSummary",
  "type": "object",
  "required": ["meta", "highlights", "memorization", "concepts"],
  "properties": {
    "meta": {
      "type": "object",
      "required": ["lectureId", "title", "language", "source"],
      "properties": {
        "lectureId": {"type": "string"},
        "title": {"type": "string"},
        "language": {"type": "string", "description": "ISO code, e.g., 'ko'"},
        "source": {
          "type": "object",
          "properties": {
            "pdfFileId": {"type": ["string", "null"]},
            "transcriptFileId": {"type": ["string", "null"]},
            "pages": {"type": ["array", "null"], "items": {"type": "integer"}}
          }
        }
      }
    },
    "highlights": {
      "type": "array",
      "description": "교수가 '중요'라 강조한 부분 + 슬라이드 핵심을 병합",
      "items": {
        "type": "object",
        "required": ["point", "why", "sourceMap"],
        "properties": {
          "point": {"type": "string"},
          "why": {"type": "string"},
          "sourceMap": {
            "type": "object",
            "properties": {
              "pdfPages": {"type": "array", "items": {"type": "integer"}},
              "timestamps": {"type": "array", "items": {"type": "string", "pattern": "^\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,3})?$"}}
            }
          }
        }
      }
    },
    "memorization": {
      "type": "array",
      "description": "단순 암기 포인트(용어정의, 분류표, 수치 cutoff 등)",
      "items": {
        "type": "object",
        "required": ["fact", "mnemonic"],
        "properties": {
          "fact": {"type": "string"},
          "mnemonic": {"type": "string"}
        }
      }
    },
    "concepts": {
      "type": "array",
      "description": "핵심 개념/흐름 요약",
      "items": {
        "type": "object",
        "required": ["concept", "explanation"],
        "properties": {
          "concept": {"type": "string"},
          "explanation": {"type": "string"},
          "relatedFigures": {"type": "array", "items": {"type": "string"}}
        }
      }
    },
    "quizSeeds": {
      "type": "array",
      "description": "퀴즈 생성용 시드(개념/암기 포인트/오해 유발 포인트)",
      "items": {
        "type": "object",
        "required": ["topic", "difficulty"],
        "properties": {
          "topic": {"type": "string"},
          "difficulty": {"type": "string", "enum": ["easy", "medium", "hard"]},
          "pitfalls": {"type": "array", "items": {"type": "string"}}
        }
      }
    }
  }
}
```

### 4.2 `QuizSet` (4지선다 20문제)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "QuizSet",
  "type": "object",
  "required": ["lectureId", "items"],
  "properties": {
    "lectureId": {"type": "string"},
    "items": {
      "type": "array",
      "minItems": 20,
      "maxItems": 20,
      "items": {
        "type": "object",
        "required": ["qid", "stem", "options", "answer", "rationale", "difficulty", "tags", "sourceRef"],
        "properties": {
          "qid": {"type": "string"},
          "stem": {"type": "string"},
          "options": {
            "type": "array",
            "minItems": 4, "maxItems": 4,
            "items": {"type": "string"}
          },
          "answer": {"type": "integer", "minimum": 0, "maximum": 3, "description": "정답 인덱스(0-3)"},
          "rationale": {"type": "string", "description": "정답·오답 모두에 대한 간단한 근거"},
          "difficulty": {"type": "string", "enum": ["easy", "medium", "hard"]},
          "tags": {"type": "array", "items": {"type": "string"}},
          "sourceRef": {
            "type": "object",
            "properties": {
              "pdfPages": {"type": "array", "items": {"type": "integer"}},
              "timestamps": {"type": "array", "items": {"type": "string"}}
            }
          }
        },
        "allOf": [
          {"properties": {"options": {"uniqueItems": true}}},
          {"properties": {"stem": {"minLength": 8}}}
        ]
      }
    }
  }
}
```

**디자인 원칙**

* 하나의 정답(인덱스)만 허용, 중복 옵션 금지, 20문항 고정.
* `sourceRef`로 슬라이드 페이지·녹음 타임스탬프 추적 → 리뷰/정정 용이.

---

## 5) 모델 호출 사양 (Gemini)

### 5.1 Summarizer 호출 (PDF + Transcript 멀티모달)

* **사전 단계**: PDF/전사 텍스트를 **File API**로 업로드하고, `file.uri`를 프롬프트에서 참조. **20MB 초과**면 필수. ([Google AI for Developers][6])
* **Structured Output**: `responseMimeType: "application/json"`, `responseSchema: LectureSummary`. ([Google AI for Developers][1])

**JavaScript (공식 SDK) 예시**:

```js
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function summarize({ pdfFileUri, transcriptFileUri, lectureId, title, language }) {
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL_ID || "gemini-flash-latest", // 존재 확인은 별도 수행
    contents: [
      { role: "user", parts: [
        { text: [
          "당신은 의대 강의 요약 비서입니다.",
          "아래 PDF와(선택) 전사를 통합해 스키마에 맞춰 요약 JSON만 반환하세요.",
          "교수의 강조/출제 가능 포인트/암기 포인트를 최우선 포함하고, 슬라이드-음성 간 상충 시 교수 발언을 우선하세요."
        ].join("\n") },
        pdfFileUri ? { fileData: { fileUri: pdfFileUri, mimeType: "application/pdf" } } : null,
        transcriptFileUri ? { fileData: { fileUri: transcriptFileUri, mimeType: "text/plain" } } : null
      ].filter(Boolean) }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: /* LectureSummary schema object */,
    }
  });

  return response.text; // JSON string
}
```

> **근거**: 공식 문서의 Structured Output(언어별 SDK) 및 REST 예시. ([Google AI for Developers][1])

### 5.2 QuizGen 호출 (요약 → 20문항)

* 입력: `LectureSummary` JSON.
* 출력: `QuizSet` JSON (20문항 고정, 중복 금지, 오답 매력도 확보).

```js
export async function generateQuiz({ lectureSummary }) {
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL_ID || "gemini-flash-latest",
    contents: [{ role: "user", parts: [
      { text: [
        "아래 LectureSummary(JSON)를 바탕으로 4지선다 20문제를 생성하세요.",
        "조건:",
        "- 보기 4개, 정답은 오직 1개(인덱스 0-3).",
        "- 출제 의도와 오답 매력도 반영(유사 개념 혼동 유도).",
        "- Bloom level은 difficulty로 근사(easy: 기억, medium: 이해/적용, hard: 분석/추론).",
        "- 오타/중복/모호성 금지. 슬라이드·타임스탬프 근거를 sourceRef에 기입.",
        "JSON만 반환."
      ].join("\n") },
      { inlineData: { mimeType: "application/json", data: Buffer.from(JSON.stringify(lectureSummary)).toString("base64") } }
    ]}],
    config: {
      responseMimeType: "application/json",
      responseSchema: /* QuizSet schema object */
    }
  });
  return response.text;
}
```

---

## 6) STT 파이프라인 (옵션)

### 6.1 비디오→오디오 추출

* 권장: **FFmpeg**(파이썬·노드에서 child process). 예:
  `ffmpeg -i input.mp4 -ac 1 -ar 16000 -vn output.wav`
  (모노/16kHz 권장, STT 호환 및 비용·속도 균형) ([Stack Overflow][10])

### 6.2 ElevenLabs STT(Scribe v1) API

* **전송**: `POST /v1/speech-to-text/...` (multipart/form-data), 비디오 파일도 직접 업로드 가능.
* **특징**: 99언어, 화자 구분, 워드 타임스탬프, 오디오 이벤트 태깅, 길이↑ 시 **병렬 청크 처리**.
* **대기 없이 처리**: **웹훅 비동기 수신** 지원.
* **의료/민감 데이터**: **BAA 필요**. ([ElevenLabs][3])

**cURL 개요** (의미만 제시):

```bash
# 생성
curl -X POST "https://api.elevenlabs.io/v1/speech-to-text/convert" \
  -H "xi-api-key: $XI_API_KEY" \
  -F "file=@output.wav" \
  -F "model=scribe_v1" \
  -F "diarize=true" \
  -F "timestamps=word" \
  -F "webhook_url=$WEBHOOK_URL"

# 결과 조회
curl "https://api.elevenlabs.io/v1/speech-to-text/transcripts/$TRANSCRIPT_ID" \
  -H "xi-api-key: $XI_API_KEY"
```

---

## 7) 저장소/백엔드/프론트엔드 규격

### 7.1 데이터베이스 (PostgreSQL 권장)

* **강의/자료/전사/요약/퀴즈/응시/응답**엔티티.
* JSON 필드는 **Postgres JSONB** 사용(ORM은 Prisma, `Json` 타입). ([Prisma][11])

**예시(Prisma)**

```prisma
model Lecture {
  id           String  @id @default(cuid())
  title        String
  language     String  @default("ko")
  pdfFileUri   String?
  transcriptUri String?
  createdAt    DateTime @default(now())
  summaries    Summary[]
  quizzes      Quiz[]
}

model Summary {
  id        String   @id @default(cuid())
  lecture   Lecture  @relation(fields: [lectureId], references: [id])
  lectureId String
  payload   Json     // LectureSummary
  createdAt DateTime @default(now())
}

model Quiz {
  id        String   @id @default(cuid())
  lecture   Lecture  @relation(fields: [lectureId], references: [id])
  lectureId String
  payload   Json     // QuizSet
  createdAt DateTime @default(now())
}
```

### 7.2 파일 저장

* **업로드**: 프론트 → **Vercel Blob**(TB급, 멀티파트, 재시도/이어올리기) → URL만 백엔드에 전달(서버리스 4.5MB 제한 회피). ([Vercel][4])
* **서버풀 경로**(Render) 선택 시: **Persistent Disk** 필요 시 부착(기본 파일시스템은 휘발성). ([Render][12])

### 7.3 백엔드 엔드포인트 (권고)

* `POST /api/lectures` : 메타 생성, 업로드 URL 반환
* `POST /api/lectures/:id/transcribe` : (옵션) STT 잡 트리거
* `POST /api/lectures/:id/summarize` : Summarizer 잡 트리거
* `POST /api/lectures/:id/quiz` : QuizGen 잡 트리거
* `GET /api/quizzes/:id` : 퀴즈 조회
* `POST /api/quizzes/:id/attempts` : 응시 시작
* `POST /api/attempts/:id/answers` : 문항별 제출, 즉시 채점/해설 반환

> **잡 실행**: Inngest/QStash로 신뢰성·재시도·지연 실행·스로틀링을 확보. ([Vercel][13])

### 7.4 프론트엔드 (Next.js 15 App Router)

* **화면**: 업로드/상태 대시보드/요약 미리보기/퀴즈 풀이(진행도, 타이머, 해설 토글, 북마크).
* Next.js 15는 React 19 대응, 캐싱·개발속도 개선. ([Next.js][2])

---

## 8) 배포 전략 (Vercel vs Render)

| 항목   | Vercel (권장: 프론트/경량 API)                     | Render (권장: 백그라운드/서버풀)             |
| ---- | ------------------------------------------- | ---------------------------------- |
| 아키텍처 | 서버리스(엣지/펑션)                                 | 서버풀(Web Service/Worker)            |
| 장점   | Next.js 15 최적화, 제로컨피그, 글로벌 CDN              | 항상 켜짐, **장시간 작업/오토스케일**, **크론/워커** |
| 제약   | **4.5MB 바디/응답** 제한, 장시간 작업 부적합 → Blob·큐로 우회 | 디스크 부착 가능(유지), 무료 티어는 슬립           |
| 적합   | UI, 짧은 API, 업로드→Blob, 상태 UI                 | STT 대기, 대용량 다운로드/인코딩, 크론 파이프라인     |

* **문서 근거**: Next.js@Vercel, Vercel Functions 한계(4.5MB), Vercel Blob(수 TB), Render Background Workers/크론/디스크. ([Vercel][14])

**권장 베이스라인**

* **프론트/UI/경량 오케스트레이션**: Vercel + Vercel Blob
* **백그라운드 파이프라인**: Render Worker 또는 Inngest/QStash(서버리스 잡)
* **대체안(올인원)**: Render Web+Worker 단일 플랫폼(디스크 필요 시 유리). ([Render][15])

---

## 9) 보안·컴플라이언스

* **비밀키**: `GEMINI_API_KEY`, `XI_API_KEY`, `BLOB_RW_TOKEN`, DB URL 등은 KMS/환경변수로 관리.
* **로그**: STT/LLM 응답 원문은 옵션 마스킹 저장(민감정보 제거).
* **HIPAA**: ElevenLabs STT 사용 시 **BAA 체결** 필수. 저장·전송 구간 암호화(TLS), 최소 보존. ([ElevenLabs][3])
* **파일 수명**: Gemini File API는 **48시간 보관**, 재사용·만료 주기 설계 필요. ([Google AI for Developers][9])

---

---

## 11) 품질관리(자동 점검)

1. **스키마 검증**: Summarizer/QuizGen 응답에 대하여 **AJV** 등으로 JSON Schema 검증(유효성 실패 시 **자동 재요청**: “repair” 프롬프트).
2. **퀴즈 정합성**:

   * 중복 옵션/정답 다중 여부, 길이, 금지어(“모두 정답”류) 검사
   * 난이도 분포(예: easy:medium:hard = 7:8:5) 강제
3. **출처 확인**: `sourceRef` 페이지/타임스탬프가 실제 범위에 존재하는지 확인.
4. **샘플 수기 검수 모드**: 운영자 UI에서 문제 편집/비활성화 플래그.

---

## 12) 사용자 경험(UI) 권고

* **드래그&드롭 업로드**, 즉시 전처리(확장자/용량 검사)
* **상태 피드**: “업로드 → 전사 → 요약 → 퀴즈” 단계별 진행률/ETA(백오프 로그 기반)
* **퀴즈 모드**: 학습/시험/스페이스드 리피티션, 오답노트 자동 생성
* **접근성**: 키보드 네비게이션, 스크린리더 레이블, 폰트 크기 조절

---

## 13) 운영·배포

* **GitHub 연결**: PR마다 Vercel Preview(프론트), Render Preview(Web/Worker) 생성.
* **환경 변수**:

  * `GEMINI_MODEL_ID=gemini-flash-latest` *(실존 확인 실패 시 작업 중단)*
  * `GEMINI_API_KEY`, `XI_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `DATABASE_URL`
* **크론**: 미완료 잡 재시도/청소, 만료 File API 재업로드. (Vercel Cron 또는 Render Cron) ([Vercel][18])

---

## 14) 예시 코드 스니펫

### 14.1 FFmpeg 추출(노드)

```ts
import { execa } from "execa";
await execa("ffmpeg", ["-i", "in.mp4", "-ac", "1", "-ar", "16000", "-vn", "out.wav"]);
```

> FFmpeg 추출 예시 근거. ([Stack Overflow][10])

### 14.2 ElevenLabs STT(노드, 개념)

```ts
import FormData from "form-data";
import fetch from "node-fetch";
const fd = new FormData();
fd.append("file", fs.createReadStream("out.wav"));
fd.append("model", "scribe_v1");
fd.append("diarize", "true");
fd.append("timestamps", "word");
fd.append("webhook_url", process.env.WEBHOOK_URL);

const resp = await fetch("https://api.elevenlabs.io/v1/speech-to-text/convert", {
  method: "POST",
  headers: { "xi-api-key": process.env.XI_API_KEY },
  body: fd
});
const { transcription_id } = await resp.json();
```

> 엔드포인트·웹훅 근거. ([ElevenLabs][19])

### 14.3 Gemini Structured Output(자바스크립트)

```ts
import { GoogleGenAI, Type } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const LectureSummarySchema = {/* 위 4.1 스키마 객체 */};

const res = await ai.models.generateContent({
  model: process.env.GEMINI_MODEL_ID || "gemini-flash-latest",
  contents: [{ parts: [{ text: "스키마에 맞춰 JSON만 반환" }, /* file parts... */]}],
  config: {
    responseMimeType: "application/json",
    responseSchema: LectureSummarySchema
  }
});
const json = JSON.parse(res.text);
```

> Structured Output 공식 문서. ([Google AI for Developers][1])

---

## 15) 테스트·검증 체크리스트

* [ ] 1GB PDF(분할 업로드) + 2시간 강의 동영상 조합에서 **업로드→전사→요약→퀴즈** 전체 성공
* [ ] Body 4.5MB 초과 요청이 서버리스 경로에서 **차단되지 않는지**(Blob 경유) 확인 ([Vercel][20])
* [ ] 모델 문자열 `gemini-flash-latest` **존재 검증**(없으면 중단·알림) ([Google AI for Developers][8])
* [ ] File API **48h 보관** 만료 전 재사용/재업로드 로직 확인 ([Google AI for Developers][9])
* [ ] 퀴즈 20문항 고정/중복 옵션 금지/정답 1개 보장 검증

---

## 16) “악마의 변호인” 관점(대안·리스크)

* **왜 Gemini인가?**
  Structured Output가 **1-class citizen**이며, File API로 PDF/미디어를 안정적으로 다룬다. 2025-09-29 기준 1.5 계열은 폐기되어 **2.x/2.5** 채택이 안전. 다만, `gemini-flash-latest` 별칭의 **공식성/존재**는 지역·시점에 따라 다를 수 있어 **사전 확인 필수**. ([Google AI for Developers][1])
* **왜 ElevenLabs STT인가?**
  **Scribe v1**는 다화자·워드 타임스탬프·오디오 이벤트 태깅을 제공하고 **비디오 파일 직접 전사** 가능. 단, HIPAA 용도라면 **BAA 필수**이며, 가격·언어별 정확도는 벤치마킹 필요. ([ElevenLabs][3])
* **Vercel만으로 충분한가?**
  대용량 업로드/장시간 작업 제약(4.5MB 바디·펑션 타임·번들 크기)이 있어 **Blob + 백그라운드 워크플로(인증 큐)** 조합이 안전하다. **Render Worker** 혹은 **Inngest/QStash**로 보완 권장. ([Vercel][20])

---

## 17) 운영자 가이드(인증/권한—옵션)

* 간단한 내부용은 **Auth.js(구 NextAuth)**로 소셜·세션 처리. 대규모/조직 단위는 Clerk 등 대안 비교. ([Next.js][21])

---

## 부록 A: 모델 문자열 가이드 (운영자용)

* 우선 **`gemini-flash-latest`**를 구성값으로 시도 → **Models API**에서 **존재 확인**. 없으면 **작업을 중단**하고 운영자에게 **`gemini-2.5-flash`** 등 최신 플래시 계열로 **수동 교체**를 요청(자동 치환 금지).

  * 2025-06~09 공개 문서/블로그 기준, **2.5 Flash/Flash-Lite**가 최신 Price-Perf 트랙. ([Google Cloud][22])

---

## 부록 B: 타사/요금·제한 참고 링크

* **Gemini Structured Output**: JSON Schema/SDK/REST 예시 ([Google AI for Developers][1])
* **Gemini File API**: 파일 업로드/용량/보관기간 ([Google AI for Developers][6])
* **ElevenLabs STT(Scribe v1)**: 개요/모델/웹훅/엔드포인트/BAA ([ElevenLabs][3])
* **Vercel**: Next.js 15, Functions 한계, Blob 스토리지, Cron ([Next.js][2])
* **Render**: Background Worker, Cron, Persistent Disk, 무중단 배포 개요 ([Render][5])
* **백그라운드 잡 대안**: **Inngest(마켓플레이스/가이드)**, **Upstash QStash(문서/체인지로그)** ([Vercel][13])

---

### 최종 메모

* 본 문서는 **각하의 요구 사항에 부합하는 완성형 설계/규격**입니다.

* 

[1]: https://ai.google.dev/gemini-api/docs/structured-output "Structured output  |  Gemini API  |  Google AI for Developers"
[2]: https://nextjs.org/blog/next-15?utm_source=chatgpt.com "Next.js 15"
[3]: https://elevenlabs.io/docs/capabilities/speech-to-text "Speech to Text | ElevenLabs Documentation"
[4]: https://vercel.com/blog/vercel-blob-now-generally-available?utm_source=chatgpt.com "Vercel Blob is now generally available: Cost-efficient, ..."
[5]: https://render.com/docs/background-workers?utm_source=chatgpt.com "Background Workers"
[6]: https://ai.google.dev/api/files?utm_source=chatgpt.com "Using files | Gemini API - Google AI for Developers"
[7]: https://ai.google.dev/gemini-api/docs/changelog?utm_source=chatgpt.com "Release notes | Gemini API | Google AI for Developers"
[8]: https://ai.google.dev/api/models?utm_source=chatgpt.com "Models | Gemini API | Google AI for Developers"
[9]: https://ai.google.dev/gemini-api/docs/document-processing?utm_source=chatgpt.com "Document understanding | Gemini API | Google AI for ..."
[10]: https://stackoverflow.com/questions/26741116/python-extract-wav-from-video-file?utm_source=chatgpt.com "Python extract wav from video file - audio"
[11]: https://www.prisma.io/docs/orm/overview/databases/postgresql?utm_source=chatgpt.com "PostgreSQL database connector | Prisma Documentation"
[12]: https://render.com/docs/disks?utm_source=chatgpt.com "Persistent Disks"
[13]: https://vercel.com/marketplace/inngest?utm_source=chatgpt.com "Inngest for Vercel"
[14]: https://vercel.com/docs/frameworks/full-stack/nextjs?utm_source=chatgpt.com "Next.js on Vercel"
[15]: https://render.com/docs/deploys?utm_source=chatgpt.com "Deploying on Render"
[16]: https://github.com/upstash/context7?utm_source=chatgpt.com "Context7 MCP Server -- Up-to-date code documentation for ..."
[17]: https://github.com/modelcontextprotocol?utm_source=chatgpt.com "Model Context Protocol"
[18]: https://vercel.com/docs/cron-jobs?utm_source=chatgpt.com "Cron Jobs"
[19]: https://elevenlabs.io/docs/api-reference/speech-to-text/convert?utm_source=chatgpt.com "Create transcript | ElevenLabs Documentation"
[20]: https://vercel.com/docs/functions/limitations?utm_source=chatgpt.com "Vercel Functions Limits"
[21]: https://nextjs.org/learn/dashboard-app/adding-authentication?utm_source=chatgpt.com "Adding Authentication - App Router"
[22]: https://cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-flash?utm_source=chatgpt.com "Gemini 2.5 Flash | Generative AI on Vertex AI"
