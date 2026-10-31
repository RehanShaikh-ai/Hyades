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
        if (typeof parsed.currentIndex === 'number' && parsed.currentIndex >= 0 && parsed.currentIndex < cards.length) {
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
          `Card ${idx + 1}: ${c.question}\nAnswer: ${c.answer}\n${c.explanation ? `Explanation: ${c.explanation}\n` : ''}`
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
      <div className="my-3 p-4 rounded-xl border border-stone-200 bg-stone-50 text-stone-600 text-sm">
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
        className="my-3 rounded-2xl border border-stone-200/90 dark:border-stone-800 bg-[#faf8f4] dark:bg-stone-900/60 p-5 md:p-6 shadow-sm flex flex-col gap-5 max-w-2xl text-stone-900 dark:text-stone-100 transition-all font-sans"
        data-testid="in-chat-flashcard-deck"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-stone-200/80 dark:border-stone-800 pb-3.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#faede6] dark:bg-stone-800 border border-[#f3d9ce] dark:border-stone-700 flex items-center justify-center shrink-0 shadow-xs">
              <Layers size={19} className="text-[#a84c2f] dark:text-amber-500" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-serif font-bold text-base md:text-[17px] text-stone-900 dark:text-stone-100 tracking-tight leading-snug">
                {deck.title}
              </span>
              <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                <BookOpen size={13} className="shrink-0" />
                <span className="truncate">
                  From: [{deck.source_type === 'source' ? 'Source' : 'Note'}]{' '}
                  <button
                    type="button"
                    onClick={() =>
                      deck.source_id &&
                      onNavigateToItem?.(deck.source_id, deck.source_type)
                    }
                    className="hover:underline font-medium text-stone-700 dark:text-stone-300"
                  >
                    {deck.source_title}
                  </button>
                </span>
                <span>·</span>
                <span>{cards.length} cards</span>
              </div>
            </div>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-2 relative">
            <button
              type="button"
              onClick={() => setIsStudyMode(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-white/90 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700/80 text-stone-700 dark:text-stone-300 text-xs font-medium shadow-2xs transition-colors"
              title="Open full study mode"
            >
              <Maximize2 size={13} />
              <span className="hidden sm:inline">Open in Study Mode</span>
              <span className="sm:hidden">Study</span>
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMenu((prev) => !prev)}
                className="w-8 h-8 rounded-lg border border-stone-200 dark:border-stone-700 flex items-center justify-center text-stone-500 hover:text-stone-900 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                aria-label="Deck options"
              >
                <MoreVertical size={16} />
              </button>

              {showMenu && (
                <div className="absolute right-0 top-9 z-20 w-44 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 p-1 shadow-lg text-xs flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={handleCopyDeck}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 w-full text-left transition-colors"
                  >
                    <Copy size={14} />
                    <span>{copied ? 'Copied Deck!' : 'Copy Cards Text'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRestartDeck}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 w-full text-left transition-colors"
                  >
                    <RotateCcw size={14} />
                    <span>Reset Review State</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Central Flashcard Section with Layered Stack Depth */}
        <div className="relative w-full flex items-center justify-center py-2">
          {/* Side Nav Button - Prev */}
          <button
            type="button"
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className={`w-9 h-9 rounded-full border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 flex items-center justify-center text-stone-600 dark:text-stone-300 shadow-sm transition-all z-10 shrink-0 mr-2 md:mr-3 ${
              currentIndex === 0
                ? 'opacity-30 cursor-not-allowed'
                : 'hover:bg-stone-100 dark:hover:bg-stone-700 hover:scale-105 active:scale-95'
            }`}
            aria-label="Previous flashcard"
          >
            <ChevronLeft size={18} />
          </button>

          {/* Stack Container */}
          <div className="relative flex-1 max-w-lg flex flex-col items-center">
            {/* Physical Deck Layer 2 */}
            <div className="w-[88%] h-2.5 bg-[#ece6dc] dark:bg-stone-800/60 rounded-2xl border border-stone-300/60 dark:border-stone-700 -mb-1 shadow-xs" />
            {/* Physical Deck Layer 1 */}
            <div className="w-[94%] h-2.5 bg-[#f5efe5] dark:bg-stone-800/80 rounded-2xl border border-stone-300/80 dark:border-stone-700 -mb-1 shadow-xs" />

            {/* Main Interactive Flashcard */}
            <div
              onClick={handleFlip}
              className="w-full relative min-h-[250px] md:min-h-[275px] rounded-2xl border border-stone-300 dark:border-stone-700 bg-[#fdfcf9] dark:bg-stone-900/90 p-6 md:p-7 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between select-none group"
              role="button"
              tabIndex={0}
              aria-label="Flashcard - click to flip"
            >
              {/* Card Header: Badge & Counter */}
              <div className="flex items-center justify-between">
                <span
                  className={`text-[11px] font-semibold tracking-wider uppercase px-2.5 py-0.5 rounded-full transition-colors ${
                    isFlipped
                      ? 'bg-[#e7f2e8] text-[#2c663b] border border-[#c4e3cb]'
                      : 'bg-[#f0ebe1] text-[#786b5c] border border-[#e3dcd1]'
                  }`}
                >
                  {isFlipped ? 'ANSWER' : 'QUESTION'}
                </span>
                <span className="font-mono text-xs text-stone-400 font-medium">
                  {currentIndex + 1} / {cards.length}
                </span>
              </div>

              {/* Card Content */}
              <div className="flex-1 flex flex-col items-center justify-center my-3 relative z-10">
                {!isFlipped ? (
                  <div className="flex flex-col items-center text-center animate-fadeIn">
                    <p className="font-serif text-xl md:text-2xl font-medium text-stone-900 dark:text-stone-100 leading-snug px-3">
                      {currentCard?.question}
                    </p>
                    {/* Star Divider Motif */}
                    <div className="flex items-center justify-center gap-3 my-3 text-stone-400/90 dark:text-stone-600">
                      <span className="h-[1px] w-12 bg-stone-300/70 dark:bg-stone-700" />
                      <span className="text-xs">✦</span>
                      <span className="h-[1px] w-12 bg-stone-300/70 dark:bg-stone-700" />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-center animate-fadeIn">
                    <p className="font-serif text-lg md:text-xl font-semibold text-stone-900 dark:text-stone-100 leading-snug px-3">
                      {currentCard?.answer}
                    </p>
                    {/* Star Divider Motif */}
                    <div className="flex items-center justify-center gap-3 my-2.5 text-stone-400/90 dark:text-stone-600">
                      <span className="h-[1px] w-12 bg-stone-300/70 dark:bg-stone-700" />
                      <span className="text-xs">✦</span>
                      <span className="h-[1px] w-12 bg-stone-300/70 dark:bg-stone-700" />
                    </div>
                    {currentCard?.explanation && (
                      <p className="font-sans text-xs md:text-sm text-stone-600 dark:text-stone-400 leading-relaxed px-4 max-w-md">
                        {currentCard.explanation}
                      </p>
                    )}
                    {currentCard?.concept && (
                      <span className="mt-2 text-[10px] uppercase font-mono tracking-wider text-stone-400">
                        {currentCard.concept}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Vintage Engraving Illustration in Bottom Right Corner */}
              <div className="absolute bottom-2.5 right-3.5 pointer-events-none opacity-30 dark:opacity-15 text-stone-500">
                <svg
                  width="78"
                  height="50"
                  viewBox="0 0 120 80"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {/* Stacked books */}
                  <path d="M10 65 L60 65 L70 55 L20 55 Z" />
                  <path d="M10 73 L60 73 L70 65 L20 65 Z" />
                  <path d="M10 65 L10 73 M60 65 L60 73 M70 55 L70 65" />
                  {/* Open book / compass */}
                  <path d="M22 55 C30 52 40 52 48 55 C56 52 66 52 74 55" />
                  {/* Globe */}
                  <circle cx="85" cy="40" r="16" />
                  <ellipse cx="85" cy="40" rx="16" ry="6" />
                  <path d="M85 24 L85 56" />
                  <path d="M85 56 L85 68 M75 68 L95 68" />
                  {/* Orbit star */}
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
            className={`w-9 h-9 rounded-full border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 flex items-center justify-center text-stone-600 dark:text-stone-300 shadow-sm transition-all z-10 shrink-0 ml-2 md:mr-3 ${
              currentIndex === cards.length - 1
                ? 'opacity-30 cursor-not-allowed'
                : 'hover:bg-stone-100 dark:hover:bg-stone-700 hover:scale-105 active:scale-95'
            }`}
            aria-label="Next flashcard"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Click/Space Hint & Segmented Pill Progress Indicator */}
        <div className="flex flex-col items-center gap-2.5">
          <button
            type="button"
            onClick={handleFlip}
            className="text-xs text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span>👆</span>
            <span>Click or press Space to {isFlipped ? 'show question' : 'reveal the answer'}</span>
          </button>

          {/* Segmented Progress Bar */}
          <div className="flex items-center gap-1.5 py-1">
            {cards.map((c, i) => {
              const status = reviewState[c.id];
              const isActive = i === currentIndex;
              let pillClass = 'border border-stone-300 dark:border-stone-700 bg-transparent';
              if (status === 'got_it') {
                pillClass = 'bg-[#6b9b76] border-[#5a8664]';
              } else if (status === 'again') {
                pillClass = 'bg-[#d97c5f] border-[#c4684c]';
              } else if (isActive) {
                pillClass = 'bg-[#8a7a6a] dark:bg-stone-400 border-[#726456]';
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
                    isActive ? 'ring-2 ring-stone-400/40 scale-110' : 'hover:opacity-80'
                  }`}
                  title={`Card ${i + 1}: ${c.question.slice(0, 30)}...`}
                  aria-label={`Go to card ${i + 1}`}
                />
              );
            })}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-stone-200/80 dark:border-stone-800 pt-3">
          <button
            type="button"
            onClick={handleRestartDeck}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 text-xs font-medium hover:bg-stone-50 dark:hover:bg-stone-700/60 shadow-2xs transition-colors"
          >
            <RotateCcw size={13} />
            <span>Restart Deck</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleMarkReview('again')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg border text-xs font-medium shadow-2xs transition-all ${
                reviewState[currentCard?.id || ''] === 'again'
                  ? 'bg-[#d97c5f] text-white border-[#c4684c]'
                  : 'bg-[#fbf0ec] hover:bg-[#f6ded4] border-[#f3ccbd] text-[#aa4525] dark:bg-stone-800 dark:text-amber-400 dark:border-stone-700'
              }`}
              title="Mark for review again (Key: 1)"
            >
              <RotateCw size={13} />
              <span>Again</span>
            </button>

            <button
              type="button"
              onClick={() => handleMarkReview('got_it')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg border text-xs font-medium shadow-2xs transition-all ${
                reviewState[currentCard?.id || ''] === 'got_it'
                  ? 'bg-[#6b9b76] text-white border-[#5a8664]'
                  : 'bg-[#eef6ef] hover:bg-[#dfeee1] border-[#c4e4cc] text-[#246b3e] dark:bg-stone-800 dark:text-emerald-400 dark:border-stone-700'
              }`}
              title="Mark as learned (Key: 2)"
            >
              <Check size={13} />
              <span>Got it</span>
            </button>
          </div>
        </div>
      </div>

      {/* Study Mode Focus Modal */}
      {isStudyMode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/75 backdrop-blur-xs animate-fadeIn"
          data-testid="flashcard-study-mode-modal"
        >
          <div className="relative w-full max-w-2xl bg-[#faf7f2] dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-3xl p-6 md:p-8 shadow-2xl flex flex-col gap-6">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#faede6] dark:bg-stone-800 border border-[#f3d9ce] flex items-center justify-center">
                  <Sparkles size={18} className="text-[#a84c2f]" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-lg text-stone-900 dark:text-stone-100">
                    {deck.title}
                  </h3>
                  <p className="text-xs text-stone-500">
                    Study Session · {cards.length} Cards · {gotItCount} Got it · {againCount} Again
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsStudyMode(false)}
                className="w-9 h-9 rounded-full border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 flex items-center justify-center text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
                aria-label="Close study mode"
              >
                <X size={18} />
              </button>
            </div>

            {/* Study Card (Expanded) */}
            <div
              onClick={handleFlip}
              className="w-full min-h-[300px] md:min-h-[340px] rounded-2xl border border-stone-300 dark:border-stone-700 bg-[#fdfcf9] dark:bg-stone-950 p-8 shadow-md flex flex-col justify-between cursor-pointer select-none relative group"
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-semibold tracking-wider uppercase px-3 py-1 rounded-full ${
                    isFlipped
                      ? 'bg-[#e7f2e8] text-[#2c663b] border border-[#c4e3cb]'
                      : 'bg-[#f0ebe1] text-[#786b5c] border border-[#e3dcd1]'
                  }`}
                >
                  {isFlipped ? 'ANSWER' : 'QUESTION'}
                </span>
                <span className="font-mono text-sm text-stone-400 font-medium">
                  {currentIndex + 1} / {cards.length}
                </span>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center my-4">
                {!isFlipped ? (
                  <div className="text-center">
                    <p className="font-serif text-2xl md:text-3xl font-medium text-stone-900 dark:text-stone-100 leading-relaxed px-4">
                      {currentCard?.question}
                    </p>
                    <div className="flex items-center justify-center gap-3 my-4 text-stone-400">
                      <span className="h-[1px] w-16 bg-stone-300 dark:bg-stone-700" />
                      <span>✦</span>
                      <span className="h-[1px] w-16 bg-stone-300 dark:bg-stone-700" />
                    </div>
                  </div>
                ) : (
                  <div className="text-center max-w-lg">
                    <p className="font-serif text-xl md:text-2xl font-semibold text-stone-900 dark:text-stone-100 leading-snug px-2">
                      {currentCard?.answer}
                    </p>
                    <div className="flex items-center justify-center gap-3 my-3 text-stone-400">
                      <span className="h-[1px] w-16 bg-stone-300 dark:bg-stone-700" />
                      <span>✦</span>
                      <span className="h-[1px] w-16 bg-stone-300 dark:bg-stone-700" />
                    </div>
                    {currentCard?.explanation && (
                      <p className="font-sans text-sm md:text-base text-stone-600 dark:text-stone-400 leading-relaxed px-4">
                        {currentCard.explanation}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <p className="text-center text-xs text-stone-400">
                Click card or press <kbd className="px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 border text-[11px]">Space</kbd> to {isFlipped ? 'hide' : 'reveal'} answer
              </p>
            </div>

            {/* Study Mode Controls & Keyboard hints */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handlePrev}
                  disabled={currentIndex === 0}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-medium text-xs disabled:opacity-30"
                >
                  <ChevronLeft size={16} />
                  <span>Previous (←)</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleMarkReview('again')}
                    className="flex items-center gap-1.5 px-5 py-2 rounded-xl border border-[#f3ccbd] bg-[#fbf0ec] text-[#aa4525] font-semibold text-xs shadow-xs"
                  >
                    <RotateCw size={14} />
                    <span>Again (1)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMarkReview('got_it')}
                    className="flex items-center gap-1.5 px-5 py-2 rounded-xl border border-[#c4e4cc] bg-[#eef6ef] text-[#246b3e] font-semibold text-xs shadow-xs"
                  >
                    <Check size={14} />
                    <span>Got it (2)</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleNext}
                  disabled={currentIndex === cards.length - 1}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-medium text-xs disabled:opacity-30"
                >
                  <span>Next (→)</span>
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* Progress bar in modal */}
              <div className="flex items-center justify-center gap-2 pt-2">
                {cards.map((c, i) => {
                  const status = reviewState[c.id];
                  const isActive = i === currentIndex;
                  let pillClass = 'border border-stone-300 dark:border-stone-700 bg-transparent';
                  if (status === 'got_it') pillClass = 'bg-[#6b9b76] border-[#5a8664]';
                  else if (status === 'again') pillClass = 'bg-[#d97c5f] border-[#c4684c]';
                  else if (isActive) pillClass = 'bg-[#8a7a6a] border-[#726456]';

                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCurrentIndex(i);
                        setIsFlipped(false);
                      }}
                      className={`w-6 h-2 rounded-full transition-all ${pillClass} ${
                        isActive ? 'ring-2 ring-stone-400/40 scale-110' : ''
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
