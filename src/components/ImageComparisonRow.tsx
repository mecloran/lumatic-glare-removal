import React, { useState, useRef, useCallback } from 'react';
import { ImageSet } from '../types';

interface Props {
  imageSet: ImageSet;
  showClear: boolean;
}

interface LightboxState {
  leftImage: string;
  rightImage: string;
  leftLabel: string;
  rightLabel: string;
}

type ViewMode = 'side-by-side' | 'overlay';

// Convert full image URL to thumbnail URL
function toThumbnail(url: string | null): string | null {
  if (!url) return null;
  return `/api/thumbnail?src=${encodeURIComponent(url)}`;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: '#16213e',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px'
  },
  header: {
    fontSize: '14px',
    fontWeight: 600,
    marginBottom: '12px',
    color: '#a0a0a0'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '12px'
  },
  imageSlot: {
    aspectRatio: '3/4',
    background: '#0f0f23',
    borderRadius: '6px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column'
  },
  label: {
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    padding: '6px 8px',
    background: '#1a1a2e',
    color: '#888'
  },
  imageContainer: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px'
  },
  image: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    cursor: 'pointer',
    borderRadius: '4px'
  },
  placeholder: {
    color: '#444',
    fontSize: '12px',
    textAlign: 'center' as const
  },
  modal: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.95)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px'
  },
  modeToggle: {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px'
  },
  modeButton: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    transition: 'all 0.2s'
  },
  modeButtonActive: {
    background: '#4a9eff',
    color: '#fff'
  },
  modeButtonInactive: {
    background: '#333',
    color: '#888'
  },
  lightboxContainer: {
    display: 'flex',
    gap: '20px',
    maxWidth: '95vw',
    maxHeight: '80vh',
    alignItems: 'center',
    justifyContent: 'center'
  },
  lightboxImageWrapper: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    maxWidth: '45vw'
  },
  lightboxImage: {
    maxWidth: '100%',
    maxHeight: '70vh',
    objectFit: 'contain' as const,
    borderRadius: '4px'
  },
  lightboxLabel: {
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    marginTop: '12px',
    textTransform: 'uppercase',
    letterSpacing: '1px'
  },
  closeHint: {
    color: '#666',
    fontSize: '12px',
    marginTop: '20px'
  },
  // Overlay comparison styles
  overlayContainer: {
    position: 'relative' as const,
    maxWidth: '90vw',
    maxHeight: '75vh',
    overflow: 'hidden',
    borderRadius: '4px',
    cursor: 'ew-resize'
  },
  overlayImageBase: {
    display: 'block',
    maxWidth: '90vw',
    maxHeight: '75vh',
    objectFit: 'contain' as const,
    userSelect: 'none' as const
  },
  overlayImageTop: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    height: '100%',
    objectFit: 'cover' as const,
    objectPosition: 'left',
    userSelect: 'none' as const
  },
  sliderLine: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    width: '3px',
    background: '#fff',
    boxShadow: '0 0 8px rgba(0,0,0,0.5)',
    cursor: 'ew-resize',
    zIndex: 10
  },
  sliderHandle: {
    position: 'absolute' as const,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '40px',
    height: '40px',
    background: '#fff',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    cursor: 'ew-resize'
  },
  sliderArrows: {
    color: '#333',
    fontSize: '16px',
    fontWeight: 'bold',
    userSelect: 'none' as const
  },
  overlayLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: '12px',
    padding: '0 20px'
  }
};

export function ImageComparisonRow({ imageSet, showClear }: Props) {
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('overlay');
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleImageClick = (slotLabel: string, fullSrc: string | null) => {
    if (!fullSrc) return;

    const { glare, geminiResult, humanEdited } = imageSet.images;

    if (slotLabel === 'Glare (Original)') {
      if (geminiResult) {
        setLightbox({
          leftImage: fullSrc,
          rightImage: geminiResult,
          leftLabel: 'Original (Glare)',
          rightLabel: 'Gemini Result'
        });
      } else {
        setLightbox({
          leftImage: fullSrc,
          rightImage: fullSrc,
          leftLabel: 'Original (Glare)',
          rightLabel: ''
        });
      }
    } else if (slotLabel === 'Gemini Result' || slotLabel === 'Human Edited') {
      if (geminiResult && humanEdited) {
        setLightbox({
          leftImage: geminiResult,
          rightImage: humanEdited,
          leftLabel: 'Gemini Result',
          rightLabel: 'Human Edited'
        });
      } else if (geminiResult && !humanEdited) {
        setLightbox({
          leftImage: glare || fullSrc,
          rightImage: geminiResult,
          leftLabel: 'Original (Glare)',
          rightLabel: 'Gemini Result'
        });
      } else if (!geminiResult && humanEdited) {
        setLightbox({
          leftImage: glare || fullSrc,
          rightImage: humanEdited,
          leftLabel: 'Original (Glare)',
          rightLabel: 'Human Edited'
        });
      }
    } else {
      setLightbox({
        leftImage: fullSrc,
        rightImage: fullSrc,
        leftLabel: slotLabel,
        rightLabel: ''
      });
    }
    setSliderPosition(50);
  };

  const closeLightbox = () => {
    setLightbox(null);
    setIsDragging(false);
  };

  const handleSliderMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percentage);
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const x = e.touches[0].clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percentage);
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const slots = [
    { label: 'Clear (No Glasses)', src: showClear ? imageSet.images.clear : null, showPlaceholder: !showClear },
    { label: 'Glare (Original)', src: imageSet.images.glare },
    { label: 'Gemini Result', src: imageSet.images.geminiResult },
    { label: 'Human Edited', src: imageSet.images.humanEdited }
  ];

  const hasTwoImages = lightbox && lightbox.rightLabel && lightbox.leftImage !== lightbox.rightImage;

  return (
    <div style={styles.container}>
      <div style={styles.header}>{imageSet.name} ({imageSet.id})</div>
      <div style={styles.grid}>
        {slots.map((slot, i) => (
          <div key={i} style={styles.imageSlot}>
            <div style={styles.label}>{slot.label}</div>
            <div style={styles.imageContainer}>
              {slot.src ? (
                <img
                  src={toThumbnail(slot.src) || slot.src}
                  alt={slot.label}
                  style={styles.image}
                  loading="lazy"
                  onClick={() => handleImageClick(slot.label, slot.src)}
                />
              ) : (
                <div style={styles.placeholder}>
                  {slot.showPlaceholder ? 'N/A' : 'Not available'}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {lightbox && (
        <div
          style={styles.modal}
          onClick={closeLightbox}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {hasTwoImages && (
            <div style={styles.modeToggle} onClick={(e) => e.stopPropagation()}>
              <button
                style={{
                  ...styles.modeButton,
                  ...(viewMode === 'side-by-side' ? styles.modeButtonActive : styles.modeButtonInactive)
                }}
                onClick={() => setViewMode('side-by-side')}
              >
                Side by Side
              </button>
              <button
                style={{
                  ...styles.modeButton,
                  ...(viewMode === 'overlay' ? styles.modeButtonActive : styles.modeButtonInactive)
                }}
                onClick={() => setViewMode('overlay')}
              >
                Overlay Slider
              </button>
            </div>
          )}

          {viewMode === 'side-by-side' || !hasTwoImages ? (
            <div style={styles.lightboxContainer} onClick={(e) => e.stopPropagation()}>
              <div style={styles.lightboxImageWrapper}>
                <img src={lightbox.leftImage} alt={lightbox.leftLabel} style={styles.lightboxImage} />
                <div style={styles.lightboxLabel}>{lightbox.leftLabel}</div>
              </div>
              {hasTwoImages && (
                <div style={styles.lightboxImageWrapper}>
                  <img src={lightbox.rightImage} alt={lightbox.rightLabel} style={styles.lightboxImage} />
                  <div style={styles.lightboxLabel}>{lightbox.rightLabel}</div>
                </div>
              )}
            </div>
          ) : (
            <div onClick={(e) => e.stopPropagation()}>
              <div
                ref={overlayRef}
                style={styles.overlayContainer}
                onMouseDown={handleSliderMouseDown}
                onTouchStart={handleTouchStart}
              >
                {/* Base image (right/second image) - fully visible */}
                <img
                  src={lightbox.rightImage}
                  alt={lightbox.rightLabel}
                  style={styles.overlayImageBase}
                  draggable={false}
                />
                {/* Overlay image (left/first image) - clipped by slider */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: `${sliderPosition}%`,
                    height: '100%',
                    overflow: 'hidden'
                  }}
                >
                  <img
                    src={lightbox.leftImage}
                    alt={lightbox.leftLabel}
                    style={{
                      ...styles.overlayImageBase,
                      maxWidth: 'none',
                      width: overlayRef.current ? `${overlayRef.current.offsetWidth}px` : '90vw'
                    }}
                    draggable={false}
                  />
                </div>
                {/* Slider line and handle */}
                <div
                  style={{
                    ...styles.sliderLine,
                    left: `${sliderPosition}%`,
                    transform: 'translateX(-50%)'
                  }}
                >
                  <div style={styles.sliderHandle}>
                    <span style={styles.sliderArrows}>◀ ▶</span>
                  </div>
                </div>
              </div>
              <div style={styles.overlayLabels}>
                <div style={styles.lightboxLabel}>{lightbox.leftLabel}</div>
                <div style={styles.lightboxLabel}>{lightbox.rightLabel}</div>
              </div>
            </div>
          )}

          <div style={styles.closeHint}>Click outside to close</div>
        </div>
      )}
    </div>
  );
}
