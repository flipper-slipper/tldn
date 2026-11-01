import { createRoot } from 'react-dom/client';
import { MapApp } from './App';
import { connectHost } from './host';
import './styles.css';

const toast = (msg: string) => window.dispatchEvent(new CustomEvent('vb-toast', { detail: msg }));
const root = createRoot(document.getElementById('root')!);

connectHost(toast).then(
  (host) => root.render(<MapApp host={host} />),
  (e) => root.render(<div className="center">VibeBlocks could not connect to the host: {String(e?.message ?? e)}</div>),
);
