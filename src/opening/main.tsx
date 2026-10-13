import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { Opening } from './Opening';

/**
 * 대기화면만 따로 띄우는 페이지 — `/opening.html`
 *
 * 게임(`index.html`)과 **완전히 분리된 입구**다. 대기화면을 손보다가 게임이
 * 망가질 일이 없고, 반대로 게임을 고쳐도 여기는 그대로다.
 * 둘이 합쳐질 때가 되면 `App.tsx` 의 첫 화면으로 옮겨 붙이면 된다.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Opening />
  </StrictMode>,
);
