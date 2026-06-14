# 🎞️ Clip Studio — 브라우저 비디오 에디터

React + TypeScript로 만든 **로컬 브라우저 전용** 비디오 에디터입니다.
파일은 서버로 전송되지 않고 모두 브라우저 안에서 처리됩니다.

## 현재 기능

- **mp4 업로드** — 드래그&드롭 또는 파일 선택 (mp4/webm/mov)
- **타임랩스** — 2×–60× 속도, 24/30fps로 영상을 압축해 만들고 다운로드

> 인코딩은 `<canvas>` + `MediaRecorder`로 처리됩니다. 출력 포맷은 브라우저가
> 지원하는 코덱에 따라 `mp4` 또는 `webm`으로 자동 선택됩니다.

## 로드맵 (다음 기능)

- ✂️ 구간 자르기(trim)
- 🎨 필터 / 색보정
- 💬 자막 오버레이

## 개발

```bash
npm install
npm run dev      # 개발 서버
npm run build    # 타입체크 + 프로덕션 빌드
npm run preview  # 빌드 결과 미리보기
```

## 구조

```
src/
  App.tsx                  # 전체 레이아웃 · 상태 관리
  types.ts                 # 도메인 타입 · 이펙트 레지스트리
  components/
    Uploader.tsx           # 드래그&드롭 업로드
    TimelapsePanel.tsx     # 타임랩스 설정 · 렌더 · 다운로드
  effects/
    timelapse.ts           # 프레임 샘플링 + 인코딩 로직
  utils/
    format.ts              # 시간/용량 포맷, 다운로드 헬퍼
```

새 기능은 `src/effects/`에 로직을, `src/components/`에 패널을 추가하고
`src/types.ts`의 `EFFECTS` 레지스트리에 등록하면 됩니다.
