import './styles.css';
import { App } from './app.ts';

const root = document.getElementById('app');
if (!root) {
  throw new Error('#app root element is missing from index.html');
}

new App(root).mount();
