# XLink V2 Roadmap

## Priority 1

`thread`를 1급 객체로 추가한다.

작업:
- thread store 추가
- thread create/read/list API 추가
- handoff 생성 시 thread 자동 연결
- mailbox 응답에 `threadId` 포함

완료 기준:
- handoff 없이도 질문 thread를 생성할 수 있음
- conversation이 handoff 부속물이 아니라 thread 단위로 조회됨

## Priority 2

mailbox를 unread 중심으로 바꾼다.

작업:
- agent별 `lastReadAt` 또는 ack 모델 추가
- unread count API 추가
- mailbox snapshot에 unread 우선 정렬 추가

완료 기준:
- 다른 에이전트가 새 질문을 놓치지 않음
- “읽음/안 읽음” 상태를 구분 가능

## Priority 3

reply/message 종류를 늘리고 artifact를 thread 중심으로 옮긴다.

작업:
- `question`, `reply`, `decision`, `system`, `note` 메시지 분리
- thread artifacts API 추가
- code/image/file/link attachment 규격 통일

완료 기준:
- 질문/답변/결정이 섞여도 읽기 쉬움
- 이미지나 코드 블록이 대화 맥락에 붙음

## Priority 4

channel sync를 thread 결과 중심으로 재정리한다.

작업:
- devlog sync가 thread summary를 입력으로 받게 변경
- review channel sync 추가 정리
- bridge 작업 로그와 thread 연결

완료 기준:
- 작업 thread 하나로 devlog 카드와 review 기록이 이어짐

## Priority 5

준실시간 UX를 다듬는다.

작업:
- CLI watch/poll 모드
- mailbox polling 최적화
- SSE 가능성 검토

완료 기준:
- 복붙 없이 에이전트 간 왕복 대화 가능
- 체감상 실시간에 가까운 협업 흐름 확보

## Recommended Build Order

1. thread model
2. mailbox unread/ack
3. thread messages + artifacts
4. devlog/review sync v2
5. watch/sse

## Immediate Next Build

가장 먼저 구현할 실제 단위:
- `GET /threads`
- `POST /threads`
- `GET /threads/:id/messages`
- `POST /threads/:id/messages`
- `POST /threads/:id/handoffs`
- `GET /mailbox/:agent/unread-count`
- `POST /mailbox/:agent/ack`

## Example Use Case

1. bridge-agent가 thread 생성
2. question message 추가
3. review-agent가 mailbox에서 unread 감지
4. reply message 추가
5. bridge-agent가 same thread에서 재질문
6. 해결 후 handoff complete
7. devlog sync

이 시나리오가 자연스럽게 되면 V2의 핵심 가치는 이미 확보된 것이다.
