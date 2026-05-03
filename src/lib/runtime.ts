const isBrowser = typeof window !== 'undefined';

export const IS_DESKTOP_RUNTIME =
  isBrowser && window.location.hostname === 'localhost' && window.location.port === '8000';

export const EXE_DOWNLOAD_URL =
  'https://github.com/varun-aahil/Info-Graph/releases/latest/download/InfoGraph.exe';
