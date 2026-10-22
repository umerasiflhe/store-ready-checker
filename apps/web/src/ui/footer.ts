import webPkg from '../../package.json' with { type: 'json' };
import rulesJson from '../../../../rules/rules.json' with { type: 'json' };

const REPO_URL = 'https://github.com/umerasiflhe/store-ready-checker';
const PRIVACY_DOC_URL = `${REPO_URL}/blob/main/docs/PRIVACY.md`;

export function renderTrustPanel(container: HTMLElement): void {
  const panel = document.createElement('p');
  panel.className = 'trust-panel';

  const strong = document.createElement('strong');
  strong.textContent = 'Your file never leaves this browser.';
  const rest = document.createTextNode(
    ' Analysis runs in a Web Worker on your device; a Content-Security-Policy blocks any ' +
      'outgoing request while it runs. ',
  );
  const link = document.createElement('a');
  link.href = PRIVACY_DOC_URL;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'How this is enforced.';

  panel.append(strong, rest, link);
  container.append(panel);
}

export function renderFooter(container: HTMLElement): void {
  const footer = document.createElement('footer');

  const left = document.createElement('span');
  left.textContent = `store-ready v${webPkg.version} · rules ${rulesJson.rulesVersion}`;

  const right = document.createElement('span');
  const repoLink = document.createElement('a');
  repoLink.href = REPO_URL;
  repoLink.target = '_blank';
  repoLink.rel = 'noopener noreferrer';
  repoLink.textContent = 'GitHub';
  right.append(repoLink);

  const contactUrl = import.meta.env.VITE_CONTACT_URL as string | undefined;
  if (contactUrl) {
    right.append(document.createTextNode(' · '));
    const contactLink = document.createElement('a');
    contactLink.href = contactUrl;
    contactLink.target = '_blank';
    contactLink.rel = 'noopener noreferrer';
    contactLink.textContent = 'Need help fixing this?';
    right.append(contactLink);
  }

  const disclaimer = document.createElement('span');
  disclaimer.textContent = 'Not affiliated with Apple or Google.';

  footer.append(left, disclaimer, right);
  container.append(footer);
}
