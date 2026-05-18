import React from 'react';

// Minimal shim to replace framer-motion usage without bundling it
export const AnimatePresence = ({ children }) => <>{children}</>;

export const motion = new Proxy({}, {
  get: (_target, tag) => {
    const Element = tag;
    const Comp = React.forwardRef((props, ref) => {
      const {
        initial: _i, animate: _a, exit: _e, transition: _t,
        whileHover: _wh, whileTap: _wt, whileFocus: _wf, whileInView: _wv, whileDrag: _wd,
        layout: _l, layoutId: _lid, variants: _v,
        drag: _d, dragConstraints: _dc, dragElastic: _de, dragMomentum: _dm, dragTransition: _dt, dragSnapToOrigin: _ds,
        onAnimationStart: _oas, onAnimationComplete: _oac, onUpdate: _ou,
        viewport: _vp, custom: _c,
        children, style,
        ...rest
      } = props;
      return <Element ref={ref} style={style} {...rest}>{children}</Element>;
    });
    Comp.displayName = `motion.${String(tag)}`;
    return Comp;
  }
});

