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
const BRANCH = 'gh-pages';     // 깃허브가 웹으로 띄우는 가지
const TMP_BRANCH = 'gh-pages-담는중'; // 담는 동안만 쓰는 이름. 끝나면 지운다.
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
/* 지난번이 중간에 멈췄으면 작업칸이 **장부에만 남아** 있어서 다음 번이 같은
   이름으로 못 만든다. 폴더를 지우는 것과 장부를 지우는 건 다른 일이다. */
run('git', ['worktree', 'prune']);
/* 지난 번 것을 끌어오지 않는다 — `--orphan` 은 역사 없는 빈 가지다.
   올라가는 건 늘 지금 dist 뿐이라 저장소가 그림으로 불어나지 않는다. */
run('git', ['worktree', 'add', '--detach', WORK]);
/* 담는 가지를 **매번 새로 판다.** 같은 이름이 남아 있으면 `--orphan` 이 거절한다
   (지난번 것이 지워지지 않고 남아 있을 수 있다). 밀어 넣을 때 `HEAD:gh-pages` 로
   보내므로 여기 이름이 무엇이든 웹에 올라가는 가지 이름은 안 바뀐다. */
try { run('git', ['branch', '-D', TMP_BRANCH], { stdio: 'pipe' }); } catch { /* 없으면 됐다 */ }
run('git', ['checkout', '--orphan', TMP_BRANCH], { cwd: WORK });
run('git', ['rm', '-rq', '--cached', '.'], { cwd: WORK, stdio: 'pipe' });
/* 비울 때 `*` 만 쓰면 `.gitignore` 같은 점으로 시작하는 파일이 남아 그대로
   웹에 올라간다. `.git` 만 빼고 전부 치운다. */
run('bash', ['-c',
  `find "${WORK}" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} + ` +
  `&& cp -R "${root}/dist/." "${WORK}/"`]);
run('git', ['add', '-A'], { cwd: WORK });
run('git', ['commit', '-qm', `웹 올림 — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`], { cwd: WORK });

console.log('\n[3/3] 깃허브로');
run('git', ['push', '-f', 'origin', `HEAD:${BRANCH}`], { cwd: WORK });

run('git', ['worktree', 'remove', '--force', WORK]);
try { run('git', ['branch', '-D', TMP_BRANCH], { stdio: 'pipe' }); } catch { /* 이미 없다 */ }
console.log(`\n끝났습니다. 1~2분 뒤 → https://snake0120-dev.github.io${BASE}\n`);
