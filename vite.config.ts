import { writeFile } from 'node:fs/promises'
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
 * `zone2-edits.json` 에 적는다. 그 다음은 `scripts/make-zone2.mjs` 에 반영하면
 * 된다 — 전시 빌드에는 아예 안 붙는다(`apply: 'serve'`).
 */
function zone2Edits(): Plugin {
  return {
    name: 'orby-zone2-edits',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__zone2-edits', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('POST 만 받습니다'); return }
        let body = ''
        req.on('data', (c) => { body += c })
        req.on('end', () => {
          void writeFile(resolve(__dirname, 'zone2-edits.json'), body)
            .then(() => {
              server.config.logger.info('[zone2] 개체 자리를 zone2-edits.json 에 적었습니다')
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
export default defineConfig({
  plugins: [react(), zone2Edits()],
  build: {
    rollupOptions: {
      input: {
        // 입구가 **셋 다 따로다.** 한쪽을 손봐도 다른 쪽이 안 흔들린다.
        main: resolve(__dirname, 'index.html'),
        opening: resolve(__dirname, 'opening.html'),
        // 2구역만 보는 화면 — 미리보기 그림과 나란히 놓고 구도를 맞출 때 쓴다
        zone2: resolve(__dirname, 'zone2.html'),
      },
    },
  },
})
