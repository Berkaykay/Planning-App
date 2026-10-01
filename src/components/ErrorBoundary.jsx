import React from 'react';

// Shows a recoverable error message instead of a blank window if part of the UI crashes.
export default class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(error, info.componentStack);
  }

  componentDidUpdate(prev) {
    // Navigating somewhere else gives the page a fresh start.
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.renderFallback) return this.props.renderFallback(error);
    return (
      <div className="empty-page" role="alert">
        <h1>Something went wrong</h1>
        <p className="subtle">{String(error.message || error)}</p>
        <p>Your saved plans are safe.</p>
        <div className="card-actions">
          {this.props.onBack && <button onClick={this.props.onBack}>Go back</button>}
          <button className="primary" onClick={() => (this.props.onHome ? this.props.onHome() : this.setState({ error: null }))}>
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }
}
