import {createRoot} from 'react-dom/client';
import '@/app/globals.css';
import AuthGate from './auth-gate';
import Page from '@/app/page';
createRoot(document.getElementById('root')!).render(<AuthGate><Page/></AuthGate>);
