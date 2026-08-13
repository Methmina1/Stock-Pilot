import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Caught by ErrorBoundary:', error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, textAlign: 'center', color: '#a1a1aa', fontFamily: 'var(--mono, monospace)' }}>
          <div style={{ fontSize: 18, marginBottom: 8, color: '#e4e4e7' }}>Something went wrong loading this page.</div>
          <div style={{ fontSize: 13, marginBottom: 20 }}>{this.state.error?.message || 'Unknown error'}</div>
          <button
            className="btn gold"
            onClick={() => { this.handleReset(); window.location.reload(); }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;