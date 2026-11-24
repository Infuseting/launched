import React from 'react';
import { createLogger } from '../services/logger';

const log = createLogger('ErrorBoundary');

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    log.error(
      `Unhandled React render error (componentStack=${info.componentStack ?? 'unknown'})`,
      error,
    );
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            background: '#111',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            color: 'white',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          <div
            style={{
              textAlign: 'center',
              color: '#ff4444',
              border: '1px solid rgba(255,0,0,0.3)',
              padding: '2rem',
              borderRadius: '12px',
              background: 'rgba(255,0,0,0.05)',
              maxWidth: '460px',
            }}
          >
            <h2 style={{ fontSize: '1.35rem', marginBottom: '0.5rem' }}>
              Erreur critique de l&apos;interface
            </h2>
            <p style={{ opacity: 0.85, fontSize: '0.875rem' }}>
              {this.state.error.message}
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
