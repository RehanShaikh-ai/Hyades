import React from 'react';
import { cn } from '@/lib/utils';

export interface FlowHoverButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

export const FlowHoverButton: React.FC<FlowHoverButtonProps> = ({ icon, children, className, ...props }) => (
  <button
    className={cn(
      'inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#162135] text-[#FAF8F2] hover:bg-[#22324F] transition-colors border border-[#162135] cursor-pointer disabled:opacity-50 disabled:pointer-events-none',
      className
    )}
    {...props}
  >
    {icon}
    {children !== undefined && <span>{children}</span>}
  </button>
);

export const Button = FlowHoverButton;
export default FlowHoverButton;
