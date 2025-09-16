import React from 'react';

// Minimal shim to replace framer-motion usage without bundling it
export const AnimatePresence = ({ children }) => <>{children}</>;

export const motion = new Proxy({}, {
  get: (_target, tag) => {
    const Element = tag;
    const Comp = React.forwardRef(({ children, style, ...rest }, ref) => (
      <Element ref={ref} style={style} {...rest}>{children}</Element>
    ));
    Comp.displayName = `motion.${String(tag)}`;
    return Comp;
  }
});

