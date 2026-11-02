import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * 개체 패널이 맞춘 자리를 **파일로 받는 창구** (개발 서버에서만).
 *
 * 패널 값은 원래 브라우저 저장소에만 남아서, 값을 넘기려면 사람이 복사해
 * 붙여야 했다. 천우태가 보고 있는 브라우저와 확인용 헤드리스 브라우저는 서로
 * 다른 저장소를 쓰기 때문에 그 복사를 건너뛸 방법이 없었다.
 *
 * 그래서 패널의 `파일로 저장` 이 여기로 보내고, 이 플러그인이
 * `<구역>-edits.json` 에 적는다. 그 다음은 그 구역 생성기에 반영하면 된다 —
 * 전시 빌드에는 아예 안 붙는다(`apply: 'serve'`).
 */
const EDIT_ZONES = ['zone2', 'zone3']

function zoneEdits(): Plugin {
  return {
    name: 'orby-zone-edits',
    apply: 'serve',
    configureServer(server) {
      for (const zone of EDIT_ZONES) server.middlewares.use(`/__${zone}-edits`, (req, res) => {
        /* **읽기도 받는다.** 패널 값이 브라우저 저장소에만 있으면 창마다 다른
           걸 본다 — 천우태가 보는 크롬, 미리보기 창, 확인용 헤드리스가 전부
           남의 집이다. 파일을 한 군데 두고 셋 다 그걸 읽게 한다. */
        if (req.method === 'GET') {
          readFile(resolve(__dirname, `${zone}-edits.json`), 'utf8')
            .then((body) => { res.setHeader('content-type', 'application/json'); res.end(body) })
            .catch(() => { res.setHeader('content-type', 'application/json'); res.end('{}') })
          return
        }
        if (req.method !== 'POST') { res.statusCode = 405; res.end('POST 만 받습니다'); return }
        let body = ''
        req.on('data', (c) => { body += c })
        req.on('end', () => {
          void writeFile(resolve(__dirname, `${zone}-edits.json`), body)
            .then(() => {
              server.config.logger.info(`[${zone}] 개체 자리를 ${zone}-edits.json 에 적었습니다`)
              res.setHeader('content-type', 'application/json')
              res.end('{"ok":true}')
            })
            .catch((e: unknown) => {
              res.statusCode = 500
              res.end(JSON.stringify({ ok: false, error: String(e) }))
            })
        })
      })
    },
  }
}

// https://vite.dev/config/
/**
 * 깃허브 페이지는 **주소 뒤에 저장소 이름이 붙는다** —
 * `snake0120-dev.github.io/orby-game/` 이다. 자산을 `/maps/...` 로 찾으면
 * 거기엔 아무것도 없다(그건 `snake0120-dev.github.io/maps/...` 를 본다).
 *
 * 그래서 퍼블리시용 빌드만 앞가지를 갈아 끼운다 — `ORBY_BASE` 를 주고 빌드하면
 * 그 값이 `import.meta.env.BASE_URL` 로 들어가고, 맵·오프닝 그림·글꼴을 읽는
 * 코드가 전부 그걸 앞에 붙여 쓰게 되어 있다(결정 ㊳ 식 한 군데 규칙).
 *
 * **`npm run dev` 와 평소 `npm run build` 는 안 바뀐다** — 환경변수가 없으면 `/` 다.
 */
const base = process.env.ORBY_BASE ?? '/'

export default defineConfig({
  base,
  plugins: [react(), zoneEdits()],
  build: {
    rollupOptions: {
      /* **전시용 빌드에는 게임 한 쪽만 담는다.** 결과물은 스플래시 → 2구역 →
         3구역이고, 구역 편집기(`zone2.html`·`zone3.html`)와 옛 대기화면
         (`opening.html`)은 작업용이다.

         **`npm run dev` 에서는 넷 다 그대로 열린다** — vite 개발 서버는 이 목록과
         상관없이 폴더에 있는 html 을 다 띄운다. 여기 적힌 건 `npm run build` 가
         담을 것뿐이다. 다시 담으려면 아래 줄들을 되살리면 된다. */
      input: {
        main: resolve(__dirname, 'index.html'),
        // opening: resolve(__dirname, 'opening.html'),
        // zone2: resolve(__dirname, 'zone2.html'),
        // zone3: resolve(__dirname, 'zone3.html'),
      },
    },
  },
})
