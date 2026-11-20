import './style.css';
export const metadata = { title: 'Signage Studio', description: 'Beheer vijf digitale schermen' };
export default function Layout({ children }) {
  return <html lang="nl"><head><link rel="stylesheet" href="/menu-board.css" /></head><body>{children}</body></html>;
}
