let cameraStream = null;
let capturedPhotoData = null;

const els = {
  video: () => document.getElementById('camera-video'),
  preview: () => document.getElementById('photo-preview'),
  placeholder: () => document.getElementById('photo-placeholder'),
  status: () => document.getElementById('camera-status'),
  startBtn: () => document.getElementById('start-camera-btn'),
  captureBtn: () => document.getElementById('capture-btn'),
  retakeBtn: () => document.getElementById('retake-btn'),
};

function camT(key, fallback) {
  return typeof t === 'function' ? t(key) : fallback;
}

function setCameraStatus(text, isError = false) {
  const el = els.status();
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? 'var(--error)' : '';
}

function showCapturedPreview(dataUrl) {
  capturedPhotoData = dataUrl;
  const preview = els.preview();
  const video = els.video();
  const placeholder = els.placeholder();
  preview.src = dataUrl;
  preview.classList.remove('hidden');
  placeholder.classList.add('hidden');
  video.classList.add('hidden');
  els.captureBtn()?.classList.add('hidden');
  els.retakeBtn()?.classList.remove('hidden');
  stopCamera();
  setCameraStatus(camT('cameraCaptured', 'Photo captured'));
}

function resetPhotoUI() {
  capturedPhotoData = null;
  const preview = els.preview();
  preview.src = '';
  preview.classList.add('hidden');
  els.placeholder()?.classList.remove('hidden');
  els.retakeBtn()?.classList.add('hidden');
  els.startBtn()?.classList.remove('hidden');
  setCameraStatus(camT('cameraHint', 'Use camera for live photo capture'));
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setCameraStatus(camT('cameraNotSupported', 'Camera not supported'), true);
    return;
  }

  const constraints = [
    { video: { facingMode: { exact: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
    { video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
    { video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false },
  ];

  try {
    stopCamera();
    let stream = null;
    let lastError = null;
    for (const constraint of constraints) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraint);
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (!stream) throw lastError || new Error('No camera available');

    cameraStream = stream;
    const video = els.video();
    video.srcObject = stream;
    video.classList.remove('hidden');
    els.placeholder()?.classList.add('hidden');
    els.preview()?.classList.add('hidden');
    els.startBtn()?.classList.add('hidden');
    els.captureBtn()?.classList.remove('hidden');
    els.retakeBtn()?.classList.add('hidden');
    capturedPhotoData = null;
    setCameraStatus(camT('cameraActive', 'Camera active — click Capture Photo'));
  } catch (err) {
    setCameraStatus(
      err.name === 'NotAllowedError'
        ? camT('cameraDenied', 'Camera permission denied')
        : camT('cameraError', 'Could not open camera'),
      true
    );
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  const video = els.video();
  if (video) video.srcObject = null;
}

function capturePhoto() {
  const video = els.video();
  if (!video?.videoWidth) return;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);
  showCapturedPreview(canvas.toDataURL('image/jpeg', 0.85));
}

function getCapturedPhotoData() {
  return capturedPhotoData;
}

function initCameraControls() {
  document.getElementById('start-camera-btn')?.addEventListener('click', startCamera);
  document.getElementById('capture-btn')?.addEventListener('click', capturePhoto);
  document.getElementById('retake-btn')?.addEventListener('click', () => {
    resetPhotoUI();
    startCamera();
  });
}

function onCameraLangChange() {
  if (capturedPhotoData) {
    setCameraStatus(camT('cameraCaptured', 'Photo captured'));
  } else if (cameraStream) {
    setCameraStatus(camT('cameraActive', 'Camera active'));
  } else {
    setCameraStatus(camT('cameraHint', 'Use camera'));
  }
}

document.addEventListener('DOMContentLoaded', initCameraControls);
window.addEventListener('beforeunload', stopCamera);
