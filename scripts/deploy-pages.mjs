// 빌드해서 **웹에 올리는** 한 걸음. `npm run deploy` 가 이걸 부른다.
//
// 깃허브 페이지는 `gh-pages` 라는 가지에 올라온 파일을 그대로 웹에 띄운다.
// 그래서 하는 일은 셋뿐이다 — 주소 앞가지를 맞춰 빌드하고, 그 결과만 담은
// 가지를 만들고, 밀어 넣는다.
//
// **왜 깃허브가 대신 빌드하게 하지 않았나** — 그 설비(`.github/workflows/`)를
// 올리려면 깃허브 토큰에 `workflow` 권한이 따로 있어야 하는데 지금 없다.
// 권한을 더 받으면 그쪽으로 옮길 수 있다. 결과물은 똑같다.
import { execFileSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.ORBY_BASE ?? '/orby-game/';
const BRANCH = 'gh-pages';
const WORK = resolve(root, '.deploy-tmp'); // 따로 쓰는 작업칸. 끝나면 지운다.

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: root, stdio: 'inherit', ...opts });

console.log(`\n[1/3] 빌드 — 앞가지 ${BASE}`);
run('npm', ['run', 'build'], { env: { ...process.env, ORBY_BASE: BASE } });

/* 깃허브 페이지는 원래 Jekyll 이라는 걸 한 번 거치는데, 그게 `_` 로 시작하는
   파일을 숨긴다. 이 파일 하나를 두면 거치지 않고 그대로 띄운다. */
writeFileSync(resolve(root, 'dist/.nojekyll'), '');

console.log(`\n[2/3] ${BRANCH} 가지에 담기`);
rmSync(WORK, { recursive: true, force: true });
/* 지난 번 것을 끌어오지 않는다 — `--orphan` 은 역사 없는 빈 가지다.
   올라가는 건 늘 지금 dist 뿐이라 저장소가 그림으로 불어나지 않는다. */
run('git', ['worktree', 'add', '--detach', WORK]);
run('git', ['checkout', '--orphan', BRANCH], { cwd: WORK });
run('git', ['rm', '-rq', '--cached', '.'], { cwd: WORK, stdio: 'pipe' });
run('bash', ['-c', `rm -rf "${WORK}"/* && cp -R "${root}/dist/." "${WORK}/"`]);
run('git', ['add', '-A'], { cwd: WORK });
run('git', ['commit', '-qm', `웹 올림 — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`], { cwd: WORK });

console.log('\n[3/3] 깃허브로');
run('git', ['push', '-f', 'origin', `HEAD:${BRANCH}`], { cwd: WORK });

run('git', ['worktree', 'remove', '--force', WORK]);
console.log(`\n끝났습니다. 1~2분 뒤 → https://snake0120-dev.github.io${BASE}\n`);
