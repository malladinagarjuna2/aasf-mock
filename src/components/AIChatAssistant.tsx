import React, { useState, useRef, useEffect } from "react";
import { MessageSquare, Send, X, Bot, RotateCcw, Maximize2, Minimize2, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { GoogleGenAI } from "@google/genai";
import { cn } from "@/src/lib/utils";

interface Message {
  role: "user" | "model";
  text: string;
  timestamp: Date;
}

export default function AIChatAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { 
      role: "model", 
      text: "Hi! 👋 I'm your AI Quiz Assistant, and I'll be your guide to generating great questions today.",
      timestamp: new Date()
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    const now = new Date();
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: userMessage, timestamp: now }]);
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const history = messages.map(m => ({
        role: m.role as "user" | "model",
        parts: [{ text: m.text }]
      }));

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: "You are an AI Quiz Assistant. Your goal is to help teachers generate high-quality quiz questions. Provide clear, concise questions with multiple-choice options (A, B, C, D) and indicate the correct answer. Keep your tone professional and helpful.",
        },
        contents: [
          ...history,
          { role: "user", parts: [{ text: userMessage }] }
        ]
      });

      const aiText = response.text || "I'm sorry, I couldn't generate a response. Please try again.";
      setMessages(prev => [...prev, { role: "model", text: aiText, timestamp: new Date() }]);
    } catch (error) {
      console.error("AI Chat Error:", error);
      setMessages(prev => [...prev, { role: "model", text: "Sorry, I encountered an error. Please check your connection and try again.", timestamp: new Date() }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn(
      "fixed z-[100] flex flex-col items-end pointer-events-none transition-all duration-300",
      isFullScreen ? "inset-0 p-4" : "bottom-6 right-6"
    )}>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95, transformOrigin: "bottom right" }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className={cn(
              "pointer-events-auto bg-surface-container-lowest rounded-[1.5rem] shadow-[0_12px_40px_rgba(0,0,0,0.15)] border border-outline-variant/10 flex flex-col overflow-hidden transition-all duration-300",
              isFullScreen 
                ? "w-full h-full max-h-none" 
                : "w-[320px] h-[450px] max-h-[calc(100vh-100px)] mb-0"
            )}
          >
            {/* Header */}
            <div className="px-4 py-3 bg-surface-container-lowest border-b border-outline-variant/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
                  <Bot className="w-4 h-4 text-on-primary" />
                </div>
                <h3 className="font-headline font-bold text-on-surface text-base tracking-tight">Quiz Assistant</h3>
              </div>
              <div className="flex items-center gap-0.5">
                <button 
                  onClick={() => setMessages([{ role: "model", text: "Hello! I'm your AI Quiz Assistant. Ask me for question ideas on any topic!", timestamp: new Date() }])}
                  className="p-1.5 hover:bg-surface-container-low rounded-full transition-colors text-on-surface-variant hover:text-on-surface"
                  title="Reset chat"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setIsFullScreen(!isFullScreen)}
                  className={cn(
                    "p-1.5 hover:bg-surface-container-low rounded-full transition-colors text-on-surface-variant hover:text-on-surface",
                    isFullScreen && "text-primary"
                  )}
                  title={isFullScreen ? "Exit full screen" : "Full screen"}
                >
                  {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button 
                  onClick={() => {
                    setIsOpen(false);
                    setIsFullScreen(false);
                  }}
                  className="p-1.5 hover:bg-surface-container-low rounded-full transition-colors text-on-surface-variant hover:text-on-surface"
                  aria-label="Close chat"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Date Separator */}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="flex-grow h-[1px] bg-outline-variant/20"></div>
              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <div className="flex-grow h-[1px] bg-outline-variant/20"></div>
            </div>

            {/* Messages */}
            <div className="flex-grow overflow-y-auto px-4 pb-4 space-y-5 scrollbar-hide">
              {messages.map((msg, i) => (
                <div 
                  key={i} 
                  className={cn(
                    "flex gap-2",
                    msg.role === "user" ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  {msg.role === "model" && (
                    <div className="w-7 h-7 bg-primary rounded-lg flex-shrink-0 flex items-center justify-center mt-1">
                      <Bot className="w-4 h-4 text-on-primary" />
                    </div>
                  )}
                  <div className={cn(
                    "flex flex-col max-w-[85%]",
                    msg.role === "user" ? "items-end" : "items-start"
                  )}>
                    {msg.role === "model" && (
                      <span className="text-[10px] font-bold text-on-surface-variant mb-1 ml-1">Quiz Assistant</span>
                    )}
                    <div className={cn(
                      "flex items-end gap-1.5",
                      msg.role === "user" ? "flex-row-reverse" : "flex-row"
                    )}>
                      <div className={cn(
                        "p-3 text-[13px] leading-[1.4] shadow-sm transition-all",
                        msg.role === "user" 
                          ? "bg-primary text-on-primary rounded-[1rem] rounded-tr-none hover:opacity-90" 
                          : "bg-surface-container-low text-on-surface rounded-[1rem] rounded-tl-none"
                      )}>
                        {msg.text}
                      </div>
                      <span className="text-[9px] text-on-surface-variant font-medium mb-0.5 whitespace-nowrap">
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-2">
                  <div className="w-7 h-7 bg-primary rounded-lg flex-shrink-0 flex items-center justify-center mt-1">
                    <Bot className="w-4 h-4 text-on-primary" />
                  </div>
                  <div className="bg-surface-container-low p-3 rounded-[1rem] rounded-tl-none shadow-sm">
                    <div className="flex gap-1">
                      <span className="w-1 h-1 bg-on-surface-variant rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                      <span className="w-1 h-1 bg-on-surface-variant rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                      <span className="w-1 h-1 bg-on-surface-variant rounded-full animate-bounce"></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Footer / Input */}
            <div className="p-4 bg-surface-container-lowest border-t border-outline-variant/10">
              <div className="relative flex items-center gap-2">
                <input 
                  type="text" 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Ask for ideas..."
                  className="flex-grow px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-full text-[13px] focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all placeholder:text-on-surface-variant text-on-surface"
                />
                <button 
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="p-2.5 bg-primary text-on-primary rounded-full disabled:opacity-50 transition-all hover:opacity-90 active:scale-95 shadow-lg shadow-primary/20"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isOpen && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsOpen(true)}
          className="pointer-events-auto w-14 h-14 rounded-full shadow-lg flex items-center justify-center bg-primary text-on-primary hover:scale-110 transition-transform"
        >
          <MessageSquare className="w-6 h-6" />
        </motion.button>
      )}
    </div>
  );
}
