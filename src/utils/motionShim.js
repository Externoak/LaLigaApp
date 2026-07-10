import React from 'react';

// Minimal shim to replace framer-motion usage without bundling it
export const AnimatePresence = ({ children }) => <>{children}</>;

// Cacheamos el componente generado por cada tag. Sin esto, el Proxy creaba un
// React.forwardRef NUEVO en cada acceso, de modo que <motion.form> (o cualquier
// motion.X) era un TIPO distinto en cada render → React desmontaba y volvía a
// montar el subárbol en cada render, y los inputs controlados dentro (p. ej. el
// email/contraseña del login) perdían el foco tras cada tecla.
const componentCache = new Map();

export const motion = new Proxy({}, {
  get: (_target, tag) => {
    const cached = componentCache.get(tag);
    if (cached) return cached;
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
    componentCache.set(tag, Comp);
    return Comp;
  }
});

