import React, { useState, useRef, useCallback } from 'react';
import { ImageSet } from '../types';

interface Props {
  imageSet: ImageSet;
  showClear: boolean;
}

interface ImageOption {
  label: string;
  src: string;
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
  grid4: {
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
  imageSlotWide: {
    gridColumn: 'span 2',
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
    padding: '20px',
    overflow: 'auto'
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
    gap: '16px',
    maxWidth: '95vw',
    maxHeight: '70vh',
    alignItems: 'center',
    justifyContent: 'center'
  },
  lightboxImageWrapper: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    maxWidth: '30vw'
  },
  lightboxImage: {
    maxWidth: '100%',
    maxHeight: '60vh',
    objectFit: 'contain' as const,
    borderRadius: '4px'
  },
  lightboxLabel: {
    color: '#fff',
    fontSize: '12px',
    fontWeight: 600,
    marginTop: '8px',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    textAlign: 'center' as const
  },
  closeHint: {
    color: '#666',
    fontSize: '12px',
    marginTop: '16px'
  },
  // Overlay comparison styles
  overlayContainer: {
    position: 'relative' as const,
    maxWidth: '80vw',
    maxHeight: '60vh',
    overflow: 'hidden',
    borderRadius: '4px',
    cursor: 'ew-resize'
  },
  overlayImageBase: {
    display: 'block',
    maxWidth: '80vw',
    maxHeight: '60vh',
    objectFit: 'contain' as const,
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
  },
  selectorContainer: {
    display: 'flex',
    gap: '24px',
    marginTop: '16px',
    padding: '12px 16px',
    background: '#222',
    borderRadius: '8px'
  },
  selectorGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  selectorLabel: {
    fontSize: '11px',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  selectorButtons: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap'
  },
  selectorButton: {
    padding: '6px 12px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 500,
    transition: 'all 0.2s'
  }
};

export function ImageComparisonRow({ imageSet, showClear }: Props) {
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('overlay');
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [leftImageIndex, setLeftImageIndex] = useState(0);
  const [rightImageIndex, setRightImageIndex] = useState(1);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Build available images list
  const availableImages: ImageOption[] = [];
  if (showClear && imageSet.images.clear) {
    availableImages.push({ label: 'Clear (No Glasses)', src: imageSet.images.clear });
  }
  if (imageSet.images.glare) {
    availableImages.push({ label: 'Glare (Original)', src: imageSet.images.glare });
  }
  if (imageSet.images.geminiResult) {
    availableImages.push({ label: 'Gemini Result', src: imageSet.images.geminiResult });
  }
  if (imageSet.images.humanEdited) {
    availableImages.push({ label: 'Human Edited', src: imageSet.images.humanEdited });
  }

  const openLightbox = () => {
    // Set default comparison: glare vs gemini, or first two available
    const glareIdx = availableImages.findIndex(img => img.label.includes('Glare'));
    const geminiIdx = availableImages.findIndex(img => img.label.includes('Gemini'));
    const humanIdx = availableImages.findIndex(img => img.label.includes('Human'));

    if (glareIdx >= 0 && geminiIdx >= 0) {
      setLeftImageIndex(glareIdx);
      setRightImageIndex(geminiIdx);
    } else if (geminiIdx >= 0 && humanIdx >= 0) {
      setLeftImageIndex(geminiIdx);
      setRightImageIndex(humanIdx);
    } else {
      setLeftImageIndex(0);
      setRightImageIndex(Math.min(1, availableImages.length - 1));
    }
    setSliderPosition(50);
    setIsLightboxOpen(true);
  };

  const closeLightbox = () => {
    setIsLightboxOpen(false);
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

  // Determine grid layout based on whether we have clear image
  const hasClearImage = showClear && imageSet.images.clear;

  // Build slots for grid display - always use 4-column grid
  // For 3-image rows, the first image (glare) spans 2 columns
  const gridSlots = hasClearImage
    ? [
        { label: 'Clear (No Glasses)', src: imageSet.images.clear, wide: false },
        { label: 'Glare (Original)', src: imageSet.images.glare, wide: false },
        { label: 'Gemini Result', src: imageSet.images.geminiResult, wide: false },
        { label: 'Human Edited', src: imageSet.images.humanEdited, wide: false }
      ]
    : [
        { label: 'Glare (Original)', src: imageSet.images.glare, wide: true },
        { label: 'Gemini Result', src: imageSet.images.geminiResult, wide: false },
        { label: 'Human Edited', src: imageSet.images.humanEdited, wide: false }
      ];

  const leftImage = availableImages[leftImageIndex];
  const rightImage = availableImages[rightImageIndex];

  return (
    <div style={styles.container}>
      <div style={styles.header}>{imageSet.name} ({imageSet.id})</div>
      <div style={styles.grid4}>
        {gridSlots.map((slot, i) => (
          <div key={i} style={slot.wide ? styles.imageSlotWide : styles.imageSlot}>
            <div style={styles.label}>{slot.label}</div>
            <div style={styles.imageContainer}>
              {slot.src ? (
                <img
                  src={toThumbnail(slot.src) || slot.src}
                  alt={slot.label}
                  style={styles.image}
                  loading="lazy"
                  onClick={openLightbox}
                />
              ) : (
                <div style={styles.placeholder}>Not available</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {isLightboxOpen && availableImages.length >= 2 && (
        <div
          style={styles.modal}
          onClick={closeLightbox}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div style={styles.modeToggle} onClick={(e) => e.stopPropagation()}>
            <button
              style={{
                ...styles.modeButton,
                ...(viewMode === 'side-by-side' ? styles.modeButtonActive : styles.modeButtonInactive)
              }}
              onClick={() => setViewMode('side-by-side')}
            >
              Side by Side (3)
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

          {viewMode === 'side-by-side' ? (
            <div style={styles.lightboxContainer} onClick={(e) => e.stopPropagation()}>
              {/* Show 3 images: Glare, Gemini, Human */}
              {imageSet.images.glare && (
                <div style={styles.lightboxImageWrapper}>
                  <img src={imageSet.images.glare} alt="Glare" style={styles.lightboxImage} />
                  <div style={styles.lightboxLabel}>Glare (Original)</div>
                </div>
              )}
              {imageSet.images.geminiResult && (
                <div style={styles.lightboxImageWrapper}>
                  <img src={imageSet.images.geminiResult} alt="Gemini" style={styles.lightboxImage} />
                  <div style={styles.lightboxLabel}>Gemini Result</div>
                </div>
              )}
              {imageSet.images.humanEdited && (
                <div style={styles.lightboxImageWrapper}>
                  <img src={imageSet.images.humanEdited} alt="Human" style={styles.lightboxImage} />
                  <div style={styles.lightboxLabel}>Human Edited</div>
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
                {/* Base image (right) - fully visible */}
                <img
                  src={rightImage.src}
                  alt={rightImage.label}
                  style={styles.overlayImageBase}
                  draggable={false}
                />
                {/* Overlay image (left) - clipped by slider */}
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
                    src={leftImage.src}
                    alt={leftImage.label}
                    style={{
                      ...styles.overlayImageBase,
                      maxWidth: 'none',
                      width: overlayRef.current ? `${overlayRef.current.offsetWidth}px` : '80vw'
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

              {/* Image selectors */}
              <div style={styles.selectorContainer}>
                <div style={styles.selectorGroup}>
                  <div style={styles.selectorLabel}>Left Image</div>
                  <div style={styles.selectorButtons}>
                    {availableImages.map((img, idx) => (
                      <button
                        key={idx}
                        style={{
                          ...styles.selectorButton,
                          background: leftImageIndex === idx ? '#4a9eff' : '#444',
                          color: leftImageIndex === idx ? '#fff' : '#aaa'
                        }}
                        onClick={() => setLeftImageIndex(idx)}
                      >
                        {img.label.replace(' (Original)', '').replace(' (No Glasses)', '')}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={styles.selectorGroup}>
                  <div style={styles.selectorLabel}>Right Image</div>
                  <div style={styles.selectorButtons}>
                    {availableImages.map((img, idx) => (
                      <button
                        key={idx}
                        style={{
                          ...styles.selectorButton,
                          background: rightImageIndex === idx ? '#4a9eff' : '#444',
                          color: rightImageIndex === idx ? '#fff' : '#aaa'
                        }}
                        onClick={() => setRightImageIndex(idx)}
                      >
                        {img.label.replace(' (Original)', '').replace(' (No Glasses)', '')}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={styles.overlayLabels}>
                <div style={styles.lightboxLabel}>{leftImage.label}</div>
                <div style={styles.lightboxLabel}>{rightImage.label}</div>
              </div>
            </div>
          )}

          <div style={styles.closeHint}>Click outside to close</div>
        </div>
      )}
    </div>
  );
}
