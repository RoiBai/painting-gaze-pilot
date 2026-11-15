import ReactDOM from 'react-dom/client';
import App from './App';
import './style.css';
// One explicit engine owner; lifecycle cleanup is implemented independently of React renders.
ReactDOM.createRoot(document.getElementById('root')!).render(<App/>);
