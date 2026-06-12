/**
 * Web Speech API — voice input for patient form fields.
 * Supports Hindi (hi-IN) and English (en-IN).
 */
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;
let activeFieldId = null;
let activeMicBtn = null;

function isVoiceSupported() {
  return Boolean(SpeechRecognition);
}

function getSpeechLang() {
  return typeof currentLang !== 'undefined' && currentLang === 'hi' ? 'hi-IN' : 'en-IN';
}

function extractDigits(text, maxLen = 10) {
  const wordMap = {
    zero: '0', one: '1', two: '2', three: '3', four: '4',
    five: '5', six: '6', seven: '7', eight: '8', nine: '9',
    शून्य: '0', एक: '1', दो: '2', तीन: '3', चार: '4',
    पांच: '5', पाँच: '5', छह: '6', सात: '7', आठ: '8', नौ: '9',
    दस: '10', ग्यारह: '11', बारह: '12', तेरह: '13', चौदह: '14',
    पंद्रह: '15', सोलह: '16', सत्रह: '17', अठारह: '18', उन्नीस: '19',
    बीस: '20', तीस: '30', चालीस: '40', पचास: '50',
  };
  let normalized = text.toLowerCase();
  Object.entries(wordMap).forEach(([word, digit]) => {
    normalized = normalized.replace(new RegExp(word, 'gi'), digit);
  });
  return normalized.replace(/\D/g, '').slice(0, maxLen);
}

function mapGender(text) {
  const lower = text.toLowerCase();
  const maleWords = ['male', 'man', 'boy', 'm', 'पुरुष', 'मर्द', 'लड़का', 'ladka'];
  const femaleWords = ['female', 'woman', 'girl', 'f', 'महिला', 'स्त्री', 'औरत', 'लड़की', 'ladki'];
  if (maleWords.some((w) => lower.includes(w))) return 'Male';
  if (femaleWords.some((w) => lower.includes(w))) return 'Female';
  if (lower.includes('other') || lower.includes('अन्य')) return 'Other';
  return null;
}

function mapBloodGroup(text) {
  const cleaned = text.toUpperCase().replace(/\s+/g, '');
  const groups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  for (const g of groups) {
    if (cleaned.includes(g.replace('+', 'PLUS').replace('-', 'MINUS'))) return g;
    if (cleaned.includes(g)) return g;
  }
  const spoken = text.toLowerCase();
  if (spoken.includes('ए पॉजिटिव') || spoken.includes('a positive')) return 'A+';
  if (spoken.includes('बी पॉजिटिव') || spoken.includes('b positive')) return 'B+';
  if (spoken.includes('ओ पॉजिटिव') || spoken.includes('o positive')) return 'O+';
  return null;
}

function processTranscript(fieldId, transcript) {
  const field = document.getElementById(fieldId);
  if (!field) return;

  const text = transcript.trim();
  if (!text) return;

  if (fieldId === 'search-input') {
    const digits = extractDigits(text, 10);
    field.value = digits.length >= 6 ? digits : text;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  if (fieldId === 'phone') {
    const digits = extractDigits(text, 10);
    if (digits) {
      field.value = digits;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return;
  }

  if (fieldId === 'age') {
    const age = extractDigits(text, 3);
    if (age) {
      field.value = Math.min(parseInt(age, 10), 130);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return;
  }

  if (fieldId === 'weight' || field.classList.contains('med-amount')) {
    const num = parseFloat(text.replace(/[^\d.]/g, ''));
    if (!isNaN(num) && num >= 0) {
      field.value = fieldId === 'weight' ? num : num.toFixed(2).replace(/\.?0+$/, '');
      field.dispatchEvent(new Event('input', { bubbles: true }));
      const list = field.closest('.medicines-list');
      if (list) updateMedicineTotal(list);
    }
    return;
  }

  if (fieldId === 'gender') {
    const gender = mapGender(text);
    if (gender) {
      field.value = gender;
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return;
  }

  if (fieldId === 'bloodGroup') {
    const bg = mapBloodGroup(text);
    if (bg) {
      field.value = bg;
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return;
  }

  if (field.tagName === 'TEXTAREA' && field.value.trim()) {
    field.value = `${field.value.trim()} ${text}`;
  } else {
    field.value = text;
  }

  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function setVoiceStatus(message, isError = false) {
  const el = document.getElementById('voice-status');
  if (!el) return;
  el.textContent = message || '';
  el.classList.toggle('hidden', !message);
  el.classList.toggle('voice-status-error', isError);
}

function stopVoice() {
  if (recognition) {
    try { recognition.stop(); } catch (_) { /* ignore */ }
  }
  if (activeMicBtn) {
    activeMicBtn.classList.remove('listening');
    activeMicBtn.setAttribute('aria-pressed', 'false');
  }
  activeFieldId = null;
  activeMicBtn = null;
}

function startVoice(fieldId, micBtn) {
  if (!isVoiceSupported()) {
    setVoiceStatus(t('voiceNotSupported'), true);
    return;
  }

  if (activeFieldId === fieldId && activeMicBtn === micBtn) {
    stopVoice();
    setVoiceStatus('');
    return;
  }

  stopVoice();
  activeFieldId = fieldId;
  activeMicBtn = micBtn;

  recognition = new SpeechRecognition();
  recognition.lang = getSpeechLang();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  micBtn.classList.add('listening');
  micBtn.setAttribute('aria-pressed', 'true');
  setVoiceStatus(t('voiceListening'));

  recognition.onresult = (event) => {
    let finalText = '';
    let interimText = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += transcript;
      else interimText += transcript;
    }
    if (finalText) {
      processTranscript(fieldId, finalText);
      setVoiceStatus(t('voiceDone'));
    } else if (interimText) {
      setVoiceStatus(`${t('voiceListening')}: ${interimText}`);
    }
  };

  recognition.onerror = (event) => {
    const errors = {
      'no-speech': 'voiceNoSpeech',
      'not-allowed': 'voiceDenied',
      network: 'voiceNetwork',
    };
    const key = errors[event.error] || 'voiceError';
    setVoiceStatus(t(key), true);
    stopVoice();
  };

  recognition.onend = () => {
    if (activeMicBtn) {
      activeMicBtn.classList.remove('listening');
      activeMicBtn.setAttribute('aria-pressed', 'false');
    }
    activeFieldId = null;
    activeMicBtn = null;
    setTimeout(() => {
      const status = document.getElementById('voice-status');
      if (status && !status.classList.contains('voice-status-error')) {
        status.classList.add('hidden');
      }
    }, 2500);
  };

  try {
    recognition.start();
  } catch (e) {
    setVoiceStatus(t('voiceError'), true);
    stopVoice();
  }
}

function initVoiceButtons(root = document) {
  root.querySelectorAll('.voice-btn:not([data-voice-init])').forEach((btn) => {
    btn.setAttribute('data-voice-init', '1');
    const fieldId = btn.getAttribute('data-field');
    btn.setAttribute('aria-label', t('voiceTap'));
    btn.title = t('voiceTap');

    if (!isVoiceSupported()) {
      btn.disabled = true;
      btn.title = t('voiceNotSupported');
      return;
    }

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      startVoice(fieldId, btn);
    });
  });

  if (!isVoiceSupported()) {
    const hint = document.querySelector('.voice-hint');
    if (hint) hint.textContent = t('voiceNotSupported');
  }
}

function onVoiceLangChange() {
  if (recognition && activeFieldId) {
    recognition.lang = getSpeechLang();
  }
  document.querySelectorAll('.voice-btn').forEach((btn) => {
    if (!btn.disabled) {
      btn.setAttribute('aria-label', t('voiceTap'));
      btn.title = t('voiceTap');
    }
  });
}
