import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface SpeechRecognitionResultItem {
  transcript: string;
  confidence?: number;
}

interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: {
    isFinal: boolean;
    [index: number]: SpeechRecognitionResultItem;
  };
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export interface VoiceCapability {
  sttSupported: boolean;
  ttsSupported: boolean;
  isIOS: boolean;
  isSafari: boolean;
}

export interface VoiceState {
  isRecording: boolean;
  transcript: string;
  interimTranscript: string;
  lastError: string | null;
  confidence: number | null;
}

export type VoiceErrorType =
  | "unsupported"
  | "permission_denied"
  | "recognition_error"
  | "network"
  | "empty_transcript"
  | "unknown";

interface VoiceAgentOptions {
  lang?: string;
  speechProfile?: {
    rate?: number;
    pitch?: number;
  };
  onFinalTranscript?: (text: string) => void;
  onError?: (type: VoiceErrorType, message: string) => void;
}

interface VoiceAgentApi {
  capability: VoiceCapability;
  state: VoiceState;
  startRecording: () => Promise<boolean>;
  stopRecording: () => void;
  speak: (text: string) => boolean;
  stopSpeaking: () => void;
  isSpeaking: boolean;
}

const IOS_REGEX = /iPad|iPhone|iPod/i;
const SAFARI_REGEX = /^((?!chrome|android).)*safari/i;

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  return ctor ?? null;
}

function getCapabilities(): VoiceCapability {
  if (typeof window === "undefined") {
    return { sttSupported: false, ttsSupported: false, isIOS: false, isSafari: false };
  }

  const userAgent = window.navigator.userAgent || "";
  return {
    sttSupported: !!getSpeechRecognitionCtor(),
    ttsSupported: typeof window.speechSynthesis !== "undefined",
    isIOS: IOS_REGEX.test(userAgent),
    isSafari: SAFARI_REGEX.test(userAgent),
  };
}

function pickVoice(
  synth: SpeechSynthesis,
  preferredLang: string
): SpeechSynthesisVoice | null {
  const voices = synth.getVoices();
  if (!voices.length) return null;

  const preferredLower = preferredLang.toLowerCase();
  const exact = voices.find((v) => v.lang.toLowerCase() === preferredLower);
  if (exact) return exact;

  const enNg = voices.find((v) => v.lang.toLowerCase().startsWith("en-ng"));
  if (enNg) return enNg;

  const enUs = voices.find((v) => v.lang.toLowerCase().startsWith("en-us"));
  if (enUs) return enUs;

  return voices.find((v) => v.lang.toLowerCase().startsWith("en")) ?? null;
}

export function normalizeAutomotiveTranscript(text: string): string {
  let normalized = text.toLowerCase();

  const replacements: Array<[RegExp, string]> = [
    [/turn on the aircon/g, "air conditioning on"],
    [/turn on the air con/g, "air conditioning on"],
    [/turn on the air conditioning/g, "air conditioning on"],
    [/check engine light/g, "check engine light"],
    [/battery level/g, "battery level"],
    [/low battery/g, "low battery"],
    [/fuel level/g, "fuel level"],
    [/gas level/g, "fuel level"],
    [/tyre pressure/g, "tire pressure"],
    [/tire pressure/g, "tire pressure"],
    [/handbrake/g, "parking brake"],
    [/parking break/g, "parking brake"],
    [/aircon/g, "air conditioning"],
    [/ac on/g, "air conditioning on"],
    [/ac off/g, "air conditioning off"],
    [/ignition on/g, "ignition on"],
    [/ignition off/g, "ignition off"],
    [/start the car/g, "ignition on"],
    [/stop the car/g, "ignition off"],
    [/overspeeding/g, "over speeding"],
    [/over speeding/g, "over speeding"],
  ];

  for (const [pattern, replacement] of replacements) {
    normalized = normalized.replace(pattern, replacement);
  }

  const trimmed = normalized.trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function useVoiceAgent({
  lang = "en-NG",
  speechProfile,
  onFinalTranscript,
  onError,
}: VoiceAgentOptions = {}): VoiceAgentApi {
  const capability = useMemo(() => getCapabilities(), []);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [state, setState] = useState<VoiceState>({
    isRecording: false,
    transcript: "",
    interimTranscript: "",
    lastError: null,
    confidence: null,
  });
  const [isSpeaking, setIsSpeaking] = useState(false);

  const safeOnError = useCallback(
    (type: VoiceErrorType, message: string) => {
      setState((prev) => ({ ...prev, lastError: message }));
      onError?.(type, message);
    },
    [onError]
  );

  const stopSpeaking = useCallback(() => {
    if (!capability.ttsSupported || typeof window === "undefined") return;
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setIsSpeaking(false);
  }, [capability.ttsSupported]);

  const stopRecording = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      recognition.stop();
    } catch {
      // Ignore runtime errors when recognition is already stopping.
    }
  }, []);

  const startRecording = useCallback(async (): Promise<boolean> => {
    if (!capability.sttSupported) {
      safeOnError("unsupported", "Voice input not supported on this browser. Type instead.");
      return false;
    }

    if (state.isRecording) return true;

    stopSpeaking();

    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            noiseSuppression: true,
            echoCancellation: true,
            autoGainControl: true,
          },
        });
        stream.getTracks().forEach((track) => track.stop());
      } catch (error) {
        const err = error as DOMException;
        if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
          safeOnError("permission_denied", "Microphone permission denied.");
        } else {
          safeOnError("unknown", err?.message || "Unable to access microphone.");
        }
        return false;
      }
    }

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      safeOnError("unsupported", "Voice input not supported on this browser. Type instead.");
      return false;
    }

    let finalTranscript = "";
    let confidenceSum = 0;
    let confidenceCount = 0;
    let silenceTimeout: number | null = null;
    const silenceTimeoutMs = 3000;
    const recognition = new Ctor();
    recognitionRef.current = recognition;
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setState((prev) => ({
        ...prev,
        isRecording: true,
        transcript: "",
        interimTranscript: "",
        lastError: null,
        confidence: null,
      }));
    };

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      if (silenceTimeout !== null && typeof window !== "undefined") {
        window.clearTimeout(silenceTimeout);
        silenceTimeout = null;
      }

      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const item = result[0] as SpeechRecognitionResultItem;
        const transcript = item?.transcript?.trim() ?? "";
        const confidence =
          typeof item?.confidence === "number" && !Number.isNaN(item.confidence)
            ? item.confidence
            : null;
        if (!transcript) continue;
        if (result.isFinal) {
          finalTranscript = `${finalTranscript} ${transcript}`.trim();
          if (confidence != null) {
            confidenceSum += confidence;
            confidenceCount += 1;
          }
        } else {
          interim = `${interim} ${transcript}`.trim();
        }
      }

      const averageConfidence = confidenceCount > 0 ? confidenceSum / confidenceCount : null;

      setState((prev) => ({
        ...prev,
        transcript: finalTranscript,
        interimTranscript: interim,
        confidence: averageConfidence,
      }));

      if (typeof window !== "undefined") {
        silenceTimeout = window.setTimeout(() => {
          try {
            recognition.stop();
          } catch {
          }
        }, silenceTimeoutMs);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      if (silenceTimeout !== null && typeof window !== "undefined") {
        window.clearTimeout(silenceTimeout);
        silenceTimeout = null;
      }
      const type: VoiceErrorType =
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "permission_denied"
          : event.error === "network"
            ? "network"
            : "recognition_error";
      safeOnError(type, event.message || `Speech recognition error: ${event.error}`);
    };

    recognition.onend = () => {
      if (silenceTimeout !== null && typeof window !== "undefined") {
        window.clearTimeout(silenceTimeout);
        silenceTimeout = null;
      }
      recognitionRef.current = null;
      const raw = finalTranscript.trim();
      const text = raw ? normalizeAutomotiveTranscript(raw) : "";
      const averageConfidence = confidenceCount > 0 ? confidenceSum / confidenceCount : null;
      setState((prev) => ({
        ...prev,
        isRecording: false,
        transcript: text,
        interimTranscript: "",
        confidence: averageConfidence,
      }));

      if (text) {
        onFinalTranscript?.(text);
      } else {
        safeOnError("empty_transcript", "No transcript captured.");
      }
    };

    try {
      recognition.start();
      return true;
    } catch (error) {
      const err = error as Error;
      safeOnError("unknown", err?.message || "Failed to start voice recording.");
      recognitionRef.current = null;
      return false;
    }
  }, [capability.sttSupported, lang, onFinalTranscript, safeOnError, state.isRecording, stopSpeaking]);

  const speak = useCallback(
    (text: string): boolean => {
      if (!capability.ttsSupported || typeof window === "undefined") return false;
      const content = text.trim();
      if (!content) return false;

      const synth = window.speechSynthesis;
      synth.cancel();

      const utterance = new SpeechSynthesisUtterance(content);
      utterance.lang = lang;
      const rate = speechProfile?.rate ?? 1;
      const pitch = speechProfile?.pitch ?? 1;
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.voice = pickVoice(synth, lang);
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        utteranceRef.current = null;
        setIsSpeaking(false);
      };
      utterance.onerror = () => {
        utteranceRef.current = null;
        setIsSpeaking(false);
      };

      utteranceRef.current = utterance;
      synth.speak(utterance);
      return true;
    },
    [capability.ttsSupported, lang, speechProfile]
  );

  useEffect(() => {
    if (!capability.ttsSupported || typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    // Trigger voice list hydration in Safari/iOS.
    synth.getVoices();
    const handleVoicesChanged = () => {
      synth.getVoices();
    };
    synth.addEventListener("voiceschanged", handleVoicesChanged);
    return () => synth.removeEventListener("voiceschanged", handleVoicesChanged);
  }, [capability.ttsSupported]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
    let active = true;

    navigator.permissions
      .query({ name: "microphone" as PermissionName })
      .then((permissionStatus) => {
        if (!active || permissionStatus.state !== "denied") return;
        setState((prev) => ({
          ...prev,
          lastError: prev.lastError ?? "Microphone permission denied.",
        }));
      })
      .catch(() => {
        // Permission query unsupported or blocked by browser policy.
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      stopRecording();
      stopSpeaking();
    };
  }, [stopRecording, stopSpeaking]);

  return {
    capability,
    state,
    startRecording,
    stopRecording,
    speak,
    stopSpeaking,
    isSpeaking,
  };
}
