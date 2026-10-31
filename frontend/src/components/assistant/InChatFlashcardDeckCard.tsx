import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { FlashcardDeckData, FlashcardItem } from '@/types/commands';
import {
  Layers,
  RotateCcw,
  RotateCw,
  Check,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  MoreVertical,
  BookOpen,
  Copy,
  X,
  MousePointerClick,
} from 'lucide-react';

export interface InChatFlashcardDeckCardProps {
  deck: FlashcardDeckData;
  onNavigateToItem?: (id: string, itemType: string) => void;
}

export const InChatFlashcardDeckCard: React.FC<InChatFlashcardDeckCardProps> = ({
  deck,
  onNavigateToItem,
}) => {
  const cards: FlashcardItem[] = useMemo(() => deck.cards || [], [deck.cards]);
  const storageKey = `hyades_flashcard_deck_${deck.deck_id}`;

  // Initialize state with localStorage persistence
  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (
          typeof parsed.currentIndex === 'number' &&
          parsed.currentIndex >= 0 &&
          parsed.currentIndex < cards.length
        ) {
          return parsed.currentIndex;
        }
      }
    } catch {
      // fallback
    }
    return deck.current_index ?? 0;
  });

  const [isFlipped, setIsFlipped] = useState<boolean>(false);

  const [reviewState, setReviewState] = useState<Record<string, 'got_it' | 'again'>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.reviewState && typeof parsed.reviewState === 'object') {
          return parsed.reviewState;
        }
      }
    } catch {
      // fallback
    }
    return deck.review_state || {};
  });

  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [showMenu, setShowMenu] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // Sync state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          currentIndex,
          reviewState,
          updatedAt: new Date().toISOString(),
        })
      );
    } catch (err) {
      console.warn('Could not persist flashcard review state to localStorage:', err);
    }
  }, [storageKey, currentIndex, reviewState]);

  const currentCard: FlashcardItem | undefined = cards[currentIndex];

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setIsFlipped(false);
    }
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex < cards.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setIsFlipped(false);
    }
  }, [currentIndex, cards.length]);

  const handleFlip = useCallback(() => {
    setIsFlipped((prev) => !prev);
  }, []);

  const handleMarkReview = useCallback(
    (status: 'got_it' | 'again') => {
      if (!currentCard) return;
      setReviewState((prev) => ({
        ...prev,
        [currentCard.id]: status,
      }));
      // Advance to next card if available
      if (currentIndex < cards.length - 1) {
        setCurrentIndex((prev) => prev + 1);
        setIsFlipped(false);
      }
    },
    [currentCard, currentIndex, cards.length]
  );

  const handleRestartDeck = useCallback(() => {
    let proceed = true;
    try {
      const hasProgress = Object.keys(reviewState).length > 0 || currentIndex > 0;
      if (hasProgress && typeof window !== 'undefined' && typeof window.confirm === 'function') {
        const res = window.confirm('Restart this flashcard deck and reset your review progress?');
        if (res === false) {
          proceed = false;
        }
      }
    } catch {
      // Environments like jsdom where window.confirm throws Not implemented
      proceed = true;
    }
    if (!proceed) return;

    setCurrentIndex(0);
    setIsFlipped(false);
    setReviewState({});
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    setShowMenu(false);
  }, [reviewState, currentIndex, storageKey]);

  const handleCopyDeck = useCallback(() => {
    const text = cards
      .map(
        (c, idx) =>
          `Card ${idx + 1}: ${c.question}\nAnswer: ${c.answer}\n${
            c.explanation ? `Explanation: ${c.explanation}\n` : ''
          }`
      )
      .join('\n---\n\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    setShowMenu(false);
  }, [cards]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only capture when not typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        handleFlip();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === '1') {
        e.preventDefault();
        handleMarkReview('again');
      } else if (e.key === '2') {
        e.preventDefault();
        handleMarkReview('got_it');
      } else if (e.key === 'Escape' && isPreviewOpen) {
        e.preventDefault();
        setIsPreviewOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleFlip, handlePrev, handleNext, handleMarkReview, isPreviewOpen]);

  // Prevent background scrolling while preview overlay is open
  useEffect(() => {
    if (!isPreviewOpen || typeof document === 'undefined') return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isPreviewOpen]);

  if (!cards.length) {
    return (
      <div className="my-3 p-4 rounded-xl border border-[var(--border-parchment)] bg-[var(--bg-panel-subtle)] text-[var(--ink-secondary)] text-sm font-sans">
        No flashcards available in this deck.
      </div>
    );
  }

  // Render Star Ornament SVG
  const renderStarOrnament = () => (
    <div className="flex items-center justify-center gap-4 my-4 md:my-5 text-[#C9BFB0]">
      <span className="h-[1px] w-12 md:w-16 bg-[#DDD5C7]" />
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#BD532B"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0"
        aria-hidden="true"
      >
        <path d="M12 2 L12 22 M2 12 L22 12 M4.93 4.93 L19.07 19.07 M4.93 19.07 L19.07 4.93" />
        <circle cx="12" cy="12" r="2.5" fill="#BD532B" />
      </svg>
      <span className="h-[1px] w-12 md:w-16 bg-[#DDD5C7]" />
    </div>
  );

  // Render Mountain Observatory Engraving SVG
  const renderObservatoryEngraving = () => (
    <div className="absolute bottom-3 right-4 pointer-events-none opacity-25">
      <svg
        width="115"
        height="70"
        viewBox="0 0 160 100"
        fill="none"
        stroke="#8A621E"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 95 C40 85 70 88 100 80 C125 74 145 80 158 95" />
        <path d="M30 90 C65 78 95 72 118 66 C132 62 148 72 158 82" />
        <rect x="114" y="52" width="28" height="15" rx="1" />
        <path d="M114 52 L114 67 M142 52 L142 67 M121 67 L121 56 L127 56 L127 67" />
        <path d="M115 52 C115 36 141 36 141 52 Z" />
        <path d="M125 38 L131 38 L131 52 L125 52 Z" />
        <path d="M45 87 L52 92 M60 84 L68 90 M80 80 L88 86 M100 76 L107 82 M130 70 L137 76" strokeWidth="0.8" />
      </svg>
    </div>
  );

  // Render Flashcard Content
  const renderCardContent = (isLarge: boolean = false) => {
    return (
      <>
        {/* Card Header inside card: Badge + Counter */}
        <div className="flex items-center justify-between w-full">
          <span
            className={`font-mono text-xs font-semibold tracking-widest uppercase px-3 py-1 rounded-full transition-colors ${
              isFlipped
                ? 'bg-[#E5EDE3] text-[#345B3E] border border-[#C5D9C4]'
                : 'bg-[#EFE9DE] text-[#6A6053] border border-[#DDD5C7]'
            }`}
          >
            {isFlipped ? 'ANSWER' : 'QUESTION'}
          </span>
          <span className="font-serif text-sm md:text-base text-[#5C5449] font-medium">
            {currentIndex + 1} / {cards.length}
          </span>
        </div>

        {/* Center Text */}
        <div className="flex-1 flex flex-col items-center justify-center my-auto py-4 relative z-10 w-full">
          {!isFlipped ? (
            <div className="flex flex-col items-center text-center animate-fadeIn w-full">
              <p
                className={`font-serif font-bold text-[#1C1917] leading-snug px-4 md:px-8 max-w-2xl mx-auto ${
                  isLarge ? 'text-2xl md:text-3xl' : 'text-xl md:text-2xl'
                }`}
              >
                {currentCard?.question}
              </p>
              {renderStarOrnament()}
              {currentCard?.concept && (
                <span className="text-[11px] uppercase font-mono tracking-wider text-[#8A7A6A]">
                  {currentCard.concept}
                </span>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center text-center animate-fadeIn w-full">
              <p
                className={`font-serif font-bold text-[#1C1917] leading-snug px-4 md:px-8 max-w-2xl mx-auto ${
                  isLarge ? 'text-2xl md:text-3xl' : 'text-xl md:text-2xl'
                }`}
              >
                {currentCard?.answer}
              </p>
              {renderStarOrnament()}
              {currentCard?.explanation && (
                <p
                  className={`font-serif text-[#2C2724] leading-relaxed px-4 md:px-8 max-w-2xl mx-auto ${
                    isLarge ? 'text-base md:text-lg' : 'text-sm md:text-base'
                  }`}
                >
                  {currentCard.explanation}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Delicate Observatory Engraving in Bottom Right */}
        {renderObservatoryEngraving()}
      </>
    );
  };

  // Render Three Bottom Pills
  const renderBottomPills = () => (
    <div className="flex flex-wrap items-center justify-center gap-3 md:gap-5 z-10 w-full max-w-4xl px-2">
      {/* 1. Left Pill: Restart Deck */}
      <div className="rounded-full bg-[#FAF8F3] border border-[#E0D8C8] shadow-md px-5 py-2 flex items-center gap-2 hover:bg-white transition-colors">
        <button
          type="button"
          onClick={handleRestartDeck}
          className="flex items-center gap-2 text-sm font-medium text-[#2C2724] hover:text-[#1C1917] cursor-pointer"
          aria-label="Restart Deck"
        >
          <RotateCcw size={14} className="text-[#5C5449]" />
          <span>Restart Deck</span>
        </button>
      </div>

      {/* 2. Center Pill: Progress Indicator */}
      <div className="rounded-full bg-[#FAF8F3] border border-[#E0D8C8] shadow-md px-5 py-2 flex items-center gap-3.5">
        <span className="font-serif text-sm font-semibold text-[#1C1917] shrink-0">
          {currentIndex + 1} of {cards.length}
        </span>

        <div className="flex items-center gap-1.5">
          {cards.map((c, i) => {
            const status = reviewState[c.id];
            const isCurrent = i === currentIndex;

            let segmentStyle = 'bg-[#FAF8F3] border border-[#D5CDBD]';
            let icon: React.ReactNode = null;

            if (status === 'got_it') {
              segmentStyle = 'bg-[#BD532B] border-[#BD532B] text-white';
              icon = <Check size={10} strokeWidth={3} className="text-white" />;
            } else if (status === 'again') {
              segmentStyle = 'bg-[#FDF0EB] border border-[#D97C5F] text-[#BD532B]';
              icon = <RotateCw size={9} strokeWidth={2.5} className="text-[#BD532B]" />;
            } else if (isCurrent) {
              segmentStyle = 'bg-[#162135] border-[#162135] text-white';
              icon = <span className="w-1.5 h-1.5 rounded-full bg-[#FAF8F3]" />;
            }

            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setCurrentIndex(i);
                  setIsFlipped(false);
                }}
                className={`w-6 md:w-7 h-4 rounded-full flex items-center justify-center transition-all ${segmentStyle} ${
                  isCurrent ? 'ring-2 ring-[#BD532B]/40 scale-105' : 'hover:opacity-85'
                } cursor-pointer`}
                title={`Card ${i + 1}: ${c.question.slice(0, 35)}...`}
                aria-label={`Go to card ${i + 1}`}
              >
                {icon}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Right Pill: Review Actions */}
      <div className="rounded-full bg-[#FAF8F3] border border-[#E0D8C8] shadow-md p-1 flex items-center gap-2">
        <button
          type="button"
          onClick={() => handleMarkReview('again')}
          className="px-4 py-1.5 rounded-full border border-[#D97C5F] bg-transparent hover:bg-[#FDF0EB] text-[#BD532B] text-sm font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          title="Mark for review again (Key: 1)"
        >
          <RotateCw size={13} />
          <span>Again</span>
        </button>

        <button
          type="button"
          onClick={() => handleMarkReview('got_it')}
          className="px-4 py-1.5 rounded-full bg-[#BD532B] hover:bg-[#A84520] text-white text-sm font-medium flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          title="Mark as learned (Key: 2)"
        >
          <Check size={13} strokeWidth={2.5} />
          <span>Got it</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* -- In-Chat Deck Panel (Normal conversation view) -- */}
      <div
        className="card-surface mt-3 p-4 md:p-5 rounded-2xl border border-[var(--border-parchment)] bg-[var(--bg-panel)] shadow-xs flex flex-col gap-4 max-w-2xl text-[var(--ink-primary)] font-sans"
        data-testid="in-chat-flashcard-deck"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-parchment)] pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--accent-terracotta-soft)] border border-[var(--border-terracotta)] flex items-center justify-center shrink-0">
              <Layers size={17} className="text-[var(--accent-terracotta)]" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-serif font-bold text-base text-[var(--ink-primary)] tracking-tight leading-snug truncate">
                {deck.title}
              </span>
              <div className="flex items-center gap-1.5 text-xs text-[var(--ink-tertiary)] mt-0.5 truncate">
                <BookOpen size={12} className="shrink-0 text-[var(--ink-tertiary)]" />
                <span className="truncate">
                  From: [{deck.source_type === 'source' ? 'Source' : 'Note'}]{' '}
                  <button
                    type="button"
                    onClick={() =>
                      deck.source_id &&
                      onNavigateToItem?.(deck.source_id, deck.source_type)
                    }
                    className="hover:underline font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
                  >
                    {deck.source_title}
                  </button>
                </span>
                <span>·</span>
                <span className="shrink-0">{cards.length} cards</span>
              </div>
            </div>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsPreviewOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-parchment)] bg-white hover:bg-[var(--bg-panel-subtle)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] text-xs font-medium shadow-2xs transition-colors cursor-pointer"
              title="Open full study preview"
            >
              <Maximize2 size={12} />
              <span className="hidden sm:inline">Open in Study Mode</span>
              <span className="sm:hidden">Study</span>
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMenu((prev) => !prev)}
                className="w-8 h-8 rounded-lg border border-[var(--border-parchment)] bg-white hover:bg-[var(--bg-panel-subtle)] flex items-center justify-center text-[var(--ink-tertiary)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
                aria-label="Deck options"
              >
                <MoreVertical size={15} />
              </button>

              {showMenu && (
                <div className="absolute right-0 top-9 z-20 w-44 rounded-xl border border-[var(--border-parchment)] bg-white p-1 shadow-md text-xs flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={handleCopyDeck}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-panel-subtle)] w-full text-left transition-colors cursor-pointer"
                  >
                    <Copy size={13} />
                    <span>{copied ? 'Copied Deck!' : 'Copy Cards Text'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRestartDeck}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-panel-subtle)] w-full text-left transition-colors cursor-pointer"
                  >
                    <RotateCcw size={13} />
                    <span>Reset Review State</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Normal Deck View - Center Card Section */}
        <div className="relative w-full flex items-center justify-center py-1">
          {/* Side Nav Button - Prev */}
          <button
            type="button"
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className={`w-9 h-9 rounded-full border border-[var(--border-parchment)] bg-white flex items-center justify-center text-[var(--ink-secondary)] shadow-2xs transition-all z-10 shrink-0 mr-2 md:mr-3 ${
              currentIndex === 0
                ? 'opacity-30 cursor-not-allowed'
                : 'hover:bg-[var(--bg-panel-subtle)] hover:text-[var(--ink-primary)] hover:border-[var(--border-strong)] active:scale-95 cursor-pointer'
            }`}
            aria-label="Previous flashcard"
          >
            <ChevronLeft size={18} />
          </button>

          {/* Stack Container */}
          <div className="relative flex-1 max-w-lg flex flex-col items-center">
            {/* Physical Deck Layer 2 */}
            <div className="w-[88%] h-2.5 bg-[#E8E3D8] rounded-2xl border border-[#D5CEBF] -mb-1 shadow-2xs" />
            {/* Physical Deck Layer 1 */}
            <div className="w-[94%] h-2.5 bg-[#F2EDE1] rounded-2xl border border-[#DDD6C7] -mb-1 shadow-2xs" />

            {/* Main Interactive Flashcard in Chat */}
            <div
              onClick={handleFlip}
              className="w-full relative min-h-[250px] md:min-h-[275px] rounded-2xl border border-[var(--border-parchment)] bg-white p-6 md:p-7 shadow-xs hover:shadow-sm hover:border-[var(--border-strong)] transition-all cursor-pointer flex flex-col justify-between select-none group"
              role="button"
              tabIndex={0}
              aria-label="Flashcard - click to flip"
            >
              {renderCardContent(false)}
            </div>
          </div>

          {/* Side Nav Button - Next */}
          <button
            type="button"
            onClick={handleNext}
            disabled={currentIndex === cards.length - 1}
            className={`w-9 h-9 rounded-full border border-[var(--border-parchment)] bg-white flex items-center justify-center text-[var(--ink-secondary)] shadow-2xs transition-all z-10 shrink-0 ml-2 md:mr-3 ${
              currentIndex === cards.length - 1
                ? 'opacity-30 cursor-not-allowed'
                : 'hover:bg-[var(--bg-panel-subtle)] hover:text-[var(--ink-primary)] hover:border-[var(--border-strong)] active:scale-95 cursor-pointer'
            }`}
            aria-label="Next flashcard"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Flip Hint */}
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={handleFlip}
            className="text-xs text-[var(--ink-tertiary)] hover:text-[var(--ink-primary)] transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <MousePointerClick size={12} className="text-[var(--ink-tertiary)] shrink-0" />
            <span>Click or press Space to {isFlipped ? 'show question' : 'reveal answer'}</span>
          </button>
        </div>

        {/* In-Chat Footer Controls */}
        <div className="flex items-center justify-between border-t border-[var(--border-parchment)] pt-3">
          <button
            type="button"
            onClick={handleRestartDeck}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-parchment)] bg-white text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-panel-subtle)] text-xs font-medium shadow-2xs transition-colors cursor-pointer"
          >
            <RotateCcw size={12} />
            <span>Restart Deck</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleMarkReview('again')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border text-xs font-medium shadow-2xs transition-all cursor-pointer ${
                reviewState[currentCard?.id || ''] === 'again'
                  ? 'bg-[var(--accent-terracotta)] text-white border-[#a34420]'
                  : 'bg-[var(--accent-terracotta-soft)] hover:bg-[rgba(189,83,43,0.16)] border-[var(--border-terracotta)] text-[var(--accent-terracotta)]'
              }`}
              title="Mark for review again (Key: 1)"
            >
              <RotateCw size={12} />
              <span>Again</span>
            </button>

            <button
              type="button"
              onClick={() => handleMarkReview('got_it')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border text-xs font-medium shadow-2xs transition-all cursor-pointer ${
                reviewState[currentCard?.id || ''] === 'got_it'
                  ? 'bg-[#48724d] text-white border-[#3c6141]'
                  : 'bg-[rgba(90,107,72,0.12)] hover:bg-[rgba(90,107,72,0.18)] border-[rgba(90,107,72,0.35)] text-[var(--accent-olive)]'
              }`}
              title="Mark as learned (Key: 2)"
            >
              <Check size={12} />
              <span>Got it</span>
            </button>
          </div>
        </div>
      </div>

      {/* -- Focused Full-Viewport Preview Overlay (Portal to document.body) -- */}
      {isPreviewOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] w-screen h-screen flex flex-col items-center justify-between p-4 md:p-8 bg-stone-900/65 backdrop-blur-xs animate-fadeIn font-sans select-none overflow-hidden"
            data-testid="flashcard-study-mode-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Flashcard preview overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setIsPreviewOpen(false);
              }
            }}
          >
            {/* Top-Right Floating Circular Close Button */}
            <button
              type="button"
              onClick={() => setIsPreviewOpen(false)}
              className="fixed top-6 right-6 md:top-8 md:right-8 w-11 h-11 rounded-full bg-[#FAF8F3] border border-[#E0D8C8] shadow-md flex items-center justify-center text-[#5C5449] hover:text-[#1C1917] hover:scale-105 active:scale-95 transition-all z-[110] cursor-pointer"
              aria-label="Close study mode"
              title="Close preview (Esc)"
            >
              <X size={20} />
            </button>

            {/* Central Card with External Side Chevron Navigation */}
            <div className="flex items-center justify-center gap-3 md:gap-7 w-full max-w-5xl my-auto px-2">
              {/* Left Chevron Button */}
              <button
                type="button"
                onClick={handlePrev}
                disabled={currentIndex === 0}
                className={`w-11 md:w-13 h-11 md:h-13 rounded-full bg-[#FAF8F3] border border-[#E0D8C8] shadow-md flex items-center justify-center text-[#5C5449] hover:text-[#1C1917] hover:scale-105 active:scale-95 transition-all shrink-0 cursor-pointer ${
                  currentIndex === 0 ? 'opacity-30 cursor-not-allowed hover:scale-100' : ''
                }`}
                aria-label="Previous flashcard"
              >
                <ChevronLeft size={24} />
              </button>

              {/* Central Stack & Main Large Ivory Card */}
              <div className="relative flex-1 max-w-2xl md:max-w-3xl flex flex-col items-center">
                {/* Stack Depth Layer 2 */}
                <div className="w-[94%] h-3 bg-[#EAE4D7] rounded-3xl border border-[#D5CEBF] -mb-1 shadow-2xs" />
                {/* Stack Depth Layer 1 */}
                <div className="w-[97%] h-3 bg-[#F4EFE4] rounded-3xl border border-[#DDD6C7] -mb-1 shadow-2xs" />

                {/* Main Large Card */}
                <div
                  onClick={handleFlip}
                  className="w-full relative min-h-[360px] md:min-h-[420px] rounded-3xl border border-[#E0D8C8] bg-[#FAF8F3] p-8 md:p-12 shadow-xl cursor-pointer select-none flex flex-col justify-between transition-all group"
                  role="button"
                  tabIndex={0}
                  aria-label="Flashcard - click to flip"
                >
                  {renderCardContent(true)}
                </div>
              </div>

              {/* Right Chevron Button */}
              <button
                type="button"
                onClick={handleNext}
                disabled={currentIndex === cards.length - 1}
                className={`w-11 md:w-13 h-11 md:h-13 rounded-full bg-[#FAF8F3] border border-[#E0D8C8] shadow-md flex items-center justify-center text-[#5C5449] hover:text-[#1C1917] hover:scale-105 active:scale-95 transition-all shrink-0 cursor-pointer ${
                  currentIndex === cards.length - 1 ? 'opacity-30 cursor-not-allowed hover:scale-100' : ''
                }`}
                aria-label="Next flashcard"
              >
                <ChevronRight size={24} />
              </button>
            </div>

            {/* Bottom Section: Three Separate Pill Groups */}
            <div className="w-full flex justify-center pb-2 md:pb-6 z-10">
              {renderBottomPills()}
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
