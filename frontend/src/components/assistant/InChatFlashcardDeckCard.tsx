import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Sparkles,
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

  const [isStudyMode, setIsStudyMode] = useState<boolean>(false);
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
    setCurrentIndex(0);
    setIsFlipped(false);
    setReviewState({});
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    setShowMenu(false);
  }, [storageKey]);

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
      } else if (e.key === 'Escape' && isStudyMode) {
        e.preventDefault();
        setIsStudyMode(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleFlip, handlePrev, handleNext, handleMarkReview, isStudyMode]);

  if (!cards.length) {
    return (
      <div className="my-3 p-4 rounded-xl border border-[var(--border-parchment)] bg-[var(--bg-panel-subtle)] text-[var(--ink-secondary)] text-sm font-sans">
        No flashcards available in this deck.
      </div>
    );
  }

  // Count review statistics
  const gotItCount = Object.values(reviewState).filter((v) => v === 'got_it').length;
  const againCount = Object.values(reviewState).filter((v) => v === 'again').length;

  return (
    <>
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
              onClick={() => setIsStudyMode(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-parchment)] bg-white hover:bg-[var(--bg-panel-subtle)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] text-xs font-medium shadow-2xs transition-colors"
              title="Open full study mode"
            >
              <Maximize2 size={12} />
              <span className="hidden sm:inline">Open in Study Mode</span>
              <span className="sm:hidden">Study</span>
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMenu((prev) => !prev)}
                className="w-8 h-8 rounded-lg border border-[var(--border-parchment)] bg-white hover:bg-[var(--bg-panel-subtle)] flex items-center justify-center text-[var(--ink-tertiary)] hover:text-[var(--ink-primary)] transition-colors"
                aria-label="Deck options"
              >
                <MoreVertical size={15} />
              </button>

              {showMenu && (
                <div className="absolute right-0 top-9 z-20 w-44 rounded-xl border border-[var(--border-parchment)] bg-white p-1 shadow-md text-xs flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={handleCopyDeck}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-panel-subtle)] w-full text-left transition-colors"
                  >
                    <Copy size={13} />
                    <span>{copied ? 'Copied Deck!' : 'Copy Cards Text'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRestartDeck}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-panel-subtle)] w-full text-left transition-colors"
                  >
                    <RotateCcw size={13} />
                    <span>Reset Review State</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Central Flashcard Section with Layered Parchment Depth */}
        <div className="relative w-full flex items-center justify-center py-1">
          {/* Side Nav Button - Prev */}
          <button
            type="button"
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className={`w-9 h-9 rounded-full border border-[var(--border-parchment)] bg-white flex items-center justify-center text-[var(--ink-secondary)] shadow-2xs transition-all z-10 shrink-0 mr-2 md:mr-3 ${
              currentIndex === 0
                ? 'opacity-30 cursor-not-allowed'
                : 'hover:bg-[var(--bg-panel-subtle)] hover:text-[var(--ink-primary)] hover:border-[var(--border-strong)] active:scale-95'
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

            {/* Main Interactive Flashcard */}
            <div
              onClick={handleFlip}
              className="w-full relative min-h-[250px] md:min-h-[275px] rounded-2xl border border-[var(--border-parchment)] bg-white p-6 md:p-7 shadow-xs hover:shadow-sm hover:border-[var(--border-strong)] transition-all cursor-pointer flex flex-col justify-between select-none group"
              role="button"
              tabIndex={0}
              aria-label="Flashcard - click to flip"
            >
              {/* Card Header: Badge & Counter */}
              <div className="flex items-center justify-between">
                <span
                  className={`text-[10.5px] font-mono font-semibold tracking-widest uppercase px-2.5 py-0.5 rounded-full transition-colors ${
                    isFlipped
                      ? 'bg-[rgba(90,107,72,0.12)] text-[var(--accent-olive)] border border-[rgba(90,107,72,0.25)]'
                      : 'bg-[var(--bg-panel-subtle)] text-[var(--ink-secondary)] border border-[var(--border-parchment)]'
                  }`}
                >
                  {isFlipped ? 'ANSWER' : 'QUESTION'}
                </span>
                <span className="font-mono text-xs text-[var(--ink-tertiary)] font-medium">
                  {currentIndex + 1} / {cards.length}
                </span>
              </div>

              {/* Card Content */}
              <div className="flex-1 flex flex-col items-center justify-center my-3 relative z-10">
                {!isFlipped ? (
                  <div className="flex flex-col items-center text-center animate-fadeIn">
                    <p className="font-serif text-xl md:text-2xl font-medium text-[var(--ink-primary)] leading-snug px-3">
                      {currentCard?.question}
                    </p>
                    {/* Star Divider Motif using SVG Sparkles */}
                    <div className="flex items-center justify-center gap-3 my-3 text-[var(--border-strong)]">
                      <span className="h-[1px] w-12 bg-[var(--border-parchment)]" />
                      <Sparkles size={11} className="text-[var(--accent-brass)] opacity-70" />
                      <span className="h-[1px] w-12 bg-[var(--border-parchment)]" />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-center animate-fadeIn">
                    <p className="font-serif text-lg md:text-xl font-semibold text-[var(--ink-primary)] leading-snug px-3">
                      {currentCard?.answer}
                    </p>
                    {/* Star Divider Motif using SVG Sparkles */}
                    <div className="flex items-center justify-center gap-3 my-2.5 text-[var(--border-strong)]">
                      <span className="h-[1px] w-12 bg-[var(--border-parchment)]" />
                      <Sparkles size={11} className="text-[var(--accent-brass)] opacity-70" />
                      <span className="h-[1px] w-12 bg-[var(--border-parchment)]" />
                    </div>
                    {currentCard?.explanation && (
                      <p className="font-sans text-xs md:text-sm text-[var(--ink-secondary)] leading-relaxed px-4 max-w-md">
                        {currentCard.explanation}
                      </p>
                    )}
                    {currentCard?.concept && (
                      <span className="mt-2 text-[10px] uppercase font-mono tracking-wider text-[var(--ink-tertiary)]">
                        {currentCard.concept}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Delicate Vintage Engraving Motif in Bottom Right Corner */}
              <div className="absolute bottom-2.5 right-3.5 pointer-events-none opacity-20 text-[var(--ink-tertiary)]">
                <svg
                  width="72"
                  height="46"
                  viewBox="0 0 120 80"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M10 65 L60 65 L70 55 L20 55 Z" />
                  <path d="M10 73 L60 73 L70 65 L20 65 Z" />
                  <path d="M10 65 L10 73 M60 65 L60 73 M70 55 L70 65" />
                  <path d="M22 55 C30 52 40 52 48 55 C56 52 66 52 74 55" />
                  <circle cx="85" cy="40" r="16" />
                  <ellipse cx="85" cy="40" rx="16" ry="6" />
                  <path d="M85 24 L85 56" />
                  <path d="M85 56 L85 68 M75 68 L95 68" />
                  <path d="M78 28 L80 30 M92 48 L94 50" />
                </svg>
              </div>
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
                : 'hover:bg-[var(--bg-panel-subtle)] hover:text-[var(--ink-primary)] hover:border-[var(--border-strong)] active:scale-95'
            }`}
            aria-label="Next flashcard"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Click/Space Hint & Segmented Pill Progress Indicator */}
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={handleFlip}
            className="text-xs text-[var(--ink-tertiary)] hover:text-[var(--ink-primary)] transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <MousePointerClick size={12} className="text-[var(--ink-tertiary)] shrink-0" />
            <span>Click or press Space to {isFlipped ? 'show question' : 'reveal answer'}</span>
          </button>

          {/* Segmented Progress Bar */}
          <div className="flex items-center gap-1.5 py-0.5">
            {cards.map((c, i) => {
              const status = reviewState[c.id];
              const isActive = i === currentIndex;
              let pillClass = 'border border-[var(--border-parchment)] bg-transparent';
              if (status === 'got_it') {
                pillClass = 'bg-[#48724d] border-[#3c6141]';
              } else if (status === 'again') {
                pillClass = 'bg-[var(--accent-terracotta)] border-[#a34420]';
              } else if (isActive) {
                pillClass = 'bg-[var(--ink-secondary)] border-[var(--ink-primary)]';
              }

              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setCurrentIndex(i);
                    setIsFlipped(false);
                  }}
                  className={`w-5 h-2 rounded-full transition-all ${pillClass} ${
                    isActive ? 'ring-2 ring-[var(--accent-terracotta-soft)] scale-110' : 'hover:opacity-80'
                  }`}
                  title={`Card ${i + 1}: ${c.question.slice(0, 30)}...`}
                  aria-label={`Go to card ${i + 1}`}
                />
              );
            })}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-[var(--border-parchment)] pt-3">
          <button
            type="button"
            onClick={handleRestartDeck}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-parchment)] bg-white text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-panel-subtle)] text-xs font-medium shadow-2xs transition-colors"
          >
            <RotateCcw size={12} />
            <span>Restart Deck</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleMarkReview('again')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border text-xs font-medium shadow-2xs transition-all ${
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
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border text-xs font-medium shadow-2xs transition-all ${
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

      {/* Study Mode Focus Modal */}
      {isStudyMode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-xs animate-fadeIn font-sans"
          data-testid="flashcard-study-mode-modal"
        >
          <div className="relative w-full max-w-2xl bg-[var(--bg-panel)] border border-[var(--border-strong)] rounded-3xl p-6 md:p-8 shadow-xl flex flex-col gap-6 text-[var(--ink-primary)]">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[var(--border-parchment)] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--accent-terracotta-soft)] border border-[var(--border-terracotta)] flex items-center justify-center">
                  <Sparkles size={17} className="text-[var(--accent-terracotta)]" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-lg text-[var(--ink-primary)]">
                    {deck.title}
                  </h3>
                  <p className="text-xs text-[var(--ink-tertiary)]">
                    Study Session · {cards.length} Cards · {gotItCount} Got it · {againCount} Again
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsStudyMode(false)}
                className="w-8 h-8 rounded-full border border-[var(--border-parchment)] bg-white hover:bg-[var(--bg-panel-subtle)] flex items-center justify-center text-[var(--ink-tertiary)] hover:text-[var(--ink-primary)] transition-colors"
                aria-label="Close study mode"
              >
                <X size={16} />
              </button>
            </div>

            {/* Study Card (Expanded) */}
            <div
              onClick={handleFlip}
              className="w-full min-h-[300px] md:min-h-[330px] rounded-2xl border border-[var(--border-parchment)] bg-white p-8 shadow-xs flex flex-col justify-between cursor-pointer select-none relative group"
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-[11px] font-mono font-semibold tracking-widest uppercase px-3 py-1 rounded-full ${
                    isFlipped
                      ? 'bg-[rgba(90,107,72,0.12)] text-[var(--accent-olive)] border border-[rgba(90,107,72,0.25)]'
                      : 'bg-[var(--bg-panel-subtle)] text-[var(--ink-secondary)] border border-[var(--border-parchment)]'
                  }`}
                >
                  {isFlipped ? 'ANSWER' : 'QUESTION'}
                </span>
                <span className="font-mono text-xs text-[var(--ink-tertiary)] font-medium">
                  {currentIndex + 1} / {cards.length}
                </span>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center my-4">
                {!isFlipped ? (
                  <div className="text-center">
                    <p className="font-serif text-2xl md:text-3xl font-medium text-[var(--ink-primary)] leading-relaxed px-4">
                      {currentCard?.question}
                    </p>
                    <div className="flex items-center justify-center gap-3 my-4 text-[var(--border-strong)]">
                      <span className="h-[1px] w-16 bg-[var(--border-parchment)]" />
                      <Sparkles size={13} className="text-[var(--accent-brass)] opacity-70" />
                      <span className="h-[1px] w-16 bg-[var(--border-parchment)]" />
                    </div>
                  </div>
                ) : (
                  <div className="text-center max-w-lg">
                    <p className="font-serif text-xl md:text-2xl font-semibold text-[var(--ink-primary)] leading-snug px-2">
                      {currentCard?.answer}
                    </p>
                    <div className="flex items-center justify-center gap-3 my-3 text-[var(--border-strong)]">
                      <span className="h-[1px] w-16 bg-[var(--border-parchment)]" />
                      <Sparkles size={13} className="text-[var(--accent-brass)] opacity-70" />
                      <span className="h-[1px] w-16 bg-[var(--border-parchment)]" />
                    </div>
                    {currentCard?.explanation && (
                      <p className="font-sans text-xs md:text-sm text-[var(--ink-secondary)] leading-relaxed px-4">
                        {currentCard.explanation}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center gap-1.5 text-xs text-[var(--ink-tertiary)]">
                <MousePointerClick size={12} />
                <span>
                  Click card or press <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-panel-subtle)] border border-[var(--border-parchment)] text-[10px] font-mono">Space</kbd> to {isFlipped ? 'hide' : 'reveal'} answer
                </span>
              </div>
            </div>

            {/* Study Mode Controls & Keyboard hints */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handlePrev}
                  disabled={currentIndex === 0}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[var(--border-parchment)] bg-white text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] font-medium text-xs disabled:opacity-30"
                >
                  <ChevronLeft size={15} />
                  <span>Previous</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleMarkReview('again')}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[var(--border-terracotta)] bg-[var(--accent-terracotta-soft)] text-[var(--accent-terracotta)] hover:bg-[rgba(189,83,43,0.16)] font-semibold text-xs shadow-2xs transition-colors"
                  >
                    <RotateCw size={13} />
                    <span>Again (1)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMarkReview('got_it')}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[rgba(90,107,72,0.35)] bg-[rgba(90,107,72,0.12)] text-[var(--accent-olive)] hover:bg-[rgba(90,107,72,0.18)] font-semibold text-xs shadow-2xs transition-colors"
                  >
                    <Check size={13} />
                    <span>Got it (2)</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleNext}
                  disabled={currentIndex === cards.length - 1}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[var(--border-parchment)] bg-white text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] font-medium text-xs disabled:opacity-30"
                >
                  <span>Next</span>
                  <ChevronRight size={15} />
                </button>
              </div>

              {/* Progress bar in modal */}
              <div className="flex items-center justify-center gap-2 pt-1">
                {cards.map((c, i) => {
                  const status = reviewState[c.id];
                  const isActive = i === currentIndex;
                  let pillClass = 'border border-[var(--border-parchment)] bg-transparent';
                  if (status === 'got_it') pillClass = 'bg-[#48724d] border-[#3c6141]';
                  else if (status === 'again') pillClass = 'bg-[var(--accent-terracotta)] border-[#a34420]';
                  else if (isActive) pillClass = 'bg-[var(--ink-secondary)] border-[var(--ink-primary)]';

                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCurrentIndex(i);
                        setIsFlipped(false);
                      }}
                      className={`w-6 h-2 rounded-full transition-all ${pillClass} ${
                        isActive ? 'ring-2 ring-[var(--accent-terracotta-soft)] scale-110' : ''
                      }`}
                      aria-label={`Go to card ${i + 1}`}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
