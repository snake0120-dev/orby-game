import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import Zone2 from './Zone2';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Zone2 />
  </StrictMode>,
);
