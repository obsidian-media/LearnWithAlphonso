/**
 * Two glyphs the design system's 22 icons do not include: the iPhone's chat bubble (text.bubble.fill) and waveform.
 * Drawn on the same 24 grid, 2px round strokes, coloured by the current text colour, decorative.
 */
export function BubbleGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="currentColor"
      className={className}
      focusable="false"
      aria-hidden="true"
      data-glyph="bubble"
    >
      <path d="M5 3h14a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-6.2l-4.6 4a.8.8 0 0 1-1.3-.6V17H5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z" />
    </svg>
  );
}

export function WaveformGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
      focusable="false"
      aria-hidden="true"
      data-glyph="waveform"
    >
      <path d="M3 10v4M7.5 6v12M12 3v18M16.5 7v10M21 10v4" />
    </svg>
  );
}
