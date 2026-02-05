import React, { useEffect, useState } from 'react';
import { fetchImages } from '../api';
import { ImagesResponse } from '../types';
import { ImageComparisonRow } from './ImageComparisonRow';

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '24px',
    maxWidth: '1600px',
    margin: '0 auto'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    flexWrap: 'wrap',
    gap: '12px'
  },
  title: {
    fontSize: '24px',
    fontWeight: 700
  },
  stats: {
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
    color: '#a0a0a0',
    fontSize: '14px'
  },
  section: {
    marginBottom: '32px'
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
    cursor: 'pointer',
    userSelect: 'none' as const
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 600
  },
  count: {
    background: '#2d3748',
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    color: '#a0a0a0'
  },
  chevron: {
    fontSize: '12px',
    color: '#666',
    transition: 'transform 0.2s'
  },
  loading: {
    textAlign: 'center' as const,
    padding: '48px',
    color: '#666'
  },
  error: {
    textAlign: 'center' as const,
    padding: '48px',
    color: '#e53e3e'
  }
};

export function TestResultsTab() {
  const [data, setData] = useState<ImagesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState({
    withReference: true,
    withoutReference: true
  });

  useEffect(() => {
    loadImages();
  }, []);

  async function loadImages() {
    try {
      setLoading(true);
      setError(null);
      const response = await fetchImages();
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load images');
    } finally {
      setLoading(false);
    }
  }

  function toggleSection(section: 'withReference' | 'withoutReference') {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  }

  if (loading) {
    return <div style={styles.loading}>Loading test images...</div>;
  }

  if (error) {
    return <div style={styles.error}>{error}</div>;
  }

  if (!data) {
    return <div style={styles.error}>No data available</div>;
  }

  const geminiCount = {
    withRef: data.withReference.filter(s => s.images.geminiResult).length,
    withoutRef: data.withoutReference.filter(s => s.images.geminiResult).length
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Lumatic Glare Removal - Test Results</h1>
        <div style={styles.stats}>
          <span>
            Gemini: {geminiCount.withRef + geminiCount.withoutRef}/{data.withReference.length + data.withoutReference.length} processed
          </span>
        </div>
      </div>

      <div style={styles.section}>
        <div
          style={styles.sectionHeader}
          onClick={() => toggleSection('withReference')}
        >
          <span style={{
            ...styles.chevron,
            transform: expandedSections.withReference ? 'rotate(90deg)' : 'rotate(0deg)'
          }}>
            ▶
          </span>
          <h2 style={styles.sectionTitle}>With Reference Photos</h2>
          <span style={styles.count}>
            {data.withReference.length} sets · {geminiCount.withRef} processed
          </span>
        </div>
        {expandedSections.withReference && (
          <div>
            {data.withReference.map(set => (
              <ImageComparisonRow key={set.id} imageSet={set} showClear={true} />
            ))}
          </div>
        )}
      </div>

      <div style={styles.section}>
        <div
          style={styles.sectionHeader}
          onClick={() => toggleSection('withoutReference')}
        >
          <span style={{
            ...styles.chevron,
            transform: expandedSections.withoutReference ? 'rotate(90deg)' : 'rotate(0deg)'
          }}>
            ▶
          </span>
          <h2 style={styles.sectionTitle}>Without Reference Photos</h2>
          <span style={styles.count}>
            {data.withoutReference.length} sets · {geminiCount.withoutRef} processed
          </span>
        </div>
        {expandedSections.withoutReference && (
          <div>
            {data.withoutReference.map(set => (
              <ImageComparisonRow key={set.id} imageSet={set} showClear={false} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
