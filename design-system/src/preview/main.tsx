import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../tokens/tokens.generated.css';
import '../styles/base.css';
import { Preview } from './Preview';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
