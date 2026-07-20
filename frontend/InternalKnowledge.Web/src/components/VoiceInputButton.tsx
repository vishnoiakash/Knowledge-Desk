import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Chip, IconButton, Tooltip, Typography } from "@mui/material";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import StopIcon from "@mui/icons-material/Stop";

// Augment Window for vendor-prefixed SpeechRecognition
declare global {
  interface Window {
    SpeechRecognition?: typeof SpeechRecognition;
    webkitSpeechRecognition?: typeof SpeechRecognition;
  }
}

interface Props {
  /** Called with the latest full transcript on every result update */
  onTranscript: (text: string) => void;
  /** Whether the parent textarea already has content — appends if true */
  existingText?: string;
  disabled?: boolean;
}

type RecState = "idle" | "listening" | "unsupported";

export default function VoiceInputButton({ onTranscript, existingText = "", disabled = false }: Props) {
  const [state,    setState]    = useState<RecState>("idle");
  const [detected, setDetected] = useState<string>("");
  const recRef                  = useRef<SpeechRecognition | null>(null);
  const accumulatedRef          = useRef<string>("");  // final segments accumulated this session

  // Check support once on mount
  const SpeechRecognition =
    window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;

  useEffect(() => {
    if (!SpeechRecognition) setState("unsupported");
  }, [SpeechRecognition]);

  const stop = useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
    setState("idle");
  }, []);

  const start = useCallback(() => {
    if (!SpeechRecognition) return;

    accumulatedRef.current = "";   // reset accumulator for this recording session

    const rec = new SpeechRecognition();

    // ── Language detection strategy ────────────────────────────────────────
    // Setting lang="" tells the browser to use the system/OS language, which
    // is the most reliable "auto-detect" available in the Web Speech API.
    // Google's engine then picks up Hindi, English, and Hinglish automatically.
    // Fallback: if the browser doesn't support empty lang, navigator.language
    // gives us en-IN or hi-IN which is almost always correct for this team.
    rec.lang = "";

    rec.continuous     = true;    // keep recording until manually stopped
    rec.interimResults = true;    // stream live partial text to the textarea

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let interim = "";

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) {
          accumulatedRef.current += result[0].transcript + " ";
        } else {
          interim = result[0].transcript;
        }
      }

      // Detect language from transcript (simple heuristic: Devanagari = Hindi)
      const fullSoFar = accumulatedRef.current + interim;
      const hasDevanagari = /[\u0900-\u097F]/.test(fullSoFar);
      setDetected(hasDevanagari ? "हिंदी detected — will save in English" : "English detected");

      // Append to whatever was already in the textarea
      const prefix = existingText.trimEnd();
      const joined = prefix ? `${prefix}\n\n${fullSoFar.trim()}` : fullSoFar.trim();
      onTranscript(joined);
    };

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error !== "aborted") {
        console.error("Voice input error:", e.error);
      }
      setState("idle");
    };

    rec.onend = () => {
      // Auto-restart unless the user explicitly stopped
      if (recRef.current) {
        try { rec.start(); } catch { setState("idle"); }
      }
    };

    rec.start();
    recRef.current = rec;
    setState("listening");
  }, [SpeechRecognition, existingText, onTranscript]);

  // Clean up on unmount
  useEffect(() => () => { recRef.current?.stop(); }, []);

  if (state === "unsupported") {
    return (
      <Tooltip title="Voice input requires Chrome or Edge">
        <span>
          <IconButton disabled size="small">
            <MicOffIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    );
  }

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      {state === "listening" && (
        <>
          {/* Pulsing red dot */}
          <Box sx={{
            width: 8, height: 8, borderRadius: "50%", bgcolor: "#e53935",
            animation: "pulse 1.2s ease-in-out infinite",
            "@keyframes pulse": {
              "0%, 100%": { opacity: 1, transform: "scale(1)" },
              "50%":       { opacity: 0.4, transform: "scale(1.4)" },
            },
          }} />
          {detected && (
            <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }}>
              {detected}
            </Typography>
          )}
        </>
      )}

      <Tooltip title={state === "listening" ? "Stop recording" : "Start voice input (auto-detects language)"}>
        <span>
          <IconButton
            onClick={state === "listening" ? stop : start}
            disabled={disabled}
            size="small"
            sx={{
              bgcolor: state === "listening" ? "#fde8e8" : "#eef3f0",
              color:   state === "listening" ? "#e53935"  : "#345f54",
              "&:hover": {
                bgcolor: state === "listening" ? "#fbd5d5" : "#dceae5",
              },
            }}
          >
            {state === "listening" ? <StopIcon fontSize="small" /> : <MicIcon fontSize="small" />}
          </IconButton>
        </span>
      </Tooltip>

      {state === "listening" && (
        <Chip
          label="Recording…"
          size="small"
          sx={{ bgcolor: "#fde8e8", color: "#e53935", fontWeight: 700, fontSize: 10 }}
        />
      )}
    </Box>
  );
}
