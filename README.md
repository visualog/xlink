# XLink

`xlink`는 에이전트 간 handoff와 coordinator/MCP 성격의 연결 구조를 설계하고 구현하기 위한 작업 폴더다.

현재 시작 문서:
- [`agent-coordinator-mcp-handoff.md`](./agent-coordinator-mcp-handoff.md)
- [`xlink-v2-architecture.md`](./xlink-v2-architecture.md)
- [`xlink-v2-roadmap.md`](./xlink-v2-roadmap.md)

이 문서는 아래를 정의한다.
- 왜 에이전트 coordinator가 필요한지
- 어떤 도구와 상태 모델이 필요한지
- 어떤 데이터 구조로 handoff를 주고받을지
- HTTP 우선 구조와 향후 MCP adapter 방향

V2 문서는 아래를 추가로 다룬다.
- handoff 중심 구조를 conversation/thread 중심으로 올리는 방향
- 준실시간 mailbox 협업 모델
- unread/ack/thread/artifact를 포함한 다음 단계 로드맵

추천 시작 지시:

> `xlink/agent-coordinator-mcp-handoff.md`를 읽고, 브리지 작업 에이전트와 devlog 에이전트가 handoff를 주고받을 수 있는 로컬 coordinator를 구현해줘.

## Current Prototype

문서 기준 1차 프로토타입을 구현했다.

구성:
- `src/server.js`
- `src/store.js`
- `data/handoffs.json`
- `xlink-mcp/src/server.js`
- `xlink-mcp/src/tools.js`

실행:

```bash
npm start
```

CLI:

```bash
npm run cli -- help
```

메인 에이전트가 devlog payload 파일 하나로 handoff 생성과 ingest를 끝내고 싶다면:

```bash
npm run cli -- record-devlog --input ./payload.json --source-agent bridge-agent --target-agent devlog-agent
```

기본 포트:
- `3850`

환경 변수:
- `PORT`
- `STORE_BACKEND`
  - `json` 또는 `sqlite`
- `DEVLOG_DATA_PATH`
  - 기본값: `../devlog/data/devlogs.json`
- `HANDOFF_DATA_PATH`
  - `json`이면 기본값: `data/handoffs.json`
  - `sqlite`이면 기본값: `data/handoffs.sqlite`
- `CHANNEL_DATA_DIR`
  - 기본값: `data/channels`

주요 엔드포인트:
- `GET /health`
- `GET /mailbox`
- `GET /handoffs`
- `GET /handoffs/:id`
- `GET /handoffs/:id/conversation`
- `GET /handoffs/:id/projection`
- `GET /handoffs/:id/devlog-card`
- `POST /handoffs/:id/devlog-ingest`
- `POST /handoffs/:id/devlog-sync`
- `POST /handoffs/:id/channel-ingest`
- `POST /handoffs/:id/channel-sync`
- `POST /handoffs/:id/xbridge-validate`
- `POST /handoffs`
- `POST /handoffs/:id/claim`
- `POST /handoffs/:id/block`
- `POST /handoffs/:id/reject`
- `POST /handoffs/:id/complete`
- `POST /handoffs/:id/reply`
- `POST /handoffs/:id/artifacts`
- `POST /handoffs/:id/messages`

예시:

```bash
curl -s http://127.0.0.1:3850/handoffs?channel=devlog
```

```bash
curl -s 'http://127.0.0.1:3850/mailbox?agent=devlog-agent&after=2026-04-07T00:00:00.000Z'
```

```bash
curl -s http://127.0.0.1:3850/handoffs/handoff_2026_04_07_001/conversation
```

```bash
curl -s -X POST http://127.0.0.1:3850/handoffs/handoff_2026_04_07_001/reply \
  -H 'Content-Type: application/json' \
  -d '{
    "author": "review-agent",
    "body": "I checked the frame and left notes.",
    "kind": "reply"
  }'
```

```bash
curl -s -X POST http://127.0.0.1:3850/handoffs/handoff_2026_04_07_001/xbridge-validate \
  -H 'Content-Type: application/json' \
  -d '{}'
```

```bash
curl -s -X POST http://127.0.0.1:3850/handoffs \
  -H 'Content-Type: application/json' \
  -d '{
    "channel": "devlog",
    "targetAgent": "devlog-agent",
    "sourceAgent": "bridge-agent",
    "title": "toolbar filter 작업 devlog 등록",
    "priority": "medium",
    "payload": {
      "type": "feature",
      "title": "toolbar filter 추가",
      "date": "06 April, 2026",
      "details": ["필터 칩 추가", "결과 개수 표시"],
      "tags": ["toolbar", "filter"]
    }
  }'
```

설계 원칙:
- SQLite를 기본 backend로 사용하고, JSON은 백업/이관 경로로 유지
- 상태 전이는 `pending -> claimed -> completed` 중심
- `blocked`, `rejected`는 명시적 액션으로 처리
- artifact와 message append를 별도 API로 지원
- 이후 MCP adapter를 올릴 수 있게 HTTP 우선 구조 유지

## Store Backends

handoff 저장소는 같은 인터페이스로 `json`과 `sqlite` 두 backend를 지원한다.

기본:
- `STORE_BACKEND=sqlite`

SQLite 예시:

```bash
STORE_BACKEND=sqlite npm start
```

CLI도 같은 방식으로 사용 가능하다.

```bash
STORE_BACKEND=sqlite npm run cli -- list
```

참고:
- SQLite 구현은 Node의 `node:sqlite`를 사용한다.
- 현재 Node 22 기준 experimental warning이 출력될 수 있다.

편의 스크립트:

```bash
npm run migrate:sqlite
```

```bash
npm run backup:json
```

```bash
npm run dashboard:build
```

운영 대시보드:
- 정적 페이지: `dashboard.html`
- 데이터 출력: `data/dashboard.json`

대시보드 데이터에는 아래가 포함된다.
- 최근 handoff 목록
- 상태별/채널별 요약
- channel projection store 현황
- devlog 최근 엔트리 미리보기

## CLI

HTTP 호출 없이 로컬 store를 직접 다루는 CLI도 추가했다.

예시:

```bash
npm run cli -- list --channel devlog
```

```bash
npm run cli -- preview-devlog handoff_2026_04_06_001
```

```bash
npm run cli -- sync-devlog handoff_2026_04_06_001 --agent devlog-agent
```

```bash
npm run cli -- mailbox --agent devlog-agent --after 2026-04-07T00:00:00.000Z
```

```bash
npm run cli -- conversation handoff_2026_04_06_001
```

```bash
npm run cli -- reply handoff_2026_04_06_001 --author review-agent --body "Looks good to me."
```

```bash
npm run cli -- validate-xbridge-compose handoff_2026_04_06_001
```

지원 명령:
- `list`
- `get`
- `mailbox`
- `conversation`
- `preview-devlog`
- `validate-xbridge-compose`
- `record-devlog`
- `preview-projection`
- `import-json`
- `export-json`
- `ingest-channel`
- `sync-channel`
- `claim`
- `complete`
- `block`
- `reject`
- `add-artifact`
- `append-message`
- `reply`

## Xbridge compose validation

compose payload를 handoff로 주고받을 때는, 실제 compose 전에 Xbridge 계약 검증을 먼저 태울 수 있다.

기본 동작:
- handoff payload를 그대로 Xbridge `validate_external_compose_input`에 전달
- 결과를 반환
- `validationReport`/`projection` 공통 포맷(`status`, `canCompose`, `errorCount`, `warningCount`, `resolvedSource`, `resolvedSectionCount`)을 함께 노출
- 기본적으로 conversation에 validation summary 메시지를 1개 남김

옵션:
- `--base-url` : xlink coordinator 주소. 기본 `http://127.0.0.1:3850`
- `--xbridge-base-url` : bridge 주소. 기본 `http://127.0.0.1:3846`
- `--no-record` : conversation에 validation summary를 남기지 않음
- `--auto-block` : `canCompose === false`면 handoff를 `blocked`로 자동 전환
- `ingest-devlog`
- `sync-devlog`

CLI 환경 변수:
- `STORE_BACKEND`
- `HANDOFF_DATA_PATH`
- `DEVLOG_DATA_PATH`
- `CHANNEL_DATA_DIR`

마이그레이션 예시:

```bash
npm run cli -- import-json --source data/handoffs.json --target data/handoffs.sqlite --target-backend sqlite
```

기존 id를 유지하고 싶은 경우:

```bash
npm run cli -- import-json --source data/handoffs.json --target data/handoffs.sqlite --target-backend sqlite --skip-existing
```

export 예시:

```bash
npm run cli -- export-json --source data/handoffs.sqlite --source-backend sqlite --target data/handoffs.export.json
```

## Operations Dashboard

운영 현황을 한 화면에서 보기 위한 정적 대시보드도 추가했다.

구성:
- `dashboard.html`
- `src/build-dashboard.js`
- `data/dashboard.json`

빌드:

```bash
npm run dashboard:build
```

이 스크립트는 현재 기본 handoff store, channel store, devlog 데이터를 읽어 `data/dashboard.json`을 생성한다.

페이지 열기 예시:

```bash
python3 -m http.server 3849
```

그 뒤 아래 주소로 확인할 수 있다.

```bash
http://127.0.0.1:3849/dashboard.html
```

## MCP Adapter Skeleton

HTTP coordinator 위에 얇은 MCP adapter 스켈레톤을 추가했다.

위치:
- `xlink-mcp/src/server.js`
- `xlink-mcp/src/tools.js`

실행:

```bash
cd xlink-mcp
npm start
```

환경 변수:
- `XLINK_BASE_URL`
  - 기본값: `http://127.0.0.1:3850`

노출 도구:
- `create_handoff`
- `list_handoffs`
- `get_handoff`
- `get_mailbox`
- `get_conversation`
- `append_reply`
- `preview_projection`
- `preview_devlog_card`
- `ingest_devlog_card`
- `sync_devlog_handoff`
- `ingest_projection`
- `sync_handoff_channel`
- `validate_xbridge_compose`
- `claim_handoff`
- `block_handoff`
- `reject_handoff`
- `complete_handoff`
- `add_artifact`
- `append_message`

현재 범위:
- `initialize`
- `tools/list`
- `tools/call`

즉, MCP 서버가 직접 저장소를 건드리지 않고 기존 HTTP coordinator를 감싸는 구조다.

## Devlog Projection

devlog 채널 handoff를 devlog 카드 ingestion 형식으로 미리보기하는 projection을 추가했다.

HTTP:

```bash
curl -s http://127.0.0.1:3850/handoffs/handoff_2026_04_06_001/devlog-card
```

MCP tool:
- `preview_devlog_card`
- `ingest_devlog_card`
- `sync_devlog_handoff`

이 projection은 handoff를 읽어 아래 필드를 정리한다.
- `id`
- `type`
- `title`
- `date`
- `status`
- `summary`
- `details`
- `tags`
- `files`
- `commit`
- `thumbnail`
- `links`
- `codeSnippets`

## Channel Projections

devlog 외 채널도 projection 레이어로 확장할 수 있게 일반화했다.

HTTP:

```bash
curl -s "http://127.0.0.1:3850/handoffs/handoff_2026_04_06_001/projection?channel=docs"
```

CLI:

```bash
npm run cli -- preview-projection handoff_2026_04_06_001 --channel docs
```

MCP tool:
- `preview_projection`

현재 지원 채널:
- `devlog`
- `bridge`
- `figma`
- `docs`
- `review`

## Channel Ingest

`bridge`, `figma`, `docs`, `review` 채널은 로컬 projection store로 ingest 할 수 있다.

저장 위치:
- `data/channels/bridge.json`
- `data/channels/figma.json`
- `data/channels/docs.json`
- `data/channels/review.json`

CLI:

```bash
npm run cli -- ingest-channel handoff_2026_04_06_001 --channel docs
```

```bash
npm run cli -- sync-channel handoff_2026_04_06_001 --channel review --agent review-agent
```

HTTP:

```bash
curl -s -X POST http://127.0.0.1:3850/handoffs/handoff_2026_04_06_001/channel-ingest \
  -H 'Content-Type: application/json' \
  -d '{"channel":"docs"}'
```

MCP tools:
- `ingest_projection`
- `sync_handoff_channel`

## Devlog Ingest

projection 이후 실제 devlog 데이터 파일에 카드를 upsert 하는 ingest도 추가했다.

동작:
- handoff를 devlog 카드 형식으로 변환
- 같은 `id`가 있으면 교체
- 없으면 맨 앞에 추가
- `updatedAt` 갱신

HTTP:

```bash
curl -s -X POST http://127.0.0.1:3850/handoffs/handoff_2026_04_06_001/devlog-ingest
```

MCP tool:
- `ingest_devlog_card`

기본 대상 파일:
- `/Users/im_018/Documents/GitHub/2026_important/figma_skills/devlog/data/devlogs.json`

필요하면 환경 변수 `DEVLOG_DATA_PATH`로 대체 가능하다.

## Devlog Sync Workflow

ingest 뒤에 complete까지 이어지는 one-shot workflow도 추가했다.

동작:
- handoff가 `pending`이면 먼저 claim
- devlog 카드로 투영 후 devlog data에 ingest
- 성공하면 handoff를 `completed`로 전환

HTTP:

```bash
curl -s -X POST http://127.0.0.1:3850/handoffs/handoff_2026_04_06_001/devlog-sync \
  -H 'Content-Type: application/json' \
  -d '{
    "agent": "devlog-agent",
    "note": "devlog sync started",
    "result": "devlog card ingested and handoff completed"
  }'
```
