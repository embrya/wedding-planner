# Marryday Planner

모바일 우선 웨딩 캘린더와 플래너용 업체 레퍼런스 백오피스입니다. 플래너가 여러 커플의 일정과 계정, 공용 업체 자료와 커플별 견적을 관리하며 모든 기기에서 Supabase로 동기화됩니다. 신랑·신부 계정은 자신이 속한 웨딩 캘린더 한 건만 조회합니다.

## 기능

- 최초 관리자 로그인 `admin / admin`
- 플래너, 신랑, 신부 역할 분리
- 플래너용 전체 커플 12개월 통합 캘린더
- 다중 커플 등록, 검색형 전환, 운영 필터·정렬, 완료·보관·복원
- 커플별 구분 색상과 다가올 전체 일정
- 오늘 기준 12개월 달력
- 주별 메모, 일별 메모
- 일별 메모가 있는 날짜 별색 표시
- 오늘 날짜 별색 표시
- 하단 다가올 이벤트 요약
- 인쇄용 연간 달력 PDF 저장
- 휴대폰 사진첩 저장용 PNG 다운로드
- 사진 중심 업체 레퍼런스 피드와 검색·카테고리·저장 필터·정렬
- XLSX·XLS·CSV 양식 다운로드, 오류 미리보기, 최대 2,000건 업체 일괄 등록
- 플래너 공용 업체 자료실과 커플별 제안·견적·계약 상태
- 드레스샵, 웨딩홀, 예물, 스튜디오, 메이크업, 허니문 기본 카테고리
- 카테고리 직접 추가·삭제
- 업체별 가격, 연락처, 주소, 인스타그램, 계약 조건, 플래너 메모
- 업체별 복수 상품안, 포함 항목, 추가 비용, 할인·혜택
- 프로모션 기간, 예약금·가예약, 변경·취소·운영 정책
- 플래너 수수료율·정산 조건과 카카오톡·통화·공지 출처 메모
- 업체별 샘플 사진 최대 20장, 1,920px 고화질 적응형 압축과 업로드 용량 미리보기
- 공개할 금액·계약 조건을 고른 뒤 실행하는 전체화면 고객 프레젠테이션 모드
- 전체 웨딩 데이터와 사진 JSON 백업·복원
- Supabase Auth 초대 계정과 역할별 Row Level Security
- 비공개 Storage 버킷과 만료되는 사진 URL
- 플래너 전용 Google Calendar 단방향 동기화와 5분 재시도 큐

## Google Calendar 동기화

플래너 설정에서 하나의 `Marryday Planner` 보조 캘린더를 연결합니다. 활성 웨딩의 예식일과 일별 메모를 커플명이 포함된 종일 일정으로 만들며, 주별 메모는 동기화하지 않습니다. 앱에서 변경하면 즉시 처리하고 실패하거나 앱이 닫혀 있으면 Supabase Cron이 5분마다 큐를 다시 처리합니다.

- Edge Function: `supabase/functions/google-calendar-sync/index.ts`
- DB migration: `supabase/migrations/20260710_google_calendar_sync.sql`
- Cron definition: `supabase/calendar-sync-cron.sql`
- Google 서비스 계정 JSON과 Supabase 관리자 키는 Edge Function Secret에만 저장합니다.
- Cron 인증값은 Supabase Vault의 `calendar_sync_secret`에 저장하며 저장소에는 넣지 않습니다.

iPhone에서는 Google Calendar 앱에 `dafinest10@gmail.com` 계정으로 로그인한 뒤 `Marryday Planner` 캘린더만 표시합니다. iOS의 `설정 > 앱 > 캘린더 > 캘린더 계정`에는 이 Google 계정을 추가하지 않으면 Apple 기본 캘린더와 섞이지 않습니다.

## 업체 엑셀 일괄 등록

`레퍼런스 > 엑셀 등록`에서 양식을 내려받아 사용합니다. `업체명`, `카테고리`만 필수이며 상품안 3개, 추가 비용 3개, 계약·운영 정책, 수수료와 플래너 메모를 한 행에 입력할 수 있습니다.

같은 업체명이 이미 있으면 빈 셀은 기존 값을 유지하고 입력된 셀만 업데이트합니다. 새로운 카테고리명은 저장 시 자동 생성됩니다. 사진은 업체 일괄 등록 후 각 업체 상세 화면에서 추가합니다.

## 사진 저장

사용자가 등록한 업체 사진은 GitHub 저장소가 아니라 Supabase의 비공개 `vendor-media` 버킷에 저장됩니다. 업로드 전에 브라우저에서 긴 변을 최대 1,920px로 맞추고, 화질을 단계적으로 조절해 대체로 사진당 1.2MB 이하를 목표로 압축합니다. 선택 화면에서 원본과 실제 업로드 용량을 비교할 수 있습니다.

스토리지 공급자 호출은 `photoObjectStore`로 분리되어 있습니다. Supabase 무료 저장공간에 근접하면 인증용 Cloudflare Worker를 둔 R2 버킷으로 교체할 수 있으며, R2 비밀키를 브라우저 코드에 포함해서는 안 됩니다.

## 최초 로그인

앱을 처음 열면 아래 계정으로 바로 로그인할 수 있습니다.

```text
아이디: admin
비밀번호: admin
```

로그인, 일정, 업체 정보와 사진은 Supabase 프로젝트에 저장됩니다. 프런트엔드에는 브라우저 사용이 허용된 publishable key만 포함되며, secret key와 데이터베이스 비밀번호는 포함되지 않습니다. 테이블과 사진 버킷은 로그인 사용자, 웨딩 소속, 역할을 확인하는 RLS 정책으로 보호됩니다.

플래너 화면에서 신랑·신부 로그인 아이디와 임시 비밀번호를 발급할 수 있고, 발급한 계정도 같은 로그인 화면에서 사용할 수 있습니다. 최초 화면 로그인은 요청 사양대로 `admin / admin`이며 실제 인증 계정은 Supabase의 최소 비밀번호 길이를 만족하도록 호환 처리됩니다.

## Supabase

- Project ref: `pjqfeqeyfwzbjqddutki`
- Region: Seoul (`ap-northeast-2`)
- Schema: `supabase/schema.sql`
- Client configuration: `supabase-client.js`

`supabase/schema.sql`은 신규 프로젝트용 최종 스키마입니다. 기존 단일 웨딩 프로젝트는 `supabase/migrations/20260710_multi_wedding.sql`을 적용한 뒤 `supabase/migrations/20260710_google_calendar_sync.sql`을 적용하면 현재 데이터와 Storage 경로를 유지하면서 다중 웨딩 및 캘린더 동기화 구조로 전환됩니다.

`wedding_members`가 커플 계정과 웨딩을 1:1로 연결하고, `weddings.planner_id`가 플래너의 하위 웨딩을 구분합니다. 업체 원본은 플래너 공용이며 `wedding_vendor_selections`에 커플별 진행 상태, 개별 견적, 계약 조건과 내부 메모를 저장합니다. RLS는 신랑·신부의 다른 웨딩 및 업체 자료 접근을 차단합니다.

## GitHub Pages 배포

이 프로젝트는 빌드 과정 없이 정적 파일로 동작합니다. `main` 브랜치에 푸시하면 `.github/workflows/pages.yml`이 GitHub Pages에 배포합니다.

## 로컬 확인

정적 서버로 실행합니다.

```bash
python3 -m http.server 5173
```

브라우저에서 `http://localhost:5173`을 엽니다.
