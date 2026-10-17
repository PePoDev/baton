import './style.css';
import { $, say } from './ui';
import { enterDay, tap, startNextTake, startPractice, shareText, tick, syncAccount } from './game';

const pad = $('#pad');
pad.addEventListener('pointerdown', (e) => { e.preventDefault(); tap(); });

addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const tg = e.target as HTMLElement | null;
  if (tg && (tg.tagName === 'TEXTAREA' || tg.tagName === 'INPUT')) return;
  e.preventDefault();
  if (tg && tg.tagName === 'BUTTON') tg.blur();
  tap();
});

$('#bNext').onclick = (e) => { (e.currentTarget as HTMLElement).blur(); startNextTake(); };
$('#bPractice').onclick = (e) => { (e.currentTarget as HTMLElement).blur(); startPractice(); };
$('#bCopy').onclick = async (e) => {
  const btn = e.currentTarget as HTMLButtonElement, text = shareText(), box = $<HTMLTextAreaElement>('#shareBox');
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = 'Copied';
    setTimeout(() => { btn.textContent = 'Copy result'; }, 1600);
  } catch {
    box.value = text;
    box.hidden = false;
    box.focus();
    box.select();
    say('Copying is blocked here. Your result is selected below, so copy it from there.');
  }
};

enterDay();
tick();
setInterval(tick, 1000);
void syncAccount();
