---
name: web-action-game
description: "OGRE 헥사 전략 게임 개발 에이전트 팀을 조율하는 오케스트레이터. '게임 만들어줘', '스테이지 추가', '적 추가', '레벨 설계', '게임플레이 구현', '전투 시스템', 'UI 만들어줘', '버그 수정', '밸런스 조정', '새 보스 추가', '기존 결과 수정', '다시 만들어줘', 'OGRE', '방어군', '헥사 맵' 요청 시 반드시 이 스킬을 사용."
---

# OGRE Web Game Orchestrator

Steve Jackson의 OGRE 헥사 전략 게임을 Phaser 3 + TypeScript + Vite로 구현하는 에이전트 팀 오케스트레이터.
Mk.III OGRE vs 방어군 표준 시나리오, 1P vs AI / 2P 로컬 대전, CRT 그린 모니터 스타일.

## 프로젝트 스펙 (확정)

| 항목 | 내용 |
|------|------|
| 게임 | OGRE by Steve Jackson (헥사 턴제 전략) |
| 시나리오 | Mk.III OGRE vs 방어군 (표준) |
| 엔진 | Phaser 3.60+ + TypeScript 5 + Vite 5 |
| 모드 | 1P vs AI / 2P 로컬 대전 |
| 그래픽 | Apple II 그린 포스포 CRT 스타일 |
| 배포 | 정적 파일 → GitHub Pages / Netlify |
| 입력 | 마우스 + 터치 단일 코드 |

## 에이전트 구성

| 에이전트 | 역할 | 주요 출력 |
|---------|------|---------|
| game-architect | 씬 구조 + OGRE 데이터 스키마 + 인터페이스 | game-structure.md, data-schema.md, module-interfaces.md, package.json |
| gameplay-engineer | 헥사 그리드 + CRT 판정 + 주사위 홀드 + AI | hex-grid.ts, combat-system.ts, ogre-controller.ts, turn-manager.ts |
| level-designer | Tiled 호환 맵 + 방어군 배치 데이터 | level-data.json, scenario-spec.md |
| ui-engineer | CRT 씬 전체 + 디바이스별 레이아웃 + 주사위 게이지 | crt-theme.ts, hud-scene.ts, dice-gauge.ts, layout-manager.ts |
| qa-tester | 규칙 정합성 + 경계면 + 주사위 메카닉 + 브라우저 | rules-compliance.md, boundary-issues.md, qa-summary.md |

## 실행 모드: 하이브리드

| Phase | 모드 | 담당 |
|-------|------|------|
| Phase 1: 아키텍처 | 서브 에이전트 | game-architect |
| Phase 2: 병렬 개발 | **에이전트 팀** | gameplay-engineer + level-designer + ui-engineer |
| Phase 3: QA | 서브 에이전트 | qa-tester |
| Phase 4: 수정 | 에이전트 or 팀 | 이슈 해당 팀원 |

## 워크플로우

### Phase 0: 컨텍스트 확인

1. `_workspace/` 존재 여부 확인
2. 실행 모드 결정:
   - **미존재** → 초기 빌드, Phase 1부터
   - **존재 + 부분 수정 요청** → 해당 에이전트만 재실행
   - **존재 + 새 빌드 요청** → 기존을 `_workspace_{YYYYMMDD_HHMMSS}/`로 이동 후 Phase 1

### Phase 1: 아키텍처 (서브 에이전트)

```
Agent(
  subagent_type: "game-architect",
  model: "opus",
  prompt: "
    게임: OGRE 헥사 전략 (Steve Jackson)
    시나리오: Mk.III vs 방어군 표준
    기술: Phaser 3.60+ / TypeScript 5 / Vite 5
    그래픽: CRT 그린 모니터 스타일

    _workspace/01_architecture/ 에 생성:
    - game-structure.md (씬 흐름: Boot→Title→Menu→Mode→Side→Briefing→Setup→Game+UI→GameOver)
    - module-interfaces.md (TypeScript interface: HexCoord, OgreStats, DefenderUnit, TurnPhase, DiceResult)
    - data-schema.md (OGRE Mk.III 스탯, 방어군 스탯, CRT 테이블, 맵 스키마, 시나리오 배치 자원)
    - tech-stack.md
    - package.json (phaser, vite, typescript)
    - vite.config.ts
    - tsconfig.json
  "
)
```

### Phase 2: 병렬 개발 (에이전트 팀)

```
TeamCreate(
  team_name: "ogre-web-team",
  members: [
    {
      name: "gameplay-engineer",
      agent_type: "gameplay-engineer",
      model: "opus",
      prompt: "
        _workspace/01_architecture/module-interfaces.md Read
        _workspace/01_architecture/data-schema.md Read (OGRE 스탯, CRT, 맵 스키마)
        _workspace/03_gameplay/ 에 구현:
        - hex-grid.ts (오프셋 좌표, 이동범위, 사거리 계산)
        - combat-system.ts (CRT 판정 + 주사위 홀드 메카닉: 파동 속도 3단계, bias ±0.3)
        - ogre-controller.ts (OGRE 이동/무기/궤도 손상/이동력 연동)
        - defender-units.ts (방어군 유닛 상태 + GEV 2차 이동)
        - turn-manager.ts (턴/페이즈 관리 + EventEmitter)
        - ai-easy.ts (Easy AI: 랜덤 배치, 근접 우선 공격)
        - gameplay-spec.md
        ui-engineer에게 EventEmitter 이벤트 키 목록 SendMessage:
          phase-changed, unit-moved, combat-start, dice-rolled,
          unit-disabled, unit-destroyed, ogre-damaged, tread-changed, game-over
      "
    },
    {
      name: "level-designer",
      agent_type: "level-designer",
      model: "opus",
      prompt: "
        _workspace/01_architecture/data-schema.md Read (맵 스키마, 시나리오 배치 자원)
        _workspace/02_level-design/ 에 생성:
        - level-data.json (표준 21×13 헥사 맵, Northern/Central/Southern 존, 지형 정보)
        - scenario-spec.md (방어군 배치 자원: 보병20점+장갑12슬롯, CP 위치, OGRE 진입 지점)
        - difficulty-curve.md (Easy AI 배치 전략)
        gameplay-engineer에게 맵 좌표계 방식 SendMessage 공유
      "
    },
    {
      name: "ui-engineer",
      agent_type: "ui-engineer",
      model: "opus",
      prompt: "
        _workspace/01_architecture/module-interfaces.md Read
        gameplay-engineer로부터 EventEmitter 이벤트 키 SendMessage 수신 대기
        _workspace/04_ui/ 에 구현:
        - crt-theme.ts (CRT 색상 상수 + 글로우/스캔라인 유틸)
        - boot-title-scenes.ts (Boot/Title/Menu/Mode/Side/Briefing 씬)
        - game-setup-scenes.ts (Setup 배치 씬)
        - hud-scene.ts (UIScene: OGRE 상태패널 + 페이즈 표시)
        - layout-manager.ts (PC 16:9 / Tablet 16:9 / Mobile 세로 분기)
        - dice-gauge.ts (홀드 게이지: 파동 애니 + 릴리즈 연출)
        - combat-popup.ts (전투 판정 팝업)
        - game-over-scene.ts (결과 화면)
        - ui-spec.md
      "
    }
  ]
)
```

### Phase 3: QA (서브 에이전트)

```
Agent(
  subagent_type: "qa-tester",
  model: "opus",
  prompt: "
    교차 검증 대상 파일 모두 Read:
    - _workspace/01_architecture/data-schema.md (OGRE 스탯, CRT 기준값)
    - _workspace/01_architecture/game-structure.md (턴 시퀀스, 승리 조건)
    - _workspace/03_gameplay/gameplay-spec.md
    - _workspace/03_gameplay/combat-system.ts (CRT 로직, bias 범위)
    - _workspace/03_gameplay/turn-manager.ts (턴 시퀀스 구현)
    - _workspace/02_level-design/level-data.json (맵 좌표, 지형)
    - _workspace/04_ui/hud-scene.ts (EventEmitter 리스너 키)
    - _workspace/04_ui/dice-gauge.ts (파동 속도, 색상 변화 여부)
    - _workspace/04_ui/layout-manager.ts (디바이스 분기)
    - _workspace/04_ui/ui-spec.md

    _workspace/05_qa/ 에 생성:
    - bug-report.md
    - boundary-issues.md
    - rules-compliance.md (CRT/턴순서/스탯 정합성)
    - performance-report.md
    - qa-summary.md (차단 이슈 명시)
  "
)
```

### Phase 4: 수정 (조건부)
차단 이슈 발견 시 해당 에이전트만 재호출 → 수정 → QA 재검증

### Phase 5: 정리 및 보고
1. `_workspace/` 보존
2. 결과 요약: 생성 파일 목록, `npm install && npm run dev` 실행 방법, QA 결과, 배포 방법

## 데이터 흐름

```
[리더]
  → Agent(game-architect) → 01_architecture/ (스키마, 인터페이스, 빌드 설정)
                                    ↓
  → TeamCreate(ogre-web-team)
      gameplay-engineer ──SendMessage──→ ui-engineer     (EventEmitter 키)
      level-designer    ──SendMessage──→ gameplay-engineer (맵 좌표계)
           ↓                    ↓                ↓
      03_gameplay/        02_level-design/    04_ui/
                                    ↓
  → TeamDelete → Agent(qa-tester) → 05_qa/
                    ↓ (차단 이슈 시) 해당 에이전트 재호출
```

## 부분 재실행 가이드

| 요청 | 재실행 대상 |
|------|-----------|
| "CRT 계산 수정" | gameplay-engineer → qa-tester |
| "UI 레이아웃 수정" | ui-engineer → qa-tester (UI 부분) |
| "맵 수정" | level-designer → qa-tester |
| "주사위 메카닉 수정" | gameplay-engineer + ui-engineer → qa-tester |
| "AI 개선" | gameplay-engineer → qa-tester |

## 에러 핸들링

| 상황 | 전략 |
|------|------|
| game-architect 실패 | 재실행 1회 → 실패 시 스키마 재확인 요청 |
| 팀원 실패 | SendMessage 상태 확인 → 재시작 |
| QA 차단 이슈 3개+ | 사용자에게 우선순위 결정 요청 |
| 타임아웃 | 완료 모듈만 수집, 미완료 명시 |
