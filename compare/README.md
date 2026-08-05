# 비교 페이지 — 실제 격자 모형 ↔ 하위헌스-장애물 모형

두 앱을 나란히 띄워 같은 조건에서 무엇이 달라지는지 보는 페이지입니다.

## 반드시 로컬 서버로 여세요 — 더블클릭으로는 열리지 않습니다

```
cd Faraday
npx serve .
```
그다음 브라우저에서 **`http://localhost:3000/compare/`** 를 엽니다.

`file://` 로 열면 동작하지 않습니다. `file://` 문서는 브라우저가 **unique origin** 으로
취급해 iframe 사이 통신(`postMessage` · `contentDocument`)이 전부 막히기 때문입니다.
이 프로젝트의 다른 페이지들과 달리 이 페이지만 서버가 필요합니다.

## iframe 주소에 디렉터리 URL 을 쓰는 이유

이 페이지는 좌우 iframe 을 이렇게 가리킵니다:

```html
<iframe src="../?embed=1">          <!-- 실제 격자 모형 -->
<iframe src="../huygens/?embed=1">  <!-- 하위헌스 대조군 -->
```

**`../index.html?embed=1` 로 쓰면 동작하지 않습니다.** `npx serve` 의 clean-URL 기능이
`/index.html` 을 `/index` 로 301 리다이렉트하면서 **쿼리스트링을 버리기** 때문입니다.
실측:

| 요청 | 응답 |
|---|---|
| `GET /index.html?embed=1` | `301 Moved Permanently` · `Location: /index` ← **쿼리 소실** |
| `GET /?embed=1` | `200 OK` ← 쿼리 보존 |
| `GET /huygens/index.html?embed=1` | `301` · `Location: /huygens/index` ← **쿼리 소실** |
| `GET /huygens/?embed=1` | `200 OK` ← 쿼리 보존 |

`embed=1` 이 풀리면 앱의 설정 패널이 그대로 보이면서 캔버스 폭이 0 이 됩니다.
디렉터리 URL 은 `serve` · python `http.server` · nginx 어디서나 동작합니다.

## 구조

- **파동 그림(좌우 3밴드 캔버스)** = iframe. 각 앱을 그대로 띄웁니다.
  `?embed=1` 이 설정 패널을 숨겨 캔버스만 남깁니다.
- **마스터 컨트롤바** = `bridge.js` 프로토콜(`postMessage`)로 양쪽에 동시 전파합니다.
  기존 `script.js` 가 IIFE 라 내부 상태에 접근할 수 없으므로, 슬라이더 값을 바꾸고
  `input` 이벤트를 쏘는 **DOM 이벤트 방식**으로만 제어합니다.
- **하단 정량 패널** = `compare/script.js` 가 **직접 계산**합니다. iframe 통신에
  의존하지 않으므로, 동기화가 실패해도 정량 결과는 살아남습니다.

> **현재 상태 — Phase 2-0 (배선 확인) 골격입니다.**
> 마스터 컨트롤은 λ 하나만 배선되어 있고, 하단 정량 패널·T(λ) 곡선·CSV 는 아직
> 없습니다. 페이지 아래의 진단줄은 배선 확인용이며 정량 패널이 아닙니다.

## 비교는 E∥ 조건에서만 정의됩니다

하위헌스-장애물 모형은 스칼라 이론이라 편광 개념이 없습니다. E⊥ 에서는 두 모형의
대응이 성립하지 않으므로 마스터 컨트롤바에 편광 선택을 두지 않습니다.
