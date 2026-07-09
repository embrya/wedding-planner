# Wedding Planner Calendar

모바일 우선 웨딩 연간 캘린더입니다. 플래너가 신랑/신부 계정을 발급하고, 주별 메모와 일별 메모를 관리합니다. 신랑/신부는 조회 전용입니다.

## 기능

- 최초 관리자 로그인 `admin / admin`
- Firebase 이메일/비밀번호 로그인
- 플래너, 신랑, 신부 역할 분리
- 오늘 기준 12개월 달력
- 주별 메모, 일별 메모
- 일별 메모가 있는 날짜 별색 표시
- 오늘 날짜 별색 표시
- 하단 다가올 이벤트 요약
- 인쇄용 연간 달력 PDF 저장
- 휴대폰 사진첩 저장용 PNG 다운로드

## 최초 로그인

앱을 처음 열면 아래 계정으로 바로 로그인할 수 있습니다.

```text
아이디: admin
비밀번호: admin
```

Firebase 설정 전에는 브라우저 `localStorage`에 저장되는 로컬 모드로 동작합니다. 플래너 화면에서 신랑/신부 로그인 아이디와 임시 비밀번호를 발급할 수 있고, 발급한 계정도 같은 로그인 화면에서 사용할 수 있습니다.

## Firebase 설정

Firebase를 연결하면 이메일/비밀번호 기반 실사용 로그인으로 전환할 수 있습니다.

1. Firebase 프로젝트를 만들고 Authentication에서 이메일/비밀번호 로그인을 켭니다.
2. Cloud Firestore를 만듭니다.
3. `firestore.rules` 내용을 Firebase 콘솔의 Firestore Rules에 배포합니다.
4. Firebase 콘솔에서 플래너 이메일/비밀번호 계정을 1개 만듭니다.
5. `firebase-config.js`의 placeholder 값을 Firebase Web App 설정값으로 교체합니다.
6. 앱에 플래너 계정으로 로그인하면 초기 설정 화면에서 웨딩을 생성할 수 있습니다.

## GitHub Pages 배포

이 프로젝트는 빌드 과정 없이 정적 파일로 동작합니다. GitHub 저장소 이름을 `wedding-planner`로 만들고 `main` 브랜치에 푸시하면 `.github/workflows/pages.yml`이 GitHub Pages에 배포합니다.

Firebase Web App config는 비밀키가 아니며, 실제 보안은 Firestore Rules가 담당합니다. GitHub Pages에서 앱이 동작하려면 `firebase-config.js`가 저장소에 포함되어 있어야 합니다.

## 로컬 확인

정적 서버로 실행합니다.

```bash
python3 -m http.server 5173
```

브라우저에서 `http://localhost:5173`을 엽니다.
