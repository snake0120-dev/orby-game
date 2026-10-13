import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ZonePage } from '../zoneedit/ZonePage';
import { ZONE3 } from '../zoneedit/spec';
import { terminal } from '../game/stages/03-terminal';
import '../index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ZonePage spec={ZONE3} stage={terminal} />
  </StrictMode>,
);
