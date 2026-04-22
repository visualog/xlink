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
  - 기본값: `../xlog/data/devlogs.json`
- `HANDOFF_DATA_PATH`
  - `json`이면 기본값: `data/handoffs.json`
  - `sqlite`이면 기본값: `data/handoffs.sqlite`
- `CHANNEL_DATA_DIR`
  - 기본값: `data/channels`

주요 엔드포인트:
- `GET /health`
- `GET /dashboard`
- `GET /dashboard/snapshot`
- `POST /dashboard/rebuild`
- `GET /mailbox`
- `GET /mailbox/stream` (`after`, `interval` query 지원, SSE)
- `GET /mailbox/:agent/unread-count` (`threadId` query로 thread scope 가능)
- `POST /mailbox/:agent/ack` (`cursor`, `threadId` body 지원)
- `GET /review/context` (`agent?`, `limit?`, `handoffLimit?`, `briefLimit?`, `includeClosed?`)
- `POST /review/threads/:id/decision`
- `GET /threads`
- `POST /threads`
- `GET /threads/:id`
- `GET /threads/:id/context` (`agent?`, `messageLimit?`, `handoffLimit?`, `includeClosed?`)
- `GET /threads/:id/messages`
- `POST /threads/:id/messages`
- `POST /threads/:id/handoffs`
- `POST /threads/:id/deliverables`
- `POST /threads/:id/verification`
- `GET /channels/:channel/entries`
- `GET /channels/:channel/entries/:id`
- `GET /designer/context` (`agent?`, `channel?`, `limit?`, `handoffLimit?`, `briefLimit?`, `includeClosed?`; 기본 channel은 `figma`)
- `GET /handoffs`
- `GET /handoffs/:id`
- `GET /handoffs/:id/conversation` (`after` 또는 `since` query 지원)
- `GET /handoffs/:id/conversation/stream` (`after`/`since`, `interval` query 지원, SSE)
- `GET /handoffs/:id/projection`
- `GET /handoffs/:id/devlog-card`
- `POST /handoffs/:id/devlog-ingest`
- `POST /handoffs/:id/devlog-sync`
- `POST /automation/devlog/sync-pending` (메인 에이전트가 automation surface를 로컬에 추가한 경우)
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
curl -N 'http://127.0.0.1:3850/mailbox/stream?agent=devlog-agent&after=2026-04-07T00:00:00.000Z&interval=2000'
```

```bash
curl -s 'http://127.0.0.1:3850/mailbox/devlog-agent/unread-count?threadId=thread_2026_04_07_001'
```

```bash
curl -s -X POST http://127.0.0.1:3850/mailbox/devlog-agent/ack \
  -H 'Content-Type: application/json' \
  -d '{"cursor":"2026-04-07T00:10:00.000Z","threadId":"thread_2026_04_07_001"}'
```

```bash
curl -s http://127.0.0.1:3850/dashboard/snapshot
```

```bash
curl -s http://127.0.0.1:3850/threads
```

```bash
curl -s -X POST http://127.0.0.1:3850/threads \
  -H 'Content-Type: application/json' \
  -d '{
    "channel": "bridge",
    "sourceAgent": "bridge-agent",
    "targetAgent": "review-agent",
    "title": "toolbar layout review"
  }'
```

```bash
curl -s -X POST http://127.0.0.1:3850/threads/thread_2026_04_22_001/deliverables \
  -H 'Content-Type: application/json' \
  -d '{
    "agent": "designer-agent",
    "artifacts": [
      {
        "type": "figma",
        "path": "/tmp/landing.fig",
        "label": "landing"
      }
    ],
    "note": "updated hero draft"
  }'
```

```bash
curl -s -X POST http://127.0.0.1:3850/threads/thread_2026_04_22_001/verification \
  -H 'Content-Type: application/json' \
  -d '{
    "agent": "designer-agent",
    "status": "ready-for-handoff",
    "completeIfReady": true,
    "criteria": [
      {
        "text": "CTA 유지",
        "status": "pass"
      }
    ],
    "note": "CTA 유지 확인"
  }'
```

```bash
curl -s http://127.0.0.1:3850/channels/docs/entries
```

```bash
curl -s 'http://127.0.0.1:3850/handoffs/handoff_2026_04_07_001/conversation?after=2026-04-07T00:06:30.000Z'
```

```bash
curl -N 'http://127.0.0.1:3850/handoffs/handoff_2026_04_07_001/conversation/stream?after=2026-04-07T00:06:30.000Z&interval=2000'
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
npm run cli -- mailbox-unread --agent devlog-agent --thread thread_2026_04_07_001
```

```bash
npm run cli -- ack-mailbox --agent devlog-agent --thread thread_2026_04_07_001 --cursor 2026-04-07T00:10:00.000Z
```

```bash
npm run cli -- watch-mailbox --agent devlog-agent --after 2026-04-07T00:00:00.000Z --interval 2000
```

```bash
npm run cli -- conversation handoff_2026_04_06_001
```

```bash
npm run cli -- watch-conversation handoff_2026_04_06_001 --after 2026-04-07T00:00:00.000Z --interval 2000
```

```bash
npm run cli -- list-threads --channel bridge
```

```bash
npm run cli -- list-threads --agent review-agent --include-read-state
```

```bash
npm run cli -- get-thread thread_2026_04_22_001 --agent review-agent --include-read-state
```

```bash
npm run cli -- append-thread-message thread_2026_04_22_001 --author review-agent --body "Spacing looks good now." --kind reply
```

```bash
npm run cli -- create-thread-handoff thread_2026_04_22_001 --input ./payload.json
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
- `list-threads`
- `get-thread`
- `thread-messages`
- `append-thread-message`
- `create-thread-handoff`
- `mailbox`
- `mailbox-unread`
- `ack-mailbox`
- `watch-mailbox`
- `conversation`
- `watch-conversation`
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
- `ingest-devlog`
- `sync-devlog`

`mailbox`, `watch-mailbox`, `conversation`, `watch-conversation` 동작 요약:
- `mailbox`: 현재 조건(`agent`, `status`, `channel`, `after`)으로 inbox snapshot 1회를 출력
- `mailbox-unread`: agent 기준 unread count와 unread handoff id 목록을 출력. `--thread <threadId>`를 주면 해당 thread만 집계한다
- `ack-mailbox`: agent mailbox의 읽음 cursor를 앞으로 이동. `--thread <threadId>`를 주면 thread scope ack를 전달한다
- `watch-mailbox`: 같은 snapshot을 interval poll로 반복. 새 handoff/activity가 있을 때만 출력
- `list-threads`: 기본 thread 목록을 출력하고, `--agent <name>` 또는 `--include-read-state`를 주면 로컬 store에서 계산한 `summaries`/`mailbox`를 함께 붙인다
- `get-thread`: thread 1개를 출력하고, `--agent <name>` 또는 `--include-read-state`를 주면 로컬 store에서 계산한 `summary`/`readState`를 함께 붙인다
- `conversation`: handoff 1개의 전체 conversation snapshot 1회를 출력
- `watch-conversation`: 같은 handoff conversation을 interval poll로 반복. delta 변경이 있을 때만 출력
- `watch-*` 명령은 `--once`를 주면 1회 실행 후 종료

cursor/nextAfter 의미:
- `mailbox.after`: 이번 조회에 사용한 입력 cursor(`--after`)
- `mailbox.lastReadAt`: 현재 agent mailbox가 마지막으로 읽었다고 기록된 시각
- `mailbox.unreadCount`: 현재 snapshot 기준 unread handoff 개수
- `mailbox.nextAfter`: 다음 poll에 사용할 권장 cursor (현재 결과의 최신 `updatedAt`)
- `mailbox.cursor`: `mailbox.nextAfter`와 동일한 alias 필드
- mailbox item에는 연결된 `threadId`가 함께 포함된다
- `delta.after`: `watch-conversation`에서 이번 delta 계산에 사용한 입력 cursor
- `delta.nextAfter`: 다음 conversation poll에 사용할 권장 cursor (status/message/artifact 타임스탬프 최대값)

polling 규칙:
- `after` 비교는 `>`(strict greater-than) 기준
- 권장 패턴은 매 루프마다 `nextAfter`를 다음 `after`로 넘기는 것
- 새 변경이 없으면 watch 명령은 cursor를 유지

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
- HTTP/MCP에서는 `autoRetryOnFailure`를 켜면 실패 시 재검증을 1회 수행
- 재시도 보정값은 `defaultParentId`, `fallbackIntentSections`, `retryPolicy.maxRetries`로 제어 가능
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
- `get_mailbox_unread_count`
- `ack_mailbox`
- `get_review_context`
- `list_threads`
- `create_thread`
- `get_thread`
- `get_thread_context`
- `get_thread_messages`
- `append_thread_message`
- `create_thread_handoff`
- `add_thread_deliverables`
- `record_thread_verification`
- `handoff_thread_for_review`
- `decide_review_thread`
- `get_conversation`
- `get_designer_context`
- `poll_mailbox_stream`
- `poll_conversation_stream`
- `append_reply`
- `preview_projection`
- `preview_devlog_card`
- `ingest_devlog_card`
- `sync_devlog_handoff`
- `sync_pending_devlogs`
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

`get_mailbox_unread_count`, `ack_mailbox`는 optional `threadId`를 받아 thread-scoped unread/ack 요청을 coordinator로 그대로 전달한다. `list_threads`, `get_thread`도 thread route가 `agent`/`includeReadState` query를 지원하면 그대로 전달하며, 이때 thread summary에 unread/read-state 필드가 함께 포함될 수 있다. `get_thread_context`는 `GET /threads/:id/context`를 감싸며 `agent`, `messageLimit`, `handoffLimit`, `includeClosed` query를 consumer surface로 그대로 전달한다. `add_thread_deliverables`는 `POST /threads/:id/deliverables`를 감싸서 활성 handoff에 산출물을 기록하고, `record_thread_verification`은 `POST /threads/:id/verification`을 감싸서 verification 결과를 남기고 필요하면 block/complete까지 이어간다. `handoff_thread_for_review`는 기존 thread context를 읽고 필요 시 readiness를 기록한 뒤, 같은 thread에 `review` 채널 follow-up handoff를 만들고 figma 산출물도 함께 넘긴다. `decide_review_thread`는 review-agent의 결정을 기록한다. `approved`는 review handoff를 완료하고 기본 review context에서 내리며, `changes-requested`는 같은 thread에 `figma` follow-up을 만들고 산출물을 복사한다. `blocked`는 review 큐에 계속 남겨 바로 해소할 수 있게 한다. `get_designer_context`는 designer consumer surface가 handoff, brief, channel 문맥을 한 번에 읽을 수 있도록 `GET /designer/context`를 감싸며, `channel`을 생략하면 MCP tool에서 기본값 `figma`를 사용한다. `get_review_context`는 `GET /review/context`를 감싸서 review-agent 기준 `focusThread`, `focusHandoff`, `focusBrief`, `focusChecklist`, `workQueue`를 한 번에 읽는다.

`GET /threads/:id/context` 응답은 현재 `task.designIntent`, `task.figmaBrief`, `task.executionPlan`, top-level `assessment`를 함께 포함한다. 즉 AI designer는 이 응답 하나로 목표, 제약, acceptance criteria, 현재 실행 단계, 남은 검증 항목을 한 번에 읽을 수 있다.

`GET /designer/context` 응답도 `focusExecutionPlan`, `focusAssessment`, `nextVerification`, `workQueue`를 포함한다. 그래서 consumer는 “지금 어떤 thread를 먼저 잡아야 하는지”뿐 아니라 “다음에 무엇을 검증해야 하는지”까지 한 번에 판단할 수 있다. 현재 `workQueue` 항목은 `assessmentStatus`, `executionStage`, `nextStep`, `queueScore`, `queueReason`까지 포함하므로, thread에 산출물 첨부나 verification 기록이 들어오면 우선순위와 다음 행동이 바로 다시 계산된다. 반대로 더 이상 designer handoff가 없고 unread도 없는 조용한 thread는 기본 큐에서 내려간다.

같은 thread 안에서 `figma` handoff와 `review` handoff가 번갈아 이어지는 루프도 지원한다. 예를 들어 review-agent가 `changes-requested`를 기록하면 같은 thread에 새 `figma` follow-up이 생기고, designer context는 thread의 원래 channel보다 활성 handoff의 channel/target agent를 우선 참고해 이 follow-up을 다시 작업 큐에 올린다.

사용 예시:

```bash
curl -s 'http://127.0.0.1:3850/designer/context?agent=designer-agent&channel=figma&limit=10&handoffLimit=5&briefLimit=3'
```

```bash
curl -s 'http://127.0.0.1:3850/threads/thread_2026_04_22_001/context?agent=review-agent&messageLimit=10&handoffLimit=5&includeClosed=true'
```

MCP tool 호출 예시:

```json
{
  "name": "get_thread_context",
  "arguments": {
    "id": "thread_2026_04_22_001",
    "agent": "review-agent",
    "messageLimit": 10,
    "handoffLimit": 5,
    "includeClosed": true
  }
}
```

```json
{
  "name": "get_designer_context",
  "arguments": {
    "agent": "designer-agent",
    "handoffLimit": 5,
    "briefLimit": 3
  }
}
```

```json
{
  "name": "add_thread_deliverables",
  "arguments": {
    "id": "thread_2026_04_22_001",
    "agent": "designer-agent",
    "artifacts": [
      {
        "type": "figma",
        "path": "/tmp/landing.fig",
        "label": "landing"
      }
    ],
    "note": "updated hero draft"
  }
}
```

```json
{
  "name": "record_thread_verification",
  "arguments": {
    "id": "thread_2026_04_22_001",
    "agent": "designer-agent",
    "status": "ready-for-handoff",
    "completeIfReady": true,
    "criteria": [
      {
        "text": "CTA 유지",
        "status": "pass"
      }
    ],
    "note": "CTA 유지 확인"
  }
}
```

```json
{
  "name": "handoff_thread_for_review",
  "arguments": {
    "id": "thread_2026_04_22_001",
    "agent": "designer-agent"
  }
}
```

```json
{
  "name": "get_review_context",
  "arguments": {
    "agent": "review-agent",
    "handoffLimit": 5,
    "briefLimit": 3
  }
}
```

```json
{
  "name": "decide_review_thread",
  "arguments": {
    "id": "thread_2026_04_22_001",
    "agent": "review-agent",
    "decision": "changes-requested",
    "note": "헤드라인을 더 짧게 만들고 CTA 대비를 높여 주세요."
  }
}
```

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
- `sync_pending_devlogs`

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
- `/Users/im_018/Documents/GitHub/2026_important/figma_skills/xlog/data/devlogs.json`

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

Bulk catch-up action:
- 메인 에이전트가 `/automation/devlog/sync-pending` endpoint를 로컬 coordinator에 추가했다면, consumer surface에서 pending devlog handoff 여러 건을 한 번에 따라잡을 수 있다.
- MCP tool `sync_pending_devlogs`는 `{ agent, limit?, note?, result? }`를 그대로 POST body로 전달한다.

HTTP:

```bash
curl -s -X POST http://127.0.0.1:3850/automation/devlog/sync-pending \
  -H 'Content-Type: application/json' \
  -d '{
    "agent": "devlog-agent",
    "limit": 10,
    "note": "bulk devlog sync started",
    "result": "bulk devlog sync completed"
  }'
```
