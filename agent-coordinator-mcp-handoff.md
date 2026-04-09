# XLink Agent Coordinator MCP Handoff

## Goal

이 문서는 에이전트끼리 직접 통신하는 것에 가장 가까운 로컬 coordinator/MCP를 구현하기 위한 handoff 문서다.

목표:
- 브리지 작업 에이전트와 devlog 에이전트가 중간 전달 없이 handoff를 주고받을 수 있게 한다
- 썸네일, 코드 스니펫, Figma 결과물 같은 artifact를 함께 전달할 수 있게 한다
- 향후 MCP처럼 양쪽 에이전트가 같은 인터페이스로 사용할 수 있게 한다

## Why This Exists

현재 기본 환경에서는 아래가 어렵다.
- 에이전트끼리 직접 실시간 채팅
- 동일 세션 공유
- 외부 에이전트와 native 메시지 버스 연결

그래서 현실적인 대안으로 필요한 것은:
- 로컬 coordinator
- 작업 큐 + 메일박스 + artifact 전달
- HTTP API 우선, 이후 MCP adapter 확장 가능 구조

## Core Use Case

대표 시나리오:

1. 브리지 작업 에이전트가 기능 구현 또는 검증을 마친다
2. devlog 등록이 필요하다고 판단한다
3. coordinator에 handoff를 생성한다
4. payload와 artifact를 첨부한다
5. devlog 에이전트가 pending handoff를 조회한다
6. 해당 작업을 claim 한다
7. 카드 반영 후 complete 처리한다

## Recommended Scope

초기 구현 범위:
- handoff 생성
- handoff 목록 조회
- handoff claim
- handoff complete
- artifact 첨부

우선 채널:
- `devlog`

후속 채널:
- `bridge`
- `figma`
- `docs`
- `review`

## Recommended Tools

MCP 또는 coordinator 도구 이름 제안:

### `create_handoff`
- 새 handoff 생성

### `list_handoffs`
- 조건에 맞는 handoff 목록 조회

### `claim_handoff`
- 특정 handoff를 처리 중으로 변경

### `complete_handoff`
- 특정 handoff를 완료 처리

### `add_artifact`
- handoff에 썸네일/코드/Figma 결과물 경로 추가

### `append_message`
- 진행 메모 또는 blocked 이유 추가

## Suggested Data Model

```json
{
  "id": "handoff_2026_04_03_001",
  "channel": "devlog",
  "targetAgent": "devlog-agent",
  "sourceAgent": "bridge-agent",
  "title": "세션 패널 추가 내용 devlog 등록",
  "status": "pending",
  "priority": "medium",
  "createdAt": "2026-04-03T16:20:00+09:00",
  "claimedAt": null,
  "completedAt": null,
  "payload": {
    "type": "feature",
    "title": "활성 세션 패널 추가",
    "date": "03 April, 2026",
    "summary": "플러그인 UI에서 api/sessions 기반 세션 목록 표시를 추가했다.",
    "details": [
      "현재 세션을 강조 표시한다.",
      "목록 새로고침 버튼을 함께 제공한다."
    ],
    "tags": ["sessions", "ui", "plugin"],
    "commit": null,
    "files": [
      "figma-plugin/ui.html"
    ]
  },
  "artifacts": [
    {
      "type": "thumbnail",
      "path": "./assets/ui/sessions-panel.png",
      "label": "plugin sessions panel"
    }
  ],
  "messages": []
}
```

## Status Model

권장 상태:
- `pending`
- `claimed`
- `completed`
- `rejected`
- `blocked`

원칙:
- 한 handoff는 한 에이전트가 claim
- 완료 시 result 또는 메모 남김
- blocked일 때 이유 기록

## Storage Recommendation

### Option A. JSON Store

장점:
- 가장 단순
- 디버깅 쉬움
- 빠르게 프로토타입 가능

단점:
- 동시성 약함

### Option B. SQLite

장점:
- 상태 관리 안정적
- 조회 및 확장 용이

단점:
- 초기 구현이 조금 더 무거움

추천:
- 프로토타입은 JSON
- 계속 쓰면 SQLite 전환

## Transport Recommendation

권장 구조:
1. 로컬 HTTP server
2. 그 위에 MCP adapter

즉 내부적으로는 먼저 HTTP API를 만든다.

예:
- `POST /handoffs`
- `GET /handoffs`
- `POST /handoffs/:id/claim`
- `POST /handoffs/:id/complete`
- `POST /handoffs/:id/artifacts`

이후 필요하면 이 HTTP 계층 위에 MCP 도구를 씌운다.

## Recommended Build Phases

### Phase 1
- 로컬 coordinator server
- JSON store
- create/list/claim/complete

### Phase 2
- artifact support
- thumbnail/code/figma export path 첨부

### Phase 3
- MCP adapter
- 같은 인터페이스를 여러 에이전트가 사용 가능하게 정리

### Phase 4
- 검색
- 우선순위
- 채널 확장
- 상태 필터

## Devlog Integration Requirements

devlog 채널과 연결할 때 payload는 최소 아래 구조를 맞춰야 한다.
- `type`
- `title`
- `date`
- `details`
- `tags`

권장 추가:
- `summary`
- `status`
- `version`
- `commit`
- `files`
- `thumbnail`
- `codeSnippets`

즉 devlog ingestion 규약과 맞아야 한다.

참고:
- `/Users/im_018/Documents/GitHub/2026_important/figma_skills/devlog/devlog-agent-handoff.md`

## Suggested File Layout

```text
xlink/
  src/
    server.js
    store.js
    routes/
      handoffs.js
      artifacts.js
  data/
    handoffs.json
  README.md
```

MCP adapter를 붙이면:

```text
xlink-mcp/
  src/
    server.js
    tools.js
```

## Constraints

- 너무 무거운 인프라는 피한다
- 초기엔 로컬 단일 사용자 시나리오만 만족해도 충분
- 사람이 읽어도 handoff 내용을 이해할 수 있어야 함
- artifact는 상대경로 기반으로 관리 가능해야 함

## Definition Of Done

아래가 되면 1차 완료:
- 브리지 작업 에이전트가 handoff 생성 가능
- devlog 에이전트가 pending handoff 조회 가능
- devlog 에이전트가 claim/complete 가능
- thumbnail/code/Figma 결과물 artifact 첨부 가능
- 최소 하나의 devlog 카드 생성 흐름을 coordinator로 재현 가능

## One-Line Instruction For Builder Agent

> 브리지 작업 에이전트와 devlog 에이전트가 파일 전달 없이 협업할 수 있도록, 로컬에서 동작하는 lightweight handoff coordinator를 구현하라. 초기 범위는 handoff 생성/조회/claim/complete와 artifact 첨부이며, 향후 MCP adapter로 감쌀 수 있게 HTTP API 우선 구조로 설계하라.

