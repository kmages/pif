(() => {
  // Speak it: dictation runs in the browser. Only the text is sent, never audio.
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = document.querySelector('[data-mic]');
  const note = document.querySelector('#note');
  if (mic && note && SR) {
    mic.hidden = false;
    let rec = null;
    const idle = () => { rec = null; mic.textContent = 'Speak it'; mic.setAttribute('aria-pressed', 'false'); };
    mic.addEventListener('click', () => {
      if (rec) { rec.stop(); return; }
      rec = new SR();
      rec.lang = 'en-US';
      rec.interimResults = false;
      rec.onresult = (e) => {
        const said = Array.from(e.results).map((r) => r[0].transcript).join(' ').trim();
        note.value = `${note.value.trim()} ${said}`.trim().slice(0, 500);
      };
      rec.onend = idle;
      rec.onerror = idle;
      mic.textContent = 'Listening. Tap to stop';
      mic.setAttribute('aria-pressed', 'true');
      rec.start();
    });
  }

  for (const btn of document.querySelectorAll('[data-share]')) {
    if (!navigator.share) continue;
    btn.hidden = false;
    btn.addEventListener('click', () => {
      navigator.share({ text: btn.dataset.text, url: btn.dataset.url }).catch(() => {});
    });
  }

  for (const btn of document.querySelectorAll('[data-copy]')) {
    btn.addEventListener('click', async () => {
      const label = btn.textContent;
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        btn.textContent = 'Copied';
      } catch {
        btn.textContent = 'Press and hold the link to copy';
      }
      setTimeout(() => { btn.textContent = label; }, 2000);
    });
  }

  for (const input of document.querySelectorAll('input[readonly]')) {
    input.addEventListener('focus', () => input.select());
  }
})();
