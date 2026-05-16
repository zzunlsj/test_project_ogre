# Claude Project — OGRE 웹 게임 (Phaser 3 + TypeScript)

## 스킬 트리거

- **web-action-game**: "게임 만들어줘", "스테이지 추가", "적 추가", "레벨 설계", "전투 시스템", "UI 만들어줘", "밸런스 조정", "보스 추가", "버그 수정", "OGRE", "방어군", "헥사 맵", 기존 결과 수정/재실행 요청

## 게임 스펙 요약

- **게임**: OGRE by Steve Jackson (헥사 턴제 전략)
- **시나리오**: Mk.III OGRE vs 방어군 표준
- **모드**: 1P vs AI (Easy) / 2P 로컬 대전
- **그래픽**: Apple II 그린 포스포 CRT 스타일
- **주요 메카닉**: 헥사 이동, CRT 판정, 주사위 홀드 게이지(파동 타이밍 미세 편향), GEV 2차 이동, OGRE 궤도 손상

## 변경 이력

- 2026-04-25: 초기 하네스 구축 — game-architect, gameplay-engineer, level-designer, ui-engineer, qa-tester 에이전트 + ios-action-game 오케스트레이터 스킬 생성
- 2026-05-05: iOS → 웹 전환 — Phaser 3 + TypeScript + Vite, 스킬명 web-action-game으로 교체
- 2026-05-05: OGRE 기획 확정 — Mk.III 시나리오, CRT 스타일, 디바이스별 레이아웃(PC/Tablet/Mobile), 주사위 홀드 메카닉, 에이전트 전체 OGRE 특화 업데이트
