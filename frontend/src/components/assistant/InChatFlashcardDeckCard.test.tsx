import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { InChatFlashcardDeckCard } from './InChatFlashcardDeckCard';
import { FlashcardDeckData } from '@/types/commands';

const mockDeck: FlashcardDeckData = {
  deck_id: 'deck-osi-test-123',
  title: 'OSI Model: Key Concepts',
  source_type: 'note',
  source_id: 'note-osi-1',
  source_title: 'OSI Model',
  cards_count: 3,
  cards: [
    {
      id: 'card-1',
      question: 'What is the main purpose of the OSI model?',
      answer: 'Standardizes network communication into seven layers for interoperability.',
      explanation: 'Developed by ISO in 1984.',
      concept: 'Architecture',
    },
    {
      id: 'card-2',
      question: 'Which layer is responsible for end-to-end data transfer?',
      answer: 'Layer 4 — The Transport Layer.',
      explanation: 'Uses TCP or UDP.',
      concept: 'Transport',
    },
    {
      id: 'card-3',
      question: 'At which layer do routers operate?',
      answer: 'Layer 3 — The Network Layer.',
      explanation: 'Manages IP addressing.',
      concept: 'Network',
    },
  ],
};

describe('InChatFlashcardDeckCard Component', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    window.confirm = vi.fn(() => true);
  });

  it('renders deck header, initial card question, and navigation controls', () => {
    render(<InChatFlashcardDeckCard deck={mockDeck} />);

    expect(screen.getByText('OSI Model: Key Concepts')).toBeInTheDocument();
    expect(screen.getByText(/From: \[Note\]/)).toBeInTheDocument();
    expect(screen.getByText(/3 cards/)).toBeInTheDocument();
    expect(screen.getByText('QUESTION')).toBeInTheDocument();
    expect(screen.getByText('What is the main purpose of the OSI model?')).toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open in Study Mode/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Restart Deck/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Again/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Got it/i })).toBeInTheDocument();
  });

  it('flips the card to reveal answer on click', () => {
    render(<InChatFlashcardDeckCard deck={mockDeck} />);

    const card = screen.getByRole('button', { name: /Flashcard - click to flip/i });
    expect(screen.getByText('QUESTION')).toBeInTheDocument();
    expect(screen.queryByText('ANSWER')).not.toBeInTheDocument();

    // Click to flip
    fireEvent.click(card);
    expect(screen.getByText('ANSWER')).toBeInTheDocument();
    expect(
      screen.getByText('Standardizes network communication into seven layers for interoperability.')
    ).toBeInTheDocument();
    expect(screen.getByText('Developed by ISO in 1984.')).toBeInTheDocument();

    // Click again to flip back
    fireEvent.click(card);
    expect(screen.getByText('QUESTION')).toBeInTheDocument();
  });

  it('navigates next and previous using side arrow buttons', () => {
    render(<InChatFlashcardDeckCard deck={mockDeck} />);

    const nextBtn = screen.getByLabelText(/Next flashcard/i);
    const prevBtn = screen.getByLabelText(/Previous flashcard/i);

    // Initial: Card 1 (prev disabled)
    expect(prevBtn).toBeDisabled();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();

    // Go next -> Card 2
    fireEvent.click(nextBtn);
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(
      screen.getByText('Which layer is responsible for end-to-end data transfer?')
    ).toBeInTheDocument();
    expect(prevBtn).not.toBeDisabled();

    // Go next -> Card 3
    fireEvent.click(nextBtn);
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    expect(screen.getByText('At which layer do routers operate?')).toBeInTheDocument();
    expect(nextBtn).toBeDisabled();

    // Go back -> Card 2
    fireEvent.click(prevBtn);
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('marks card as Got it and advances to next card', () => {
    render(<InChatFlashcardDeckCard deck={mockDeck} />);

    const gotItBtn = screen.getByRole('button', { name: /Got it/i });
    fireEvent.click(gotItBtn);

    // Should have advanced to card 2
    expect(screen.getByText('2 / 3')).toBeInTheDocument();

    // LocalStorage should have saved reviewState
    const saved = JSON.parse(localStorage.getItem('hyades_flashcard_deck_deck-osi-test-123') || '{}');
    expect(saved.reviewState['card-1']).toBe('got_it');
  });

  it('resets deck with Restart Deck button', () => {
    render(<InChatFlashcardDeckCard deck={mockDeck} />);

    // Advance and mark
    const nextBtn = screen.getByLabelText(/Next flashcard/i);
    fireEvent.click(nextBtn);
    expect(screen.getByText('2 / 3')).toBeInTheDocument();

    const restartBtn = screen.getByRole('button', { name: /Restart Deck/i });
    fireEvent.click(restartBtn);

    // Reset to card 1
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('opens and closes focused preview overlay with three separate bottom pills', () => {
    render(<InChatFlashcardDeckCard deck={mockDeck} />);

    expect(screen.queryByTestId('flashcard-study-mode-modal')).not.toBeInTheDocument();

    const studyModeBtn = screen.getByRole('button', { name: /Open in Study Mode/i });
    fireEvent.click(studyModeBtn);

    const overlay = screen.getByTestId('flashcard-study-mode-modal');
    expect(overlay).toBeInTheDocument();

    // Verify progress pill format (e.g. "1 of 3")
    expect(screen.getByText('1 of 3')).toBeInTheDocument();

    // Close preview overlay
    const closeBtn = screen.getByLabelText(/Close study mode/i);
    fireEvent.click(closeBtn);

    expect(screen.queryByTestId('flashcard-study-mode-modal')).not.toBeInTheDocument();
  });

  it('restores review state and current index from localStorage upon remount', () => {
    // Pre-populate localStorage
    localStorage.setItem(
      'hyades_flashcard_deck_deck-osi-test-123',
      JSON.stringify({
        currentIndex: 1,
        reviewState: { 'card-1': 'got_it' },
      })
    );

    render(<InChatFlashcardDeckCard deck={mockDeck} />);

    // Should start at card 2
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(
      screen.getByText('Which layer is responsible for end-to-end data transfer?')
    ).toBeInTheDocument();
  });

  it('renders three separate bottom pill containers in preview overlay and updates progress', () => {
    render(<InChatFlashcardDeckCard deck={mockDeck} />);

    // Open preview overlay
    const studyModeBtn = screen.getByRole('button', { name: /Open in Study Mode/i });
    fireEvent.click(studyModeBtn);

    const overlay = screen.getByTestId('flashcard-study-mode-modal');
    expect(overlay).toBeInTheDocument();

    // Verify 3 distinct pill groups are rendered in the overlay
    const restartPill = screen.getAllByRole('button', { name: /Restart Deck/i })[1];
    expect(restartPill).toBeInTheDocument();

    const progressLabel = screen.getByText('1 of 3');
    expect(progressLabel).toBeInTheDocument();

    const againBtns = screen.getAllByRole('button', { name: /Again/i });
    expect(againBtns.length).toBeGreaterThanOrEqual(2);

    const gotItBtns = screen.getAllByRole('button', { name: /Got it/i });
    expect(gotItBtns.length).toBeGreaterThanOrEqual(2);

    // Mark current card as Got it from preview pill
    fireEvent.click(gotItBtns[1]);

    // Should have advanced to card 2 in progress pill
    expect(screen.getByText('2 of 3')).toBeInTheDocument();

    // Close preview overlay
    const closeBtn = screen.getByLabelText(/Close study mode/i);
    fireEvent.click(closeBtn);
    expect(screen.queryByTestId('flashcard-study-mode-modal')).not.toBeInTheDocument();

    // Deck position in chat remains on card 2
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });
});

