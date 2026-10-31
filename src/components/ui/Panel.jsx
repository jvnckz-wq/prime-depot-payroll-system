'use client';
// White bordered card that holds one section of a page.

import { T } from '@/styles/theme';

export const Panel = ({ children, className = '', style = {}, ...rest }) => (
  <div className={`rounded-md border ${className}`} style={{ backgroundColor: T.surface, borderColor: T.line, ...style }} {...rest}>
    {children}
  </div>
);
