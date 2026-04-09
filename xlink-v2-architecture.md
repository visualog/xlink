# XLink V2 Architecture

`xlink`의 다음 단계는 handoff 저장소를 넘어, 에이전트 간 `conversation-first coordinator`로 확장하는 것이다.

## Goal

목표는 아래 흐름을 복붙 없이 연결하는 것이다.

1. 에이전트 A가 질문 또는 작업 요청 생성
2. 에이전트 B가 mailbox에서 감지하고 claim 또는 reply
3. 에이전트 A가 conversation에서 답변 확인
4. 필요한 경우 재질문, artifact 첨부, 상태 변경
5. 완료된 결과를 devlog, review, bridge 같은 채널로 동기화

즉 `xlink`는 아래를 동시에 다룬다.
- 작업 전달
- 대화 스레드
- 결과물 첨부
- 채널별 projection

## Design Shift

현재 `xlink`는 `handoff`가 중심이다.

- `handoff`
  작업 단위
- `message`
  부가 메모
- `artifact`
  첨부물

V2에서는 중심을 한 단계 올린다.

- `thread`
  대화 채널의 기본 단위
- `participant`
  대화에 참여하는 agent
- `message`
  질문, 답변, 결정, 시스템 이벤트
- `work item`
  특정 작업 또는 handoff
- `artifact`
  이미지, 코드, 파일 경로, 링크

즉 handoff는 계속 유지하되, 더 이상 유일한 중심 객체는 아니다.

## Object Model

### 1. Thread

대화의 루트 단위다.

권장 필드:
- `id`
- `title`
- `channel`
- `kind`
  - `question`
  - `handoff`
  - `review`
  - `sync`
- `status`
  - `open`
  - `waiting`
  - `claimed`
  - `blocked`
  - `resolved`
  - `archived`
- `sourceAgent`
- `targetAgents`
- `participants`
- `linkedHandoffIds`
- `linkedArtifacts`
- `createdAt`
- `updatedAt`
- `lastMessageAt`

### 2. Message

스레드 안의 실제 대화 단위다.

권장 필드:
- `id`
- `threadId`
- `author`
- `kind`
  - `question`
  - `reply`
  - `decision`
  - `note`
  - `system`
- `body`
- `artifacts`
- `createdAt`

### 3. Work Item / Handoff

실행 가능한 작업 단위다.

권장 필드:
- `id`
- `threadId`
- `channel`
- `priority`
- `status`
- `sourceAgent`
- `targetAgent`
- `payload`
- `result`
- `createdAt`
- `updatedAt`

### 4. Artifact

코드, 이미지, 파일 경로, 외부 URL을 통합한다.

권장 필드:
- `id`
- `threadId`
- `handoffId`
- `type`
  - `image`
  - `code`
  - `file`
  - `json`
  - `link`
- `label`
- `path`
- `language`
- `content`
- `createdAt`

## Recommended Runtime Model

V2는 `준실시간 polling`을 기본으로 한다.

이유:
- 구현 단순성
- 외부 에이전트 호환성
- CLI/MCP/HTTP 모두 대응 가능

권장 주기:
- 기본 polling: `1~3초`
- idle backoff: `5~15초`

이후 필요하면 SSE를 올린다.

## API Direction

현재 API 위에 아래를 추가하는 것이 좋다.

### Thread API
- `GET /threads`
- `POST /threads`
- `GET /threads/:id`
- `GET /threads/:id/messages`
- `POST /threads/:id/messages`
- `POST /threads/:id/participants`
- `POST /threads/:id/resolve`

### Mailbox API
- `GET /mailbox?agent=...`
- `GET /mailbox/:agent/unread-count`
- `POST /mailbox/:agent/ack`

### Work API
- `POST /threads/:id/handoffs`
- `POST /handoffs/:id/claim`
- `POST /handoffs/:id/complete`
- `POST /handoffs/:id/block`

### Artifact API
- `POST /threads/:id/artifacts`
- `GET /threads/:id/artifacts`

## Agent UX Model

에이전트는 아래 모델로 행동하면 된다.

1. mailbox poll
2. unread thread 확인
3. conversation 읽기
4. 자신이 처리할 수 있으면 claim 또는 reply
5. 중간 진행 상황을 message로 남김
6. 완료 시 handoff/status 갱신

이 구조가 되면 아래가 가능해진다.
- 다른 에이전트가 나에게 질문
- 내가 답변
- 그 에이전트가 재질문
- 내가 artifact 첨부
- 이후 devlog/review 채널로 자동 동기화

## Channel Strategy

채널은 projection 또는 routing 계층으로 유지한다.

권장 채널:
- `bridge`
- `devlog`
- `review`
- `docs`
- `figma`

즉 `thread`가 원본이고, 채널은 배포/동기화 대상이다.

## Migration Plan

### Phase 1
- 현재 handoff API 유지
- `thread` 개념 추가
- handoff 생성 시 기본 thread 자동 생성

### Phase 2
- mailbox를 thread 기반 unread 모델로 전환
- `conversation`을 thread API로 승격

### Phase 3
- artifact를 thread 중심으로 재배치
- devlog/review sync를 thread 결과 기반으로 고도화

### Phase 4
- SSE 또는 watch 모드 추가
- polling 없는 준실시간 UX 제공

## What Not To Do

초기에 아래까지 한 번에 가지 않는 것이 좋다.

- 복잡한 권한 시스템
- WebSocket 우선 설계
- 임의 스크립트 실행형 agent bus
- 과도하게 일반화된 workflow engine

지금은 `agent mailbox + thread + handoff + artifact`까지만 명확히 해도 충분히 강하다.

## Success Criteria

V2가 성공했다고 볼 기준:
- 다른 에이전트가 mailbox에서 질문을 감지할 수 있음
- conversation을 읽고 답변을 남길 수 있음
- 답변 후 재질문이 같은 thread에 쌓임
- handoff와 thread가 연결됨
- artifact가 thread에 연결됨
- devlog/review sync가 thread 결과를 기준으로 동작함

## Short Recommendation

가장 좋은 방향은 `xlink를 버리고 새로 만드는 것`이 아니라, 현재 `handoff + mailbox` 구조를 바탕으로 `thread-first coordinator`로 확장하는 것이다.
