import React from 'react';
import { cn } from '@/lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  className?: string;
  width?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  className = '',
  width = 'md'
}) => {
  React.useEffect(() => {
    if (!isOpen || !onClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const widthClasses = {
    sm: 'w-[400px]',
    md: 'w-[600px]',
    lg: 'w-[800px]',
    xl: 'w-[1000px]',
    full: 'w-full max-w-[95vw]'
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay bg-black/45 backdrop-blur-xs dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) {
          onClose();
        }
      }}
    >
      <div className={cn('dialog-content flex flex-col bg-[#FAF8F2] border border-[#C9C2B0] text-[#1C1917] rounded-2xl shadow-2xl overflow-hidden', widthClasses[width], className)}>
        {children}
      </div>
    </div>
  );
};
