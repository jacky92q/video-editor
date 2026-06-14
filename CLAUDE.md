# 작업 규칙 (Claude)

## 브랜치 / 머지
- 개발은 기능 브랜치 `claude/video-editing-webapp-eb9f0a`에서 진행한다.
- **작업이 끝나면 항상 알아서 `main`에 머지하고 푸시한다.** (사용자가 매번 요청하지 않아도 자동으로)
  - 절차: 기능 브랜치에 커밋·푸시 → `main`으로 fast-forward 머지 → `origin main` 푸시 → 다시 기능 브랜치로 복귀.
- `main` 푸시 시 GitHub Pages 배포 워크플로우가 자동 실행된다.

## 배포
- 배포 URL: https://jacky92q.github.io/video-editor/
- `vite.config.ts`의 `base`는 `/video-editor/`로 유지한다.
- 배포 설정: 저장소 Settings → Pages → Source = **GitHub Actions**.

## 프로젝트
- Vite + React + TypeScript. 모든 비디오 처리는 브라우저 내에서 수행(서버 업로드 없음).
- 새 편집 기능은 `src/effects/`에 로직, `src/components/`에 패널 추가 후 `src/types.ts`의 `EFFECTS`에 등록한다.
