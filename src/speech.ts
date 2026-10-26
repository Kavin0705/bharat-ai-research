export type SpeechResult = {
  isFinal: boolean;
  0: { transcript: string };
};

export type SpeechResultEvent = {
  resultIndex: number;
  results: ArrayLike<SpeechResult>;
};

export type SpeechErrorEvent = {
  error: string;
};

export type SpeechRecognizer = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognizerConstructor = new () => SpeechRecognizer;
type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognizerConstructor;
  webkitSpeechRecognition?: SpeechRecognizerConstructor;
};

export function createSpeechRecognizer(): SpeechRecognizer | null {
  const speechWindow = window as SpeechWindow;
  const SpeechRecognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
  return SpeechRecognition ? new SpeechRecognition() : null;
}
