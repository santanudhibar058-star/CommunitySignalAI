import { useState, useRef, useEffect, useMemo } from "react";
import JarvisCore from "./JarvisCore.jsx";
import { apiUrl } from "../api.js";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import python from "highlight.js/lib/languages/python";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import sql from "highlight.js/lib/languages/sql";
import "highlight.js/styles/github-dark.css";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("json", json);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("sql", sql);

function inlineMarkdown(text, keyPrefix) {
  return text.split(/(`[^`]+`|\*\*.+?\*\*|\*.+?\*)/g).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={key}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={key}>{part.slice(1, -1)}</em>;
    return part;
  });
}

function CodeBlock({ code, language }) {
  const codeRef = useRef(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (codeRef.current) hljs.highlightElement(codeRef.current);
  }, [code, language]);
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch { setCopied(false); }
  }
  return <div className="code-block-wrap">
    <div className="code-block-toolbar"><span>{language || "code"}</span><button type="button" onClick={copyCode}>{copied ? "Copied" : "Copy code"}</button></div>
    <pre><code ref={codeRef} className={language ? `language-${language}` : ""}>{code}</code></pre>
  </div>;
}

function FormattedMessage({ text }) {
  const segments = text.split(/```([^\n]*)\n([\s\S]*?)```/g);
  return segments.map((segment, index) => {
    if (index % 3 === 2) return <CodeBlock key={`code-${index}`} code={segment} language={segments[index - 1]?.trim().split(/\s+/)[0]} />;
    if (index % 3 === 1) return null;
    return segment.split("\n").map((line, lineIndex) => {
      const key = `line-${index}-${lineIndex}`;
      if (line.startsWith("### ")) return <h4 key={key}>{inlineMarkdown(line.slice(4), key)}</h4>;
      if (line.startsWith("## ")) return <h3 key={key}>{inlineMarkdown(line.slice(3), key)}</h3>;
      if (line.startsWith("- ")) return <div className="markdown-list-item" key={key}>- {inlineMarkdown(line.slice(2), key)}</div>;
      if (!line) return <br key={key} />;
      return <p key={key}>{inlineMarkdown(line, key)}</p>;
    });
  });
}

const welcomeMessage = { role: "ai", text: "Hi, I'm PeopleCare AI. What would you like to talk about? I can help with general questions and community support." };

export default function PeopleCareAssistantView({ stats = {}, signals = [], navigate, openAssistance, recordActivity }) {
  const [sessions, setSessions] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("peoplecareConversations") || "null");
      if (Array.isArray(saved) && saved.length) return saved;
    } catch { /* Ignore invalid browser-stored conversation data. */ }
    return [{ id: `${Date.now()}`, title: "New conversation", messages: [welcomeMessage] }];
  });
  const [activeSessionId, setActiveSessionId] = useState(() => sessions[0]?.id);
  const [renamingSessionId, setRenamingSessionId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const messages = useMemo(() => sessions.find((session) => session.id === activeSessionId)?.messages || [welcomeMessage], [sessions, activeSessionId]);
  const setMessages = (update) => setSessions((previous) => previous.map((session) => {
    if (session.id !== activeSessionId) return session;
    const nextMessages = typeof update === "function" ? update(session.messages) : update;
    const firstUser = nextMessages.find((message) => message.role === "user")?.text;
    return { ...session, title: session.customTitle ? session.title : firstUser ? firstUser.slice(0, 42) : "New conversation", messages: nextMessages.slice(-80) };
  }));
  const [input, setInput] = useState("");
  const [state, setState] = useState("ready"); // ready, listening, thinking, speaking
  const [mode, setMode] = useState("general"); // general, civic, emergency, code
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceMode, setVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechLanguage, setSpeechLanguage] = useState("en-US");
  const [voiceRate, setVoiceRate] = useState(1);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const [availableVoices, setAvailableVoices] = useState([]);
  const [speechPaused, setSpeechPaused] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [retryText, setRetryText] = useState("");
  const [diagnostics, setDiagnostics] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [actionStatus, setActionStatus] = useState(null);
  const [providerStatus, setProviderStatus] = useState(null);
  const [voiceNotice, setVoiceNotice] = useState("");
  const activeStateRef = useRef(state);
  const voiceModeRef = useRef(voiceMode);
  const voiceEnabledRef = useRef(voiceEnabled);

  const abortControllerRef = useRef(null);
  const recognitionRef = useRef(null);
  const utteranceRef = useRef(null);
  const startListeningRef = useRef(null);
  const stateResetTimeoutRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const sessionCounterRef = useRef(0);
  const followMessagesRef = useRef(true);
  const previousMessageScrollTopRef = useRef(0);

  useEffect(() => {
    try { localStorage.setItem("peoplecareConversations", JSON.stringify(sessions.slice(-12))); }
    catch { /* Chat remains usable if browser storage is unavailable or full. */ }
  }, [sessions]);

  useEffect(() => { activeStateRef.current = state; }, [state]);
  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);
  useEffect(() => { voiceEnabledRef.current = voiceEnabled; }, [voiceEnabled]);

  useEffect(() => () => {
    abortControllerRef.current?.abort();
    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
    window.clearTimeout(stateResetTimeoutRef.current);
  }, []);

  const createConversation = () => {
    handleStopGeneration();
    window.clearTimeout(stateResetTimeoutRef.current);
    setState("greeting");
    stateResetTimeoutRef.current = window.setTimeout(() => setState("ready"), 900);
    sessionCounterRef.current += 1;
    const session = { id: `session-${activeSessionId}-${sessionCounterRef.current}`, title: "New conversation", customTitle: false, messages: [welcomeMessage] };
    setSessions((previous) => [...previous, session].slice(-12));
    setActiveSessionId(session.id);
    setPendingAction(null);
  };

  const deleteConversation = () => {
    handleStopGeneration();
    const remaining = sessions.filter((session) => session.id !== activeSessionId);
    if (!remaining.length) {
      sessionCounterRef.current += 1;
      const session = { id: `session-${activeSessionId}-${sessionCounterRef.current}`, title: "New conversation", customTitle: false, messages: [welcomeMessage] };
      setSessions([session]);
      setActiveSessionId(session.id);
    } else {
      setSessions(remaining);
      setActiveSessionId(remaining[0].id);
    }
  };

  const beginRenameConversation = (session, event) => {
    event?.stopPropagation();
    setRenamingSessionId(session.id);
    setRenameDraft(session.title || "New conversation");
  };

  const saveConversationName = (sessionId) => {
    const title = renameDraft.trim().slice(0, 60);
    if (title) setSessions((previous) => previous.map((session) => session.id === sessionId ? { ...session, title, customTitle: true } : session));
    setRenamingSessionId(null);
  };

  const scrollToBottom = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    // Keep streaming autoscroll inside the transcript; scrollIntoView can also
    // move the document and fight the user's trackpad gesture.
    if (followMessagesRef.current) {
      container.scrollTop = container.scrollHeight;
      previousMessageScrollTopRef.current = container.scrollTop;
    }
  };

  const handleMessagesScroll = (event) => {
    const container = event.currentTarget;
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 48;
    if (atBottom) followMessagesRef.current = true;
    else if (container.scrollTop < previousMessageScrollTopRef.current) followMessagesRef.current = false;
    previousMessageScrollTopRef.current = container.scrollTop;
  };

  useEffect(() => {
    followMessagesRef.current = true;
    previousMessageScrollTopRef.current = 0;
  }, [activeSessionId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    let active = true;
    fetch(apiUrl("/api/peoplecare/status"))
      .then((response) => response.json())
      .then((status) => { if (active) setProviderStatus(status); })
      .catch(() => { if (active) setProviderStatus({ general_llm_available: false }); });
    return () => { active = false; };
  }, []);

  // Voice synthesis
  useEffect(() => {
    if (!window.speechSynthesis) return undefined;
    const updateVoices = () => setAvailableVoices(window.speechSynthesis.getVoices());
    updateVoices();
    window.speechSynthesis.addEventListener?.("voiceschanged", updateVoices);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", updateVoices);
  }, []);

  const speakText = (text) => {
    if ((!voiceEnabledRef.current && !voiceModeRef.current) || !window.speechSynthesis || !text) return false;
    try {
      utteranceRef.current = null;
      window.speechSynthesis.cancel();
      const clean = text.replaceAll("*", "").replaceAll("#", "").replaceAll("`", "").replaceAll("_", "").replaceAll("[", "").replaceAll("]", "").replaceAll("(", "").replaceAll(")", "").slice(0, 2000);
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = speechLanguage;
      utterance.rate = voiceRate;
      utterance.pitch = 1.0;
      const preferredVoice = availableVoices.find((voice) => voice.voiceURI === selectedVoiceURI) || availableVoices.find((voice) => voice.lang.toLowerCase() === speechLanguage.toLowerCase()) || availableVoices.find((voice) => voice.lang.toLowerCase().startsWith(speechLanguage.slice(0, 2).toLowerCase()));
      if (preferredVoice) utterance.voice = preferredVoice;
      utteranceRef.current = utterance;
      utterance.onstart = () => setState("speaking");
      utterance.onend = () => {
        if (utteranceRef.current !== utterance) return;
        utteranceRef.current = null;
        setState(voiceModeRef.current ? "listening" : "ready");
        if (voiceModeRef.current) window.setTimeout(() => startListeningRef.current?.(), 180);
      };
      utterance.onerror = () => { if (utteranceRef.current !== utterance) return; utteranceRef.current = null; setState("ready"); };
      window.speechSynthesis.speak(utterance);
      return true;
    } catch {
      setState("ready");
      return false;
    }
  };

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceNotice("Speech recognition is not supported in this browser. Try a current Chrome or Edge browser.");
      return;
    }
    try {
      setVoiceNotice("");
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.lang = speechLanguage;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        setState("listening");
      };

      recognition.onresult = (e) => {
        const transcript = Array.from(e.results, (result) => result[0].transcript).join(" ").trim();
        const isFinal = Array.from(e.results).some((result) => result.isFinal);
        setInput(transcript);
        if (isFinal && transcript) {
          recognition.stop();
          recognitionRef.current = null;
          setIsListening(false);
          setState("thinking");
          handleSend(transcript);
        }
      };

      recognition.onerror = (event) => {
        setIsListening(false);
        setState("ready");
        setVoiceNotice(event.error === "not-allowed" || event.error === "service-not-allowed" ? "Microphone permission was denied. Allow microphone access in your browser settings." : `Voice input failed (${event.error || "unknown error"}).`);
      };

      recognition.onend = () => {
        setIsListening(false);
        if (activeStateRef.current === "listening") setState("ready");
      };

      recognition.start();
    } catch (err) {
      setVoiceNotice(`Could not start speech recognition: ${err.message}`);
      setIsListening(false);
      setState("ready");
    }
  };

  useEffect(() => { startListeningRef.current = startListening; });

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setIsListening(false);
      setState("ready");
    } else startListening();
  };

  const toggleVoiceMode = () => {
    if (voiceMode) {
      setVoiceMode(false);
      voiceModeRef.current = false;
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      utteranceRef.current = null;
      window.speechSynthesis?.cancel();
      setIsListening(false);
      setState("ready");
    } else {
      if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
        startListening();
        return;
      }
      setVoiceMode(true);
      voiceModeRef.current = true;
      setVoiceEnabled(true);
      voiceEnabledRef.current = true;
      startListening();
    }
  };

  // Stop Streaming
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
      setState("ready");
    }
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    utteranceRef.current = null;
    window.speechSynthesis?.cancel();
    setVoiceMode(false);
    voiceModeRef.current = false;
    setSpeechPaused(false);
    setIsListening(false);
    window.clearTimeout(stateResetTimeoutRef.current);
    setState("interrupted");
    stateResetTimeoutRef.current = window.setTimeout(() => setState("ready"), 850);
  };

  // Stream send handler
  const handleSend = async (manualText = null, options = {}) => {
    const userText = (manualText || input).trim();
    if (!userText || isStreaming) return;

    setInput("");
    setRetryText(userText);
    const baseMessages = options.regenerate && messages.at(-1)?.role === "ai" ? messages.slice(0, -1) : messages;
    const newHistory = options.regenerate && baseMessages.at(-1)?.role === "user"
      ? baseMessages
      : [...baseMessages, { role: "user", text: userText }];
    setMessages(newHistory);
    setState("thinking");
    setIsStreaming(true);
    setPendingAction(null);
    setActionStatus(null);
    window.clearTimeout(stateResetTimeoutRef.current);
    utteranceRef.current = null;
    window.speechSynthesis?.cancel();

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Create placeholder AI message
    setMessages((prev) => [...prev, { role: "ai", text: "", metadata: null }]);

    const dashboardContext = {
      stats: {
        total_reports: stats.total_reports ?? 0,
        resolved_reports: stats.resolved_reports ?? 0,
        emerging_issues: stats.emerging_issues ?? 0,
        hotspot_clusters: stats.hotspot_clusters,
        ai_accuracy: stats.ai_accuracy,
      },
      signals: (signals || []).slice(0, 6).map((s) => ({
        complaint_type: s.complaint_type || s.issue,
        score: s.community_signal_score || s.score,
        growth: s.growth_percentage || s.growth,
      })),
    };
    const communityIntent = /community signals?|community reports?|emerging signals?|report status|ticket (?:id|status)|road issue|pothole|nyc 311|peoplecare ai|blood assistance|women.s safety|night assistance|civic issue|official helpline/i.test(userText);
    const requestContext = communityIntent ? dashboardContext : {};

    let streamAccumulator = "";
    let lastRenderedAt = 0;
    let renderedFirstChunk = false;
    let finalMetadata = null;
    let finalAction = null;

    try {
      const response = await fetch(apiUrl("/api/peoplecare/chat/stream"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          message: userText,
          history: newHistory.slice(-24).map((m) => ({
            role: m.role === "ai" ? "assistant" : "user",
            content: m.text,
          })),
          context: requestContext,
          mode: mode,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || `Server returned HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const data = JSON.parse(jsonStr);

            if (data.chunk) {
              streamAccumulator += data.chunk;
              setState("thinking");
              const now = performance.now();
              if (!renderedFirstChunk || now - lastRenderedAt >= 35) {
                setMessages((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last && last.role === "ai") last.text = streamAccumulator;
                  return next;
                });
                renderedFirstChunk = true;
                lastRenderedAt = now;
              }
            }

            if (data.status === "checking_application_data") setState("thinking");

            if (data.done) {
              finalMetadata = data.metadata;
              finalAction = data.action_proposal;
            }
          } catch {
            // ignore non-json SSE lines
          }
        }
      }

      if (!streamAccumulator.trim() || !finalMetadata) {
        throw new Error("The chat provider returned no complete response. Please retry.");
      }

      // Finalize message with metadata and actions
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "ai") {
          last.text = streamAccumulator;
          last.metadata = finalMetadata;
          last.error = finalMetadata?.complete === false;
        }
        return next;
      });

      if (finalMetadata) {
        setDiagnostics(finalMetadata);
      }
      setRetryText(finalMetadata?.complete === false ? userText : "");
      if (finalMetadata?.provider === "local_ollama") {
        setProviderStatus((previous) => previous ? { ...previous, ollama_preload_state: "ready" } : previous);
      }
      if (finalMetadata?.complete === false) setState("error");
      if (finalAction) {
        setPendingAction(finalAction);
      }

      const voiceStarted = speakText(streamAccumulator);
      if (!voiceStarted) {
        setState("responding");
        stateResetTimeoutRef.current = window.setTimeout(() => setState("ready"), 700);
      }
    } catch (err) {
      if (err.name === "AbortError") {
        console.log("Stream generation aborted by user.");
        setMessages((prev) => {
          const next = [...prev];
          if (next.at(-1)?.role === "ai" && !next.at(-1).text) next[next.length - 1] = { role: "ai", text: "Response stopped." };
          return next;
        });
      } else {
        if (streamAccumulator.trim()) {
          setMessages((prev) => {
            const next = [...prev];
            const last = next.at(-1);
            if (last?.role === "ai") {
              last.text = `${streamAccumulator}\n\n[The stream ended early. You can retry for a complete answer.]`;
              last.error = true;
            }
            return next;
          });
          setRetryText(userText);
          setState("error");
          return;
        }
        console.warn("Streaming error, trying fallback:", err);
        // Fallback to sync endpoint
        try {
          const res = await fetch(apiUrl("/api/peoplecare/chat"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: abortController.signal,
            body: JSON.stringify({ message: userText, history: newHistory.slice(-24).map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text })), context: requestContext, mode }),
          });
          if (!res.ok) {
            const errorBody = await res.json().catch(() => ({}));
            throw new Error(errorBody.error || `Server returned HTTP ${res.status}`, { cause: err });
          }
          const data = await res.json();
          const reply = data.reply || data.response || "The assistant returned no answer. Please retry.";
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "ai") {
              last.text = reply;
              last.metadata = { provider: data.source || "Unknown provider", total_ms: data.elapsed_ms ?? null };
            }
            return next;
          });
          setRetryText("");
          const voiceStarted = speakText(reply);
          if (!voiceStarted) {
            setState("responding");
            stateResetTimeoutRef.current = window.setTimeout(() => setState("ready"), 700);
          }
        } catch {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "ai") {
              last.text = `I couldn't get a complete response: ${err.message}. Check provider configuration or try again.`;
              last.error = true;
            }
            return next;
          });
          setRetryText(userText);
          setState("error");
        }
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  // Safe Device Action Confirmation
  const handleConfirmAction = async () => {
    if (!pendingAction) return;
    setActionStatus("Executing safe action...");
    try {
      const res = await fetch(apiUrl("/api/agent/action"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: pendingAction.action,
          target: pendingAction.target,
          confirmed: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setActionStatus(`✓ Action confirmed: ${data.message || "Executed successfully"}`);
        if (data.action === "launch_portal" && data.url) {
          window.open(data.url, "_blank", "noopener,noreferrer");
        } else if (data.action === "view_section" && data.target && navigate) {
          navigate(data.target);
        }
      } else {
        setActionStatus(`✕ Action failed: ${data.error || "Permission rejected"}`);
      }
    } catch (e) {
      setActionStatus(`✕ Execution error: ${e.message}`);
    }
  };

  const handleDismissAction = () => {
    setPendingAction(null);
    setActionStatus(null);
  };

  const handleCopyMessage = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setVoiceNotice("Assistant response copied.");
      window.setTimeout(() => setVoiceNotice(""), 1600);
    } catch {
      setVoiceNotice("Clipboard access is unavailable in this browser.");
    }
  };

  const quickPrompts = [
    { label: "Emergency triage", text: "Show emergency numbers, police, ambulance, and disaster helplines." },
    { label: "Active signals", text: "What are the latest high-growth community signals and anomaly clusters?" },
    { label: "Road condition", text: "How do I report deep road potholes and structural roadway hazards?" },
    { label: "Blood assistance", text: "I need urgent blood assistance and donor verification." },
    { label: "ML architecture", text: "Explain the TF-IDF vectorizer and multi-class classification model." },
  ];
  const lastAssistantIndex = messages.map((message) => message.role).lastIndexOf("ai");
  const lastAssistantCanRegenerate = lastAssistantIndex >= 0 && messages.slice(0, lastAssistantIndex).some((message) => message.role === "user");
  const latestAssistantMessage = messages.at(-1)?.role === "ai" ? messages.at(-1) : null;
  const avatarState = latestAssistantMessage?.error ? "error" : state;

  return (
    <div className="peoplecare-view-container">
      {/* Workspace Header */}
      <div className="peoplecare-header-bar">
        <div className="header-titles">
          <div className="platform-tag"><JarvisCore state={avatarState} size={28} compact className="workspace-jarvis-mark" /> COMMUNITYSIGNAL AI • COMMUNITY GUIDE</div>
          <h1>PeopleCare AI Assistant</h1>
          <p className="subtitle">AI for Community Support • Real-Time Streaming & Safe Civic Action Agent</p>
        </div>
        <div className="header-controls">
          <div className="conversation-controls">
            <button className="mode-btn" onClick={createConversation}>＋ New conversation</button>
            <span className="provider-tag">
              {!providerStatus
                ? "Checking configured AI provider…"
                : providerStatus.selected_provider_configured
                  ? providerStatus.local_ollama_available && !providerStatus.cloud_configured
                    ? `Local Ollama | ${providerStatus.selected_model} | ${providerStatus.ollama_preload_state === "ready" ? "warm" : providerStatus.ollama_preload_state === "warming" ? "warming in background" : "installed"} | kept warm ${providerStatus.ollama_keep_alive || "30m"}`
                    : `${providerStatus.selected_provider} · ${providerStatus.selected_model || "configured model"} · connection checked when you send`
                  : "No selected AI provider is configured; offline civic guidance only"}
            </span>
          </div>
          <div className="mode-selector">
            <button className={`mode-btn ${mode === "civic" ? "active" : ""}`} onClick={() => setMode("civic")}>
              🌟 Civic Intelligence
            </button>
            <button className={`mode-btn ${mode === "emergency" ? "active" : ""}`} onClick={() => setMode("emergency")}>
              🚨 Emergency
            </button>
            <button className={`mode-btn ${mode === "code" ? "active" : ""}`} onClick={() => setMode("code")}>
              💻 Code & Systems
            </button>
            <button className={`mode-btn ${mode === "general" ? "active" : ""}`} onClick={() => setMode("general")}>
              General
            </button>
          </div>
        </div>
      </div>

      <div className="peoplecare-workspace-grid">
        {/* Shared holographic core and live interaction state */}
        <aside className="assistant-rail" aria-label="PeopleCare AI hologram and conversation history">
        <div className="card avatar-telemetry-card">
          <div className="avatar-header">
            <h3>PeopleCare AI · Holographic Core</h3>
            <span className={`status-pill ${avatarState}`}>{avatarState.toUpperCase()}</span>
          </div>

          <div className="avatar-stage">
            <div className={`avatar-scene avatar-state-${avatarState}`}>
              <JarvisCore state={avatarState} size={270} className="workspace-jarvis-core" label="PeopleCare AI holographic core" />
            </div>
            <div className="avatar-hint">The hologram reflects live listening, response generation, speech playback, completion, and provider error states.</div>
          </div>

          <div className="telemetry-block">
            <h4>Live Engine Telemetry</h4>
            <div className="telemetry-row">
              <span>Platform</span>
              <strong>CommunitySignal AI</strong>
            </div>
            <div className="telemetry-row">
              <span>AI Agent</span>
              <strong>PeopleCare AI</strong>
            </div>
            <div className="telemetry-row">
              <span>ML Classifier</span>
              <span className="badge-ok">V3 experimental • NYC only</span>
            </div>
            <div className="telemetry-row">
              <span>Baseline Accuracy</span>
              <strong>Not validated for citizen reports</strong>
            </div>
            <div className="telemetry-row">
              <span>Spatial Clusters</span>
              <strong>{stats.hotspot_clusters ?? "Not calculated"}</strong>
            </div>
          </div>

          {diagnostics && (
            <div className="diagnostics-block">
              <h4>Real-Time Inference Telemetry</h4>
              <div className="diag-metrics">
                <div className="diag-item">
                  <small>TTFT</small>
                    <strong>{diagnostics.ttft_ms ?? "—"} ms</strong>
                </div>
                <div className="diag-item">
                  <small>TOTAL</small>
                    <strong>{diagnostics.total_ms ?? "—"} ms</strong>
                </div>
                <div className="diag-item">
                  <small>THROUGHPUT</small>
                    <strong>{diagnostics.tokens_per_sec ?? "—"} t/s</strong>
                </div>
              </div>
              <div className="provider-tag">
                Provider: <code>{diagnostics.provider || "Local Civic Engine"}</code>
              </div>
            </div>
          )}
        </div>

        <aside className="conversation-sidebar" aria-label="Conversation history">
          <div className="conversation-sidebar-heading"><div><small>YOUR SPACE</small><h3>Conversations</h3></div><button type="button" onClick={deleteConversation} aria-label="Delete current conversation" title="Delete current conversation">⌫</button></div>
          <div className="conversation-list">
            {sessions.slice().reverse().map((session) => (
              <div className="conversation-item-row" key={session.id}>
                {renamingSessionId === session.id ? (
                  <form className="conversation-rename-form" onSubmit={(event) => { event.preventDefault(); saveConversationName(session.id); }}>
                    <input autoFocus aria-label="Conversation name" value={renameDraft} maxLength={60} onChange={(event) => setRenameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setRenamingSessionId(null); }} />
                    <button type="submit" aria-label="Save conversation name">Save</button>
                    <button type="button" aria-label="Cancel rename" onClick={() => setRenamingSessionId(null)}>Cancel</button>
                  </form>
                ) : <>
                  <button type="button" className={`conversation-item ${activeSessionId === session.id ? "active" : ""}`} onClick={() => { handleStopGeneration(); setActiveSessionId(session.id); setPendingAction(null); }}>
                    <span>{session.title}</span><small>{session.messages.filter((item) => item.role === "user").length} messages</small>
                  </button>
                  <button type="button" className="conversation-rename-btn" onClick={(event) => beginRenameConversation(session, event)} aria-label={`Rename ${session.title}`} title="Rename conversation">Rename</button>
                </>}
              </div>
            ))}
          </div>
          <div className="conversation-sidebar-foot">History stays in this browser and within each selected conversation. Messages are sent to the selected AI provider.</div>
        </aside>
        </aside>

        {/* Streaming one-to-one conversation */}
        <div className="card chat-workspace-card">
          {/* Quick Prompts */}
          <div className="quick-prompts-row">
            <a className="quick-chip urgent-call-chip" href="tel:112" onClick={() => recordActivity?.("emergency_call_tapped")}>Call 112 now</a>
            <button className="quick-chip" onClick={() => openAssistance?.("emergency")}>Emergency help options</button>
            <a className="quick-chip" href="https://eraktkosh.mohfw.gov.in/BLDAHIMS/bloodbank/stockAvailability.cnt" target="_blank" rel="noopener noreferrer" onClick={() => recordActivity?.("blood_resource_opened")}>Official blood availability</a>
            {quickPrompts.map((qp, idx) => (
              <button
                key={idx}
                className="quick-chip"
                onClick={() => handleSend(qp.text)}
                disabled={isStreaming}
              >
                {qp.label}
              </button>
            ))}
          </div>

          {/* Messages Container */}
          <div className="messages-stream" ref={messagesContainerRef} onScroll={handleMessagesScroll}>
            {messages.map((m, idx) => (
              <div key={idx} className={`message-bubble-row ${m.role}`}>
                <div className="msg-sender">
                  {m.role === "ai" ? <>{idx === lastAssistantIndex && <JarvisCore state={avatarState} size={25} compact className="message-jarvis-mark" />} PEOPLECARE AI ASSISTANT</> : "COMMUNITY CITIZEN"}
                </div>
                <div className="msg-bubble">
                  {m.text ? (
                    <div className="msg-text-formatted"><FormattedMessage text={m.text} /></div>
                  ) : (
                    <JarvisCore state="thinking" size={46} compact className="typing-jarvis-mark" label="PeopleCare AI is processing" />
                  )}
                  {m.metadata && (
                    <div className="msg-meta">
                      {m.metadata.ttft_ms != null && <>First token {m.metadata.ttft_ms} ms / </>}
                      {m.metadata.total_ms != null && <>Total {m.metadata.total_ms} ms / </>}
                      Provider: {m.metadata.provider || "Unknown"}
                      {m.metadata.tools_used?.length > 0 && <> / Tools: {m.metadata.tools_used.map((tool) => `${tool.name}${tool.success ? "" : " (unavailable)"}`).join(", ")}</>}
                    </div>
                  )}
                </div>
                {m.role === "ai" && m.text && <div className="message-actions">
                  <button type="button" onClick={() => handleCopyMessage(m.text)}>Copy</button>
                  {window.speechSynthesis && <button type="button" onClick={() => speakText(m.text)}>Speak</button>}
                  {idx === lastAssistantIndex && lastAssistantCanRegenerate && !isStreaming && <button type="button" onClick={() => handleSend(messages.slice(0, idx).reverse().find((item) => item.role === "user")?.text, { regenerate: true })}>Regenerate</button>}
                </div>}
              </div>
            ))}
          </div>

          {/* Safe Device Action Proposal Card */}
          {pendingAction && (
            <div className="safe-action-card">
              <div className="action-header">
                <span className="action-badge">SAFE AGENT ACTION PROPOSED</span>
                <span className="action-safety">User Confirmation Required</span>
              </div>
              <div className="action-body">
                <strong>{pendingAction.title}</strong>
                <p>{pendingAction.reason}</p>
                <small>Target: <code>{pendingAction.target}</code> (Action: <code>{pendingAction.action}</code>)</small>
              </div>
              {actionStatus && <div className="action-status-msg">{actionStatus}</div>}
              <div className="action-buttons">
                <button className="confirm-btn" onClick={handleConfirmAction}>
                  Confirm and execute action
                </button>
                <button className="dismiss-btn" onClick={handleDismissAction}>
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {retryText && !isStreaming && <button className="hero-secondary retry-chat" onClick={() => handleSend(retryText, { regenerate: true })}>Retry response</button>}

          {/* Input Composer */}
          <div className="composer-container">
            <div className="composer-bar">
              <button
                className={`voice-btn ${isListening ? "listening" : ""}`}
                onClick={toggleListening}
                aria-label={isListening ? "Stop voice input" : "Start voice input"}
                title={isListening ? "Listening... click to stop" : "Voice input"}
              >
                {isListening ? "Stop listening" : "Mic"}
              </button>

              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask PeopleCare AI anything, in English or Hindi..."
                rows={2}
                disabled={isStreaming}
              />

              {isStreaming || state === "speaking" ? (
                <button className="stop-btn" onClick={handleStopGeneration} title="Stop generation">
                  Stop
                </button>
              ) : (
                <button className="send-btn" onClick={() => handleSend()} disabled={!input.trim()}>
                  Send
                </button>
              )}
            </div>

            <div className="composer-subbar">
              <div className="voice-controls">
                <button type="button" className={`voice-mode-btn ${voiceMode ? "active" : ""}`} onClick={toggleVoiceMode} aria-pressed={voiceMode}>{voiceMode ? "End voice conversation" : "Start voice conversation"}</button>
                <label>Language<select value={speechLanguage} onChange={(event) => setSpeechLanguage(event.target.value)}><option value="en-US">English</option><option value="hi-IN">Hindi</option></select></label>
                {availableVoices.length > 0 && <label>Voice<select value={selectedVoiceURI} onChange={(event) => setSelectedVoiceURI(event.target.value)}><option value="">Automatic</option>{availableVoices.filter((voice) => voice.lang.toLowerCase().startsWith(speechLanguage.slice(0, 2).toLowerCase())).map((voice) => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} ({voice.lang})</option>)}</select></label>}
                <label className="rate-control">Speed <input aria-label="Speech speed" type="range" min="0.75" max="1.25" step="0.05" value={voiceRate} onChange={(event) => setVoiceRate(Number(event.target.value))} /><span>{voiceRate.toFixed(2)}x</span></label>
              </div>
              <div className="voice-controls">
                <label className="toggle-label"><input type="checkbox" checked={voiceEnabled} onChange={(event) => { const enabled = event.target.checked; voiceEnabledRef.current = enabled; setVoiceEnabled(enabled); if (!enabled && !voiceModeRef.current) { window.speechSynthesis?.cancel(); setState("ready"); } }} />Speak responses</label>
                {window.speechSynthesis && <>
                  <button type="button" className="voice-mode-btn" onClick={() => { if (speechPaused) { window.speechSynthesis.resume(); setSpeechPaused(false); } else if (window.speechSynthesis.speaking) { window.speechSynthesis.pause(); setSpeechPaused(true); } }} disabled={!window.speechSynthesis.speaking}>{speechPaused ? "Resume audio" : "Pause audio"}</button>
                  <button type="button" className="voice-mode-btn" onClick={() => { recognitionRef.current?.stop(); recognitionRef.current = null; setIsListening(false); utteranceRef.current = null; window.speechSynthesis.cancel(); setSpeechPaused(false); setVoiceMode(false); voiceModeRef.current = false; setState("ready"); }} disabled={!window.speechSynthesis.speaking && !voiceMode}>Stop audio</button>
                </>}
              </div>
              <span className="safety-note">Voice uses browser speech services after you start it. Messages go to the selected AI provider.</span>
            </div>
            {voiceNotice && <div className="voice-notice" role="status">{voiceNotice}</div>}
          </div>
        </div>
      </div>

      <style>{`
        .peoplecare-view-container {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .peoplecare-header-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(15, 23, 42, 0.7);
          border: 1px solid rgba(56, 189, 248, 0.2);
          border-radius: 16px;
          padding: 18px 24px;
          backdrop-filter: blur(12px);
          flex-wrap: wrap;
          gap: 12px;
        }
        .platform-tag {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1.5px;
          color: #38bdf8;
          text-transform: uppercase;
        }
        .header-titles h1 {
          margin: 4px 0;
          font-size: 24px;
          color: #f8fafc;
        }
        .subtitle {
          margin: 0;
          font-size: 13px;
          color: #94a3b8;
        }
        .mode-selector {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .mode-btn {
          background: rgba(30, 41, 59, 0.8);
          border: 1px solid rgba(148, 163, 184, 0.2);
          color: #cbd5e1;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .mode-btn.active {
          background: rgba(56, 189, 248, 0.2);
          border-color: #38bdf8;
          color: #38bdf8;
          font-weight: 600;
        }
        .peoplecare-workspace-grid {
          display: grid;
          grid-template-columns: minmax(270px, 0.72fr) minmax(0, 1.8fr);
          gap: 16px;
          align-items: stretch;
        }
        .assistant-rail {
          min-width: 0;
          height: clamp(560px, calc(100vh - 280px), 640px);
          display: grid;
          grid-template-rows: auto minmax(0, 1fr);
          gap: 12px;
          padding: 14px;
          overflow: hidden;
          border: 1px solid rgba(56, 189, 248, 0.2);
          border-radius: 18px;
          background: linear-gradient(155deg, rgba(12, 23, 42, 0.84), rgba(5, 10, 23, 0.78));
          box-shadow: 0 18px 42px rgba(0, 0, 0, 0.18), inset 0 1px rgba(255,255,255,.035);
        }
        .conversation-sidebar {
          min-width: 0;
          min-height: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 10px 0 0;
          border: 0;
          border-top: 1px solid rgba(148, 163, 184, 0.15);
          border-radius: 0;
          background: transparent;
        }
        .conversation-sidebar-heading { display: flex; align-items: center; justify-content: space-between; color: #e2e8f0; }
        .conversation-sidebar-heading small { color: #60a5fa; letter-spacing: 1.4px; font-size: 9px; }
        .conversation-sidebar-heading h3 { font-size: 15px; margin: 3px 0 0; }
        .conversation-sidebar-heading button { border: 1px solid rgba(148,163,184,.2); border-radius: 8px; background: rgba(30,41,59,.65); color: #cbd5e1; padding: 6px 10px; cursor: pointer; }
        .conversation-sidebar-heading button:disabled { opacity: .4; cursor: default; }
        .conversation-list { display: flex; flex-direction: column; gap: 6px; min-height: 0; flex: 1; overflow-y: auto; overscroll-behavior: contain; }
        .conversation-item-row { display: flex; align-items: stretch; gap: 4px; min-width: 0; }
        .conversation-item { text-align: left; border: 1px solid transparent; border-radius: 9px; background: transparent; color: #cbd5e1; padding: 10px; cursor: pointer; }
        .conversation-item-row > .conversation-item { flex: 1; min-width: 0; }
        .conversation-item span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
        .conversation-item small { display: block; margin-top: 5px; color: #718096; font-size: 10px; }
        .conversation-item:hover, .conversation-item.active { background: rgba(14, 116, 144, .18); border-color: rgba(56,189,248,.28); color: #f8fafc; }
        .conversation-rename-btn { align-self: center; border: 0; background: transparent; color: #8293ad; font-size: 10px; padding: 6px; cursor: pointer; opacity: .72; }
        .conversation-rename-btn:hover { color: #67e8f9; opacity: 1; }
        .conversation-rename-form { display: flex; flex-wrap: wrap; gap: 4px; width: 100%; }
        .conversation-rename-form input { flex: 1 1 100%; min-width: 0; border: 1px solid rgba(56,189,248,.35); border-radius: 7px; background: #091321; color: #e2e8f0; padding: 7px; }
        .conversation-rename-form button { border: 1px solid rgba(148,163,184,.2); border-radius: 6px; background: rgba(30,41,59,.65); color: #cbd5e1; padding: 4px 7px; cursor: pointer; }
        .conversation-rename-form button[type="submit"] { color: #67e8f9; }
        .conversation-sidebar-foot { margin-top: auto; color: #64748b; font-size: 10px; }
        .avatar-telemetry-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          min-width: 0;
          background: transparent;
          border: 0;
          border-radius: 0;
          padding: 0;
          box-shadow: none;
        }
        .avatar-header {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .avatar-header h3 {
          margin: 0;
          font-size: 14px;
          color: #e2e8f0;
        }
        .status-pill {
          font-size: 10px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 10px;
          text-transform: uppercase;
        }
        .status-pill.ready { background: rgba(56, 189, 248, 0.2); color: #38bdf8; }
        .status-pill.responding, .status-pill.greeting, .status-pill.success { background: rgba(34, 211, 238, 0.18); color: #67e8f9; }
        .status-pill.error { background: rgba(251, 146, 60, 0.16); color: #fdba74; }
        .status-pill.interrupted { background: rgba(251, 146, 60, 0.2); color: #fdba74; }
        .status-pill.thinking { background: rgba(34, 211, 238, 0.16); color: #67e8f9; }
        .status-pill.speaking { background: rgba(59, 130, 246, 0.2); color: #93c5fd; }
        .status-pill.listening { background: rgba(56, 189, 248, 0.17); color: #7dd3fc; }

        .avatar-stage {
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          margin: 6px 0;
        }
        .avatar-scene { position: relative; display: grid; place-items: center; width: min(100%, 232px); aspect-ratio: 1; margin: 0 auto; overflow: visible; isolation: isolate; }
        .workspace-jarvis-mark { width: 28px; }
        .workspace-jarvis-core { overflow: visible; }
        .message-jarvis-mark { display: inline-grid; vertical-align: middle; margin-right: 5px; }
        .typing-jarvis-mark { display: block; }
        .avatar-hint {
          font-size: 10px;
          color: #64748b;
          margin-top: 8px;
          max-width: 260px;
          text-align: center;
          line-height: 1.55;
        }
        .telemetry-block, .diagnostics-block {
          width: 100%;
          background: rgba(10, 15, 30, 0.6);
          border: 1px solid rgba(148, 163, 184, 0.15);
          border-radius: 10px;
          padding: 12px;
        }
        .telemetry-block h4, .diagnostics-block h4 {
          margin: 0 0 8px 0;
          font-size: 11px;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.8px;
        }
        .telemetry-row {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          margin-bottom: 6px;
          color: #cbd5e1;
        }
        .badge-ok {
          color: #34d399;
          font-weight: 600;
        }
        .diag-metrics {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
          text-align: center;
        }
        .diag-item {
          background: rgba(30, 41, 59, 0.7);
          padding: 6px 4px;
          border-radius: 6px;
        }
        .diag-item small {
          display: block;
          font-size: 9px;
          color: #94a3b8;
        }
        .diag-item strong {
          font-size: 12px;
          color: #38bdf8;
        }
        .provider-tag {
          font-size: 10px;
          margin-top: 6px;
          color: #94a3b8;
        }
        .provider-tag code {
          color: #a5b4fc;
        }

        .chat-workspace-card {
          display: flex;
          flex-direction: column;
          height: clamp(560px, calc(100vh - 280px), 640px);
          background: rgba(15, 23, 42, 0.75);
          border: 1px solid rgba(56, 189, 248, 0.2);
          border-radius: 16px;
          padding: 18px;
          overflow: hidden;
          min-width: 0;
        }
        .quick-prompts-row {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 8px;
          margin-bottom: 12px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.1);
        }
        .quick-chip {
          display: inline-flex;
          align-items: center;
          background: rgba(30, 41, 59, 0.6);
          border: 1px solid rgba(56, 189, 248, 0.3);
          color: #93c5fd;
          padding: 5px 11px;
          border-radius: 20px;
          font-size: 11px;
          white-space: nowrap;
          cursor: pointer;
          transition: all 0.2s;
          text-decoration: none;
        }
        .urgent-call-chip { border-color: rgba(248, 113, 113, .48); background: rgba(127, 29, 29, .22); color: #fecaca; }
        .quick-chip:hover:not(:disabled) {
          background: rgba(56, 189, 248, 0.2);
          color: #fff;
        }
        .messages-stream {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding-right: 6px;
        }
        .message-bubble-row {
          display: flex;
          flex-direction: column;
          max-width: 82%;
        }
        .message-bubble-row.ai { align-self: flex-start; }
        .message-bubble-row.user { align-self: flex-end; align-items: flex-end; }
        .msg-sender {
          display: flex;
          align-items: center;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.8px;
          margin-bottom: 4px;
          color: #38bdf8;
        }
        .message-bubble-row.user .msg-sender { color: #818cf8; }
        .msg-bubble {
          padding: 12px 16px;
          border-radius: 14px;
          font-size: 13px;
          line-height: 1.5;
        }
        .message-bubble-row.ai .msg-bubble {
          background: rgba(30, 41, 59, 0.85);
          border: 1px solid rgba(56, 189, 248, 0.25);
          color: #f1f5f9;
        }
        .message-bubble-row.user .msg-bubble {
          background: linear-gradient(135deg, #4f46e5, #3b82f6);
          color: #fff;
        }
        .message-bubble-row { animation: message-in .24s ease-out both; }
        @keyframes message-in { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: translateY(0); } }
        .message-actions { display: flex; gap: 6px; margin: 5px 0 0 8px; opacity: .76; }
        .message-actions button, .code-block-toolbar button { color: #9fb8d1; border: 1px solid rgba(148,163,184,.18); border-radius: 6px; background: rgba(15,23,42,.7); padding: 3px 8px; font-size: 10px; cursor: pointer; }
        .message-actions button:hover, .code-block-toolbar button:hover { color: white; border-color: #38bdf8; }
        .code-block-wrap { margin: 10px 0; overflow: hidden; border: 1px solid rgba(56,189,248,.2); border-radius: 9px; background: #0b1220; }
        .code-block-toolbar { display: flex; justify-content: space-between; align-items: center; padding: 5px 9px; background: rgba(30,41,59,.8); color: #9fb8d1; font-size: 10px; }
        .code-block-wrap pre { margin: 0; padding: 12px; overflow-x: auto; background: transparent !important; }
        .code-block-wrap code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; }
        .msg-meta {
          margin-top: 8px;
          padding-top: 6px;
          border-top: 1px solid rgba(148, 163, 184, 0.15);
          font-size: 10px;
          color: #94a3b8;
          font-family: monospace;
        }

        .safe-action-card {
          margin-top: 10px;
          background: rgba(24, 24, 47, 0.9);
          border: 1px solid #6366f1;
          border-radius: 10px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .action-header {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          font-weight: 700;
        }
        .action-badge { color: #818cf8; letter-spacing: 0.8px; }
        .action-safety { color: #34d399; }
        .action-body strong { color: #f8fafc; font-size: 13px; }
        .action-body p { margin: 3px 0; font-size: 12px; color: #cbd5e1; }
        .action-body small { color: #94a3b8; }
        .action-status-msg { font-size: 11px; color: #38bdf8; font-weight: 600; }
        .action-buttons {
          display: flex;
          gap: 8px;
          margin-top: 4px;
        }
        .confirm-btn {
          background: #4f46e5;
          color: #fff;
          border: none;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
        }
        .dismiss-btn {
          background: rgba(51, 65, 85, 0.8);
          color: #94a3b8;
          border: none;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 11px;
          cursor: pointer;
        }

        .composer-container {
          margin-top: 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .composer-bar {
          display: flex;
          gap: 8px;
          align-items: center;
          background: rgba(10, 15, 30, 0.8);
          border: 1px solid rgba(56, 189, 248, 0.3);
          border-radius: 12px;
          padding: 6px 10px;
        }
        .voice-btn {
          background: rgba(30, 41, 59, 0.8);
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 8px;
          padding: 8px 10px;
          cursor: pointer;
          font-size: 14px;
        }
        .voice-btn.listening {
          background: rgba(239, 68, 68, 0.3);
          border-color: #ef4444;
          animation: pulse 1.5s infinite;
        }
        .composer-bar textarea {
          flex: 1;
          background: transparent;
          border: none;
          color: #f8fafc;
          font-size: 13px;
          font-family: inherit;
          resize: none;
          outline: none;
        }
        .send-btn {
          background: linear-gradient(135deg, #0284c7, #2563eb);
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 8px 16px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.2s;
        }
        .send-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .stop-btn {
          background: #dc2626;
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 8px 14px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .composer-subbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 8px;
          font-size: 11px;
          color: #94a3b8;
          padding: 0 4px;
        }
        .toggle-label {
          display: flex;
          align-items: center;
          gap: 5px;
          cursor: pointer;
        }
        .voice-controls { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; }
        .voice-controls label { display: inline-flex; align-items: center; gap: 5px; font-size: 10px; color: #9fb8d1; }
        .voice-controls select { max-width: 130px; border: 1px solid rgba(148,163,184,.2); border-radius: 6px; background: #111d31; color: #e2e8f0; padding: 5px; font-size: 10px; }
        .voice-controls input[type="range"] { width: 70px; accent-color: #38bdf8; }
        .voice-mode-btn { border: 1px solid rgba(56,189,248,.28); border-radius: 7px; color: #cbeeff; background: rgba(8,47,73,.65); padding: 6px 8px; font-size: 10px; cursor: pointer; }
        .voice-mode-btn.active { background: rgba(8,145,178,.32); color: #fff; box-shadow: 0 0 16px rgba(34,211,238,.12); }
        .voice-mode-btn:disabled { opacity: .45; cursor: default; }
        .rate-control span { min-width: 32px; }
        @media (max-width: 1040px) {
          .peoplecare-workspace-grid { grid-template-columns: minmax(245px, .68fr) minmax(0, 1.55fr); gap: 12px; }
          .assistant-rail { padding: 12px; }
          .avatar-header h3 { font-size: 12px; }
          .telemetry-row { gap: 8px; font-size: 11px; }
          .telemetry-row strong, .telemetry-row > span:last-child { text-align: right; overflow-wrap: anywhere; }
        }
        @media (max-width: 760px) {
          .peoplecare-workspace-grid { grid-template-columns: minmax(0, 1fr); }
          .assistant-rail { height: auto; min-height: 0; grid-template-columns: minmax(130px, .68fr) minmax(0, 1fr); grid-template-rows: auto; align-items: stretch; padding: 12px; }
          .conversation-sidebar { min-height: 190px; border-top: 0; border-left: 1px solid rgba(148,163,184,.15); padding: 2px 0 2px 12px; }
          .avatar-header { align-items: flex-start; gap: 5px; }
          .avatar-header h3 { font-size: 11px; }
          .avatar-scene { width: 100%; }
          .workspace-jarvis-core { --jarvis-size: clamp(128px, 31vw, 184px) !important; }
          .avatar-hint, .telemetry-block, .diagnostics-block { display: none; }
          .avatar-telemetry-card { align-self: center; }
          .chat-workspace-card { height: min(72vh, 680px); min-height: 520px; padding: 12px; }
          .message-bubble-row { max-width: 96%; }
          .peoplecare-header-bar { padding: 14px; }
        }
        @media (max-width: 420px) {
          .assistant-rail { grid-template-columns: minmax(96px, .58fr) minmax(0, 1fr); padding: 9px; gap: 8px; }
          .conversation-sidebar { padding-left: 8px; }
          .conversation-sidebar-heading { align-items: flex-start; }
          .conversation-sidebar-heading h3 { font-size: 13px; }
          .conversation-rename-btn { font-size: 9px; }
          .conversation-item { padding: 8px 6px; }
          .conversation-sidebar-foot { font-size: 9px; }
          .workspace-jarvis-core { --jarvis-size: 116px !important; }
          .chat-workspace-card { min-height: 460px; }
        }
      `}</style>
    </div>
  );
}
