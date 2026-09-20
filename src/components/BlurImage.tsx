import { useState, useRef, useEffect } from 'react';

interface BlurImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  /** Optional WebP variant URL for modern browsers */
  webpSrc?: string;
}

export function BlurImage({ src, alt, webpSrc, className = '', style, ...props }: BlurImageProps) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Only use a WebP source when one is explicitly provided — deriving it from the
  // file extension breaks uploads that have no matching .webp file on the server.
  const autoWebp = webpSrc;


  useEffect(() => {
    setLoaded(false);
    if (!src) return;
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true);
    }
  }, [src]);

  const blurStyle: React.CSSProperties = {
    ...style,
    filter: loaded ? 'blur(0)' : 'blur(12px)',
    opacity: loaded ? 1 : 0.6,
    transition: 'filter 0.5s ease-out, opacity 0.5s ease-out',
    willChange: 'filter, opacity',
  };

  return (
    <picture>
      {autoWebp && <source srcSet={autoWebp} type="image/webp" />}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={className}
        style={blurStyle}
        {...props}
      />
    </picture>
  );
}
